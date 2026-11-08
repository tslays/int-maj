/**
 * The board: every tile on the table, kept equal to the latest game payload.
 *
 * `reconcile(payload)` compares the payload with what is on the table and
 * animates only the difference: a longer discard row is a throw, a discard
 * that disappears was claimed and flies to the claimer, a new meld drops in,
 * a bigger hand is a draw. Anything it cannot explain (a new hand, an undo)
 * is rebuilt in place. The screen therefore cannot drift from the game.
 *
 * Seats are placed relative to you: rel 0 is your seat at the bottom, rel 1
 * the seat to your right, rel 2 opposite, rel 3 on your left. Each has a frame
 * turned about the table's centre, laid out as if it were the bottom seat.
 */

import * as THREE from "three";
import { D, H, W, TABLE, makeTile, poseFaceUp, poseFaceDown, tileOrder, jitter } from "./tiles.js";
import { discardSlot, meldLayout, wallSlotX } from "./layout.js";
import {
  animate,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  handCamera,
  handScene,
  renderer,
  requestRender,
  setHandRowWidth,
  tableScene,
  tween,
  viewport,
} from "./stage.js";

const SEATS = ["E", "S", "W", "N"];
const { WALL_STACKS, WALL_R, HAND_Z, DISCARD_Z, DISCARD_SCALE } = TABLE;
const GAP = 0.02;
const HAND_TILT = -0.16;

/** Lay a meld's tiles in a row; a concealed kong shows its ends face down. */
function meldTiles(meld, scale) {
  return meld.tiles.map((key, index) => {
    const hidden = !meld.exposed && meld.kind === "kong" && (index === 0 || index === 3);
    return { key: hidden ? null : key, faceUp: !hidden, scale };
  });
}

export class Board {
  constructor() {
    this.me = "E";
    this.handId = null;
    this.frames = [0, 1, 2, 3].map((rel) => {
      const frame = new THREE.Group();
      frame.rotation.y = (rel * Math.PI) / 2;
      tableScene.add(frame);
      return frame;
    });
    this.seats = {};
    this.wallOrder = [];
    this.wallShown = 0;
    this.handGroup = new THREE.Group();
    handScene.add(this.handGroup);
    this.hand = []; // { key, tile, drawn }
    this.lastThrowX = 0;
    this.raycaster = new THREE.Raycaster();
  }

  rel(seat) {
    return (SEATS.indexOf(seat) - SEATS.indexOf(this.me) + 4) % 4;
  }

  frameOf(seat) {
    return this.frames[this.rel(seat)];
  }

  /* ------------------------------------------------------- whole table */

  clear() {
    for (const frame of this.frames) frame.clear();
    this.handGroup.clear();
    this.hand = [];
    this.seats = {};
    for (const seat of SEATS) {
      this.seats[seat] = {
        discards: [],
        callCount: 0,
        backs: -1,
        row: new THREE.Group(),
        melds: new THREE.Group(),
        meldsKey: "",
      };
      this.frameOf(seat).add(this.seats[seat].row, this.seats[seat].melds);
    }
    this.wallOrder = [];
    this.wallShown = 0;
    this.wallSides = [[], [], [], []];
  }

  /** 72 stacks of two in a pinwheel; drawing starts at a break that moves each hand. */
  buildWall(seedOffset) {
    const stacks = [];
    for (let rel = 0; rel < 4; rel++) {
      for (let stack = 0; stack < WALL_STACKS; stack++) {
        const x = wallSlotX(stack);
        const tiles = [0, 1].map((level) => {
          const tile = poseFaceDown(makeTile(null), x, D / 2 + level * D, WALL_R);
          this.frames[rel].add(tile);
          return tile;
        });
        stacks.push(tiles);
        this.wallSides[rel].push(tiles);
      }
    }
    const breakAt = (seedOffset * 23 + 2 * WALL_STACKS + 7) % stacks.length;
    const ordered = [...stacks.slice(breakAt), ...stacks.slice(0, breakAt)];
    // The top tile of a stack is taken before the one beneath it.
    this.wallOrder = ordered.flatMap(([bottom, top]) => [top, bottom]);
    this.wallShown = this.wallOrder.length;
  }

  /** Show `count` wall tiles; tiles taken since the last answer lift away. */
  setWall(count, animated) {
    const hideUpTo = this.wallOrder.length - Math.max(0, Math.min(count, this.wallOrder.length));
    const shownFrom = this.wallOrder.length - this.wallShown;
    const work = [];
    for (let index = 0; index < this.wallOrder.length; index++) {
      const tile = this.wallOrder[index];
      const visible = index >= hideUpTo;
      if (tile.visible === visible) continue;
      if (!visible && animated && index >= shownFrom && hideUpTo - shownFrom <= 4) {
        const restY = tile.position.y;
        work.push(
          tween(tile.position, { y: restY + 1.2 }, 180, easeOutCubic).then(() => {
            tile.visible = false;
            tile.position.y = restY;
          }),
        );
      } else {
        tile.visible = visible;
      }
    }
    this.wallShown = Math.max(0, Math.min(count, this.wallOrder.length));
    // Each side's remaining stacks are pushed to that side's right end, as
    // players push their wall, so the lane for melds grows at its left.
    const willShow = new Set(this.wallOrder.slice(hideUpTo));
    this.wallStacks = this.wallSides.map((side) => {
      const standing = side.filter((tiles) => tiles.some((tile) => willShow.has(tile)));
      standing.forEach((tiles, slot) => {
        for (const tile of tiles) tile.position.x = wallSlotX(slot);
      });
      return standing.length;
    });
    return work;
  }

  /**
   * Bring the table in line with `payload`. Resolves when every animation it
   * started has finished. Returns what happened worth announcing.
   */
  async reconcile(payload, { animated = true } = {}) {
    this.me = payload.seat;
    const handId = `${payload.game}:${payload.view.handNumber}`;
    if (handId !== this.handId) {
      this.handId = handId;
      this.clear();
      this.buildWall(payload.view.handNumber);
      animated = false;
    }
    const calls = [];
    const work = [];
    const meldsGrew = new Map();
    for (const entry of payload.table) {
      const state = this.seats[entry.seat];
      if (entry.melds.length > state.callCount && animated) {
        const added = entry.melds[entry.melds.length - 1];
        meldsGrew.set(entry.seat, added);
        calls.push({ seat: entry.seat, kind: added.kind });
      }
      state.callCount = entry.melds.length;
    }

    // The wall first: where it stands decides how much lane the melds have.
    const wall = payload.wall.remaining + payload.wall.loose + payload.wall.dead;
    work.push(...this.setWall(wall, animated));
    for (const entry of payload.table) {
      work.push(...this.reconcileDiscards(entry, meldsGrew, animated));
    }
    for (const entry of payload.table) {
      if (entry.seat !== this.me) work.push(...this.reconcileRow(entry, animated));
      work.push(...this.reconcileMelds(entry, meldsGrew.has(entry.seat)));
    }
    work.push(...this.reconcileHand(payload, animated));
    requestRender();
    await Promise.all(work);
    return calls;
  }

  /* ------------------------------------------------------- discards */

  reconcileDiscards(entry, meldsGrew, animated) {
    const state = this.seats[entry.seat];
    const before = state.discards.map((item) => item.key);
    const after = entry.discards;
    const work = [];
    const samePrefix = (length) => before.slice(0, length).every((key, index) => key === after[index]);

    if (after.length >= before.length && samePrefix(before.length)) {
      for (let index = before.length; index < after.length; index++) {
        work.push(this.addDiscard(entry.seat, after[index], index, animated && after.length - before.length <= 2));
      }
    } else if (after.length === before.length - 1 && samePrefix(after.length)) {
      const taken = state.discards.pop();
      const claimer = [...meldsGrew.keys()].find((seat) => seat !== entry.seat) ?? null;
      work.push(animated && claimer !== null ? this.flyToClaimer(taken.tile, claimer) : Promise.resolve(taken.tile.removeFromParent()));
    } else {
      for (const item of state.discards) item.tile.removeFromParent();
      state.discards = [];
      after.forEach((key, index) => work.push(this.addDiscard(entry.seat, key, index, false)));
    }
    return work;
  }

  addDiscard(seat, key, index, animated) {
    const state = this.seats[seat];
    const slot = discardSlot(index);
    const tile = makeTile(key);
    const rest = poseFaceUp(new THREE.Object3D(), slot.x, slot.z, index * 7 + SEATS.indexOf(seat), DISCARD_SCALE);
    tile.scale.copy(rest.scale);
    this.frameOf(seat).add(tile);
    state.discards.push({ key, tile });
    if (!animated) {
      tile.position.copy(rest.position);
      tile.rotation.copy(rest.rotation);
      return Promise.resolve();
    }
    // Thrown from the seat's hand, in an arc, turning face up as it lands.
    const fromX = seat === this.me ? this.lastThrowX * 0.45 : 0;
    const from = new THREE.Vector3(fromX, 1.4, HAND_Z - (seat === this.me ? -0.5 : 0.8));
    tile.position.copy(from);
    tile.rotation.set(seat === this.me ? -0.35 : 0.2, 0, 0);
    const startRotation = tile.rotation.clone();
    return animate(400, (t) => {
      const k = easeOutCubic(t);
      tile.position.lerpVectors(from, rest.position, k);
      tile.position.y += Math.sin(Math.PI * Math.min(1, t * 1.1)) * 1.4;
      tile.rotation.x = startRotation.x + (rest.rotation.x - startRotation.x) * easeInOutCubic(t);
      tile.rotation.z = startRotation.z + (rest.rotation.z - startRotation.z) * k;
    }).then(() => {
      const y = rest.position.y;
      return tween(tile.position, { y: y + 0.05 }, 60).then(() => tween(tile.position, { y }, 90));
    });
  }

  /** A claimed discard flies from the heap towards the claimer and goes into the meld. */
  flyToClaimer(tile, claimer) {
    tableScene.attach(tile);
    const target = this.meldTarget(claimer);
    const from = tile.position.clone();
    return animate(360, (t) => {
      const k = easeInOutCubic(t);
      tile.position.lerpVectors(from, target, k);
      tile.position.y += Math.sin(Math.PI * t) * 1.2;
      tile.scale.setScalar(DISCARD_SCALE * (1 - 0.3 * k));
    }).then(() => tile.removeFromParent());
  }

  /* ------------------------------------------------------- opponents */

  /** An opponent's concealed hand, standing at the table's edge, backs towards you. */
  reconcileRow(entry, animated) {
    const state = this.seats[entry.seat];
    const grewBy = entry.handCount - state.backs;
    if (grewBy === 0) return [];
    state.backs = entry.handCount;
    const row = state.row;
    row.clear();
    const work = [];
    const start = -((entry.handCount - 1) / 2) * (W + GAP);
    for (let index = 0; index < entry.handCount; index++) {
      const tile = makeTile(null);
      tile.position.set(start + index * (W + GAP), H / 2, HAND_Z);
      row.add(tile);
      if (animated && grewBy === 1 && index === entry.handCount - 1) {
        tile.position.y += 0.9;
        work.push(tween(tile.position, { y: H / 2 }, 220, easeOutCubic));
      }
    }
    return work;
  }

  /** The groups a seat has laid out: its bonus tiles first, then its melds in order. */
  exposedGroups(entry) {
    const bonus = [...entry.flowers, ...entry.seasons].sort();
    const groups = bonus.length > 0 ? [bonus.map((key) => ({ key, faceUp: true }))] : [];
    return [...groups, ...entry.melds.map((meld) => meldTiles(meld, 1))];
  }

  /**
   * Every seat's melds and bonus tiles, face up in its own wall's lane: from
   * the table corner on its left, each new meld to the right of the last.
   */
  reconcileMelds(entry, fresh) {
    const state = this.seats[entry.seat];
    const groups = this.exposedGroups(entry);
    const key = JSON.stringify([groups, this.wallStacks?.[this.rel(entry.seat)] ?? 18]);
    if (key === state.meldsKey) return [];
    state.meldsKey = key;
    state.melds.clear();
    if (groups.length === 0) return [];
    const work = [];
    const bonusFirst = entry.flowers.length + entry.seasons.length > 0;
    const { scale, tiles } = meldLayout(
      groups.map((group) => group.length),
      this.wallStacks?.[this.rel(entry.seat)] ?? WALL_STACKS,
      entry.handCount,
      { bonusFirst },
    );
    for (const place of tiles) {
      const piece = groups[place.group][place.index];
      const tile = makeTile(piece.key);
      if (piece.faceUp) poseFaceUp(tile, place.x, place.z, place.group * 5 + place.index, scale);
      else poseFaceDown(tile, place.x, (D / 2) * scale, place.z, scale);
      state.melds.add(tile);
      if (fresh && place.group === groups.length - 1) {
        const y = tile.position.y;
        tile.position.y = y + 1.6;
        work.push(tween(tile.position, { y }, 300, easeOutBack));
      }
    }
    return work;
  }

  /** Where a seat's newest meld lands, in table space: the end of its lane. */
  meldTarget(seat) {
    const state = this.seats[seat];
    const count = Math.max(1, state?.callCount ?? 1);
    const place = meldLayout(new Array(count).fill(3), this.wallStacks?.[this.rel(seat)] ?? WALL_STACKS, 8).tiles.at(-1);
    return this.frameOf(seat).localToWorld(new THREE.Vector3(place.x, 1.2, place.z));
  }

  /* ------------------------------------------------------- your hand */

  reconcileHand(payload, animated) {
    const view = payload.view;
    const keys = [...view.player.hand];
    const ownTurn = view.phase === "discard" && view.turn === this.me;
    let drawnKey = null;
    if (ownTurn && view.lastDraw !== null && view.lastDraw.seat === this.me && keys.includes(view.lastDraw.tile)) {
      drawnKey = view.lastDraw.tile;
    }
    const plain = [...keys];
    if (drawnKey !== null) plain.splice(plain.indexOf(drawnKey), 1);
    plain.sort((a, b) => tileOrder(a) - tileOrder(b));

    // Keep the tile objects still in the hand; a newly drawn tile is always new.
    const pool = [...this.hand];
    const take = (key, drawn) => {
      let index = pool.findIndex((entry) => entry.key === key && entry.drawn === drawn);
      if (index < 0 && !drawn) index = pool.findIndex((entry) => entry.key === key);
      return index < 0 ? null : pool.splice(index, 1)[0];
    };
    const next = [];
    const fresh = new Set();
    const order = plain.map((key) => [key, false]);
    if (drawnKey !== null) order.push([drawnKey, true]);
    for (const [key, drawn] of order) {
      let entry = take(key, drawn);
      if (entry === null) {
        entry = { key, tile: makeTile(key, { shadows: false }), drawn };
        entry.tile.rotation.x = HAND_TILT;
        this.handGroup.add(entry.tile);
        fresh.add(entry);
      }
      entry.drawn = drawn;
      next.push(entry);
    }
    for (const entry of pool) entry.tile.removeFromParent();
    this.hand = next;

    const work = this.layoutHand(fresh, animated);

    return work;
  }

  /** Positions of the hand tiles, with the drawn tile set apart. */
  handPlaces() {
    const gap = 0.04;
    const drawnGap = 0.45;
    const plain = this.hand.filter((entry) => !entry.drawn);
    const handWidth = plain.length * (W + gap) - gap + drawnGap + W;
    const total = handWidth;
    let x = -total / 2 + W / 2;
    const places = new Map();
    for (const entry of plain) {
      places.set(entry, x);
      x += W + gap;
    }
    const drawn = this.hand.find((entry) => entry.drawn);
    if (drawn) places.set(drawn, x - gap + drawnGap);
    return { places, total };
  }

  layoutHand(fresh, animated) {
    const { places, total } = this.handPlaces();
    setHandRowWidth(total);
    const work = [];
    for (const entry of this.hand) {
      const x = places.get(entry);
      if (fresh.has(entry)) {
        entry.tile.position.set(x + (entry.drawn ? 1.4 : 0), animated ? 0.9 : 0, 0);
        if (animated) work.push(tween(entry.tile.position, { x, y: 0 }, 260, easeOutCubic));
        continue;
      }
      const position = entry.tile.position;
      if (Math.abs(position.x - x) > 1e-3 || Math.abs(position.y) > 1e-3) {
        if (animated) work.push(tween(position, { x, y: 0 }, 220, easeOutCubic));
        else position.set(x, 0, 0);
      }
    }
    return work;
  }

  /* ------------------------------------------------------- input */

  /** The hand tile under a pointer event, or null. */
  pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const fromBottom = rect.bottom - event.clientY;
    if (fromBottom > viewport.strip) return null;
    const pointer = new THREE.Vector2((x / rect.width) * 2 - 1, (fromBottom / viewport.strip) * 2 - 1);
    this.raycaster.setFromCamera(pointer, handCamera);
    const hits = this.raycaster.intersectObjects(this.handGroup.children, true);
    if (hits.length === 0) return null;
    let object = hits[0].object;
    while (object.parent !== this.handGroup) object = object.parent;
    return this.hand.find((entry) => entry.tile === object) ?? null;
  }

  lift(entry, up) {
    return tween(entry.tile.position, { y: up ? 0.32 : 0 }, 140, easeOutCubic);
  }

  /** Remember where the tile you throw left the hand, so its arc starts there. */
  noteThrow(entry) {
    this.lastThrowX = entry.tile.position.x;
  }

  /** Where a seat sits, for placing call-outs: a point on the table in world space. */
  seatPoint(seat) {
    const point = new THREE.Vector3(0, 1.5, this.rel(seat) === 0 ? WALL_R - 1.6 : HAND_Z - 2.6);
    return this.frameOf(seat).localToWorld(point);
  }
}

export { jitter };
