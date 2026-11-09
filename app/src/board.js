/**
 * The board: every tile on the table, kept equal to the latest game payload.
 *
 * `reconcile(payload)` compares the payload with what is on the table and
 * animates only the difference: a longer discard row is a throw, a discard
 * that disappears was claimed and flies to the claimer, a new meld drops in,
 * a bigger hand is a draw. Anything it cannot explain (a new hand)
 * is rebuilt in place. The screen therefore cannot drift from the game.
 *
 * Seats are placed relative to you: rel 0 is your seat at the bottom, rel 1
 * the seat to your right, rel 2 opposite, rel 3 on your left. Each has a frame
 * turned about the table's centre, laid out as if it were the bottom seat.
 */

import * as THREE from "three";
import { D, H, W, TABLE, makeTile, roundedRect, markTile, markMaterial, markFillMaterial, markHaloMaterial, poseFaceUp, poseFaceDown, tileOrder, jitter } from "./tiles.js";
import { HAND_LIFT, breakFor, handTileStart, discardSlot, latestPlate, meldLayout, pondPad, wallLook, wallPlan, wallSlotX } from "./layout.js";
import { sound } from "./sound.js";
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

/**
 * Lay a meld's tiles in a row; a kong is a pung with its fourth tile on top of
 * the middle one, and a concealed kong shows its two outer tiles face down.
 */
function meldTiles(meld, scale) {
  return meld.tiles.map((key, index) => {
    const hidden = !meld.exposed && meld.kind === "kong" && (index === 0 || index === 2);
    return { key: hidden ? null : key, faceUp: !hidden, scale };
  });
}

/* Who threw what, at a glance: a faint pad tints each seat's pond (coral for the
   dealer, as on the console), and the latest discard lies on a soft cyan plate,
   the same light as the console's turn light. Both are still, flat on the felt. */
const padMaterials = { dealer: new THREE.MeshBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.13, depthWrite: false }),
  other: new THREE.MeshBasicMaterial({ color: 0xcfe8e6, transparent: true, opacity: 0.07, depthWrite: false }) };
const plateMaterial = new THREE.MeshBasicMaterial({ color: 0x62f2ea, transparent: true, opacity: 0.55, depthWrite: false });

function flatPlate(box, material, radius, y) {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(box.width, box.depth, radius), 6), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(box.x, y, box.z);
  mesh.renderOrder = 1;
  return mesh;
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
    this.wall = null;
    this.handGroup = new THREE.Group();
    handScene.add(this.handGroup);
    this.hand = []; // { key, tile, drawn }
    this.custom = false; // true once you have arranged the hand yourself
    this.lastThrowX = 0;
    this.raycaster = new THREE.Raycaster();
    this.marked = [];
    this.markId = 0;
  }

  rel(seat) {
    return (SEATS.indexOf(seat) - SEATS.indexOf(this.me) + 4) % 4;
  }

  frameOf(seat) {
    return this.frames[this.rel(seat)];
  }

  /** Where a seat sounds from: the side you hear it on, and how far off it is. */
  ear(seat) {
    const rel = this.rel(seat);
    return { pan: rel === 1 ? 0.55 : rel === 3 ? -0.55 : 0, far: rel === 0 ? 0 : rel === 2 ? 1 : 0.5 };
  }

  /* ------------------------------------------------------- whole table */

  clear() {
    for (const frame of this.frames) frame.clear();
    this.handGroup.clear();
    this.hand = [];
    this.setCustom(false);
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
      const pad = flatPlate(pondPad(), padMaterials.other, 0.35, 0.008);
      this.seats[seat].pad = pad;
      this.frameOf(seat).add(pad, this.seats[seat].row, this.seats[seat].melds);
    }
    this.plate = null;
    this.wall = null;
  }

  /**
   * 72 stacks of two, four walls of 18, broken where the book's dice put the
   * break (see `breakFor`, `wallPlan`). The break stack is lifted off; its two
   * tiles are the loose tiles, which lie on the dead wall's end column, the one
   * touching the break (two more meshes, `markers`). Nothing on the wall ever moves.
   */
  buildWall(key, dealer = "E") {
    const tiles = new Map();
    const at = (entry) => tiles.get(`${entry.rel}:${entry.slot}:${entry.level}`);
    for (let rel = 0; rel < 4; rel++) {
      for (let stack = 0; stack < WALL_STACKS; stack++) {
        for (const level of [0, 1]) {
          const tile = poseFaceDown(makeTile(null), wallSlotX(stack), D / 2 + level * D, WALL_R);
          this.frames[rel].add(tile);
          tiles.set(`${rel}:${stack}:${level}`, tile);
        }
      }
    }
    const { wallSeat, count } = breakFor(key);
    const builder = SEATS[(SEATS.indexOf(dealer) + wallSeat) % 4];
    const plan = wallPlan(this.rel(builder), count);
    const markers = { far: null, near: null };
    for (const which of ["far", "near"]) {
      markers[which] = poseFaceDown(makeTile(null), 0, 0, WALL_R);
      markers[which].visible = false;
      this.frames[plan.rel].add(markers[which]);
    }
    for (const level of [0, 1]) at({ ...plan.lifted, level }).visible = false; // the break stack is lifted off
    this.wall = {
      plan,
      tiles: plan.tiles.map(at),
      markers,
      goneHead: 0,
      goneTail: 0,
      held: 0,
      used: 0,
      extent: [WALL_STACKS, WALL_STACKS, WALL_STACKS, WALL_STACKS],
    };
  }

  /**
   * Show the wall as the engine's counts say (`wallLook`): `front` tiles gone
   * from the open end, `used` loose tiles consumed, `held` loose tiles lying
   * on the block. Tiles that go vanish where they stand; the loose tiles
   * (re)appear on top of their stacks. Only the draw itself moves.
   */
  setWall(front, used, held, animated) {
    const wall = this.wall;
    const look = wallLook(wall.plan, front, used, held);
    const work = [];
    const changed =
      look.goneHead - wall.goneHead + (look.goneTail - wall.goneTail) + Math.abs(held - wall.held);
    const lift = (tile) => {
      const restY = tile.position.y;
      work.push(
        tween(tile.position, { y: restY + 1.2 }, 180, easeOutCubic).then(() => {
          tile.visible = false;
          tile.position.y = restY;
        }),
      );
    };
    const apply = (list, head, tail) => {
      list.forEach((tile, index) => {
        const visible = index >= head && index < list.length - tail;
        if (tile.visible === visible) return;
        if (!visible && animated && changed <= 4) lift(tile);
        else tile.visible = visible;
      });
    };
    apply(wall.tiles, look.goneHead, look.goneTail);
    // Loose tiles: new ones are set down on top; one used lifts away.
    const arrived = held - (wall.held - (used - wall.used));
    for (const which of ["far", "near"]) {
      const tile = wall.markers[which];
      const place = look.markers.find((marker) => marker.which === which);
      if (!place) {
        if (tile.visible) {
          if (animated && changed <= 4) lift(tile);
          else tile.visible = false;
        }
        continue;
      }
      const wasHere =
        tile.visible && tile.userData.rel === place.rel && tile.userData.slot === place.slot && tile.userData.level === place.level;
      // Past the wall's corner the end column is on the neighbouring wall.
      if (tile.parent !== this.frames[place.rel]) this.frames[place.rel].add(tile);
      tile.userData.rel = place.rel;
      tile.position.set(wallSlotX(place.slot), D / 2 + place.level * D, WALL_R);
      tile.userData.slot = place.slot;
      tile.userData.level = place.level;
      const restY = tile.position.y;
      const dropIn = animated && arrived > 0 && changed <= 4;
      tile.visible = true;
      if (dropIn || (!wasHere && animated && changed <= 4)) {
        tile.position.y = restY + 0.8;
        work.push(tween(tile.position, { y: restY }, 220, easeOutCubic));
      }
    }
    Object.assign(wall, { goneHead: look.goneHead, goneTail: look.goneTail, held, used });
    // The lane for melds is whatever is free at a wall's left end: one more
    // than the highest slot with anything standing on it.
    const extent = [0, 0, 0, 0];
    const note = (rel, slot) => {
      extent[rel] = Math.max(extent[rel], slot + 1);
    };
    wall.plan.tiles.slice(look.goneHead, wall.plan.tiles.length - look.goneTail).forEach((entry) => note(entry.rel, entry.slot));
    for (const place of look.markers) note(place.rel, place.slot);
    wall.extent = extent;
    return work;
  }

  /**
   * Bring the table in line with `payload`. Resolves when every animation it
   * started has finished. Returns what happened worth announcing.
   */
  async reconcile(payload, { animated = true } = {}) {
    this.clearMarks();
    this.me = payload.seat;
    const handId = `${payload.game}:${payload.view.handNumber}`;
    if (handId !== this.handId) {
      this.handId = handId;
      this.clear();
      this.buildWall(`${payload.seed}:${payload.view.handNumber}`, payload.view.dealer);
      animated = false;
      sound.cue("deal");
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
    // Ordinary draws leave the open end; replacements leave the dead wall's
    // end column, the one touching the break, and go on away from it. `used` is what the loose end has given up (a Chinese set
    // also lacks its eight bonus tiles, and keeps a dead wall instead).
    const w = payload.wall;
    const used = Math.max(0, w.size - w.front - (w.remaining + w.loose + w.dead)) + (144 - w.size);
    work.push(...this.setWall(w.front, used, w.loose, animated));
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
    this.markThrower(payload);
    return calls;
  }

  /* ------------------------------------------------------- discards */

  /** Tint each pond (the dealer's in coral) and lay the plate under the latest discard. */
  markThrower(payload) {
    for (const entry of payload.table) this.seats[entry.seat].pad.material = entry.dealer ? padMaterials.dealer : padMaterials.other;
    this.plate?.removeFromParent();
    this.plate = null;
    const last = payload.view.lastDiscard;
    const state = last ? this.seats[last.seat] : null;
    if (state && state.discards.length > 0 && state.discards[state.discards.length - 1].key === last.tile) {
      this.plate = flatPlate(latestPlate(state.discards.length - 1), plateMaterial, 0.2, 0.012);
      this.frameOf(last.seat).add(this.plate);
    }
    requestRender();
  }

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
    // The arc touches down at about 0.36 of its 0.4 s: that is when it clacks.
    sound.cue("clack", { delay: 0.36, intensity: seat === this.me ? 1 : 0.85, ...this.ear(seat) });
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
    sound.cue("clack", { delay: 0.33, intensity: 0.7, ...this.ear(claimer) });
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
        sound.cue("draw", { delay: 0.03, ...this.ear(entry.seat) });
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
    const key = JSON.stringify([groups, this.wall?.extent[this.rel(entry.seat)] ?? WALL_STACKS]);
    if (key === state.meldsKey) return [];
    state.meldsKey = key;
    state.melds.clear();
    if (groups.length === 0) return [];
    const work = [];
    const bonusFirst = entry.flowers.length + entry.seasons.length > 0;
    const offset = bonusFirst ? 1 : 0;
    const kongs = entry.melds.flatMap((meld, index) => (meld.kind === "kong" ? [index + offset] : []));
    const { scale, tiles } = meldLayout(
      groups.map((group) => group.length),
      this.wall?.extent[this.rel(entry.seat)] ?? WALL_STACKS,
      entry.handCount,
      { bonusFirst, rel: this.rel(entry.seat), kongs },
    );
    for (const place of tiles) {
      const piece = groups[place.group][place.index];
      const tile = makeTile(piece.key);
      if (piece.faceUp) poseFaceUp(tile, place.x, place.z, place.group * 5 + place.index, scale);
      else poseFaceDown(tile, place.x, (D / 2) * scale, place.z, scale);
      tile.position.y += place.level * D * scale; // the fourth tile of a kong rests on the middle one
      state.melds.add(tile);
      if (fresh && place.group === groups.length - 1) {
        const y = tile.position.y;
        tile.position.y = y + 1.6;
        work.push(tween(tile.position, { y }, 300, easeOutBack));
      }
    }
    // The dropping tiles first meet the felt at about 0.45 of their 0.3 s.
    if (fresh) sound.cue("meld", { delay: 0.135, count: groups.at(-1).length, ...this.ear(entry.seat) });
    return work;
  }

  /** Where a seat's newest meld lands, in table space: the end of its lane. */
  meldTarget(seat) {
    const state = this.seats[seat];
    const count = Math.max(1, state?.callCount ?? 1);
    const place = meldLayout(new Array(count).fill(3), this.wall?.extent[this.rel(seat)] ?? WALL_STACKS, 8, { rel: this.rel(seat) }).tiles.at(-1);
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
    const make = (key) => {
      const entry = { key, tile: makeTile(key, { shadows: false }), drawn: false, glide: 0 };
      entry.tile.rotation.x = HAND_TILT;
      this.handGroup.add(entry.tile);
      fresh.add(entry);
      return entry;
    };
    if (this.custom) {
      // Your own arrangement stands: tiles keep their places, new ones join at the end.
      const left = [...keys];
      for (const entry of this.hand) {
        const at = left.indexOf(entry.key);
        if (at < 0) continue;
        left.splice(at, 1);
        pool.splice(pool.indexOf(entry), 1);
        next.push(entry);
      }
      left.sort((a, b) => tileOrder(a) - tileOrder(b));
      if (drawnKey !== null && left.includes(drawnKey)) left.push(left.splice(left.indexOf(drawnKey), 1)[0]);
      for (const key of left) next.push(make(key));
      next.forEach((entry, index) => {
        entry.drawn = drawnKey !== null && index === next.length - 1;
      });
    } else {
      const order = plain.map((key) => [key, false]);
      if (drawnKey !== null) order.push([drawnKey, true]);
      for (const [key, drawn] of order) {
        const entry = take(key, drawn) ?? make(key);
        entry.drawn = drawn;
        next.push(entry);
      }
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

  layoutHand(fresh, animated, skip = null) {
    const { places, total } = this.handPlaces();
    setHandRowWidth(total);
    const work = [];
    for (const entry of this.hand) {
      if (entry === skip) continue;
      const x = places.get(entry);
      if (fresh.has(entry)) {
        const start = handTileStart(x, entry.drawn, animated);
        entry.tile.position.set(start.x, start.y, 0);
        if (animated) {
          work.push(tween(entry.tile.position, { x, y: 0 }, 260, easeOutCubic));
          if (entry.drawn) sound.cue("draw", { own: true, delay: 0.17 });
        }
        continue;
      }
      const position = entry.tile.position;
      if (Math.abs(position.x - x) > 1e-3 || Math.abs(position.y) > 1e-3) {
        if (animated) work.push(this.glide(entry, { x, y: 0 }, 220));
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

  /** Gold-mark every identical tile already open on the table (discards, melds), never your own hand. */
  markCopies(key) {
    this.clearMarks();
    const found = [];
    for (const seat of SEATS) {
      const state = this.seats[seat];
      for (const item of state.discards) if (item.key === key) found.push(item.tile);
      for (const tile of state.melds.children) if (tile.userData.key === key) found.push(tile);
    }
    if (found.length === 0) return;
    for (const tile of found) this.marked.push(markTile(tile));
    const id = ++this.markId;
    // Flash in, then keep breathing for as long as the tile stays selected.
    const SPAN = 600000;
    animate(SPAN, (t) => {
      if (this.markId !== id) return false;
      const ms = t * SPAN;
      const intro = Math.min(1, ms / 160);
      const breath = 0.5 + 0.5 * Math.cos((ms / 900) * Math.PI * 2);
      markMaterial.opacity = intro * (0.85 + 0.15 * breath);
      markFillMaterial.opacity = intro * (0.3 + 0.16 * breath);
      markHaloMaterial.opacity = intro * (0.35 + 0.45 * breath);
    });
  }

  clearMarks() {
    this.markId++;
    for (const frame of this.marked) frame.removeFromParent();
    this.marked = [];
    requestRender();
  }

  lift(entry, up) {
    if (up) this.markCopies(entry.key);
    else this.clearMarks();
    return this.glide(entry, { y: up ? HAND_LIFT : 0 }, 140);
  }

  /** Move a hand tile; a newer move of the same tile replaces the one in flight. */
  glide(entry, to, ms) {
    const id = (entry.glide = (entry.glide ?? 0) + 1);
    const position = entry.tile.position;
    const from = { x: position.x, y: position.y };
    return animate(ms, (t) => {
      if (entry.glide !== id) return;
      const k = easeOutCubic(t);
      if (to.x !== undefined) position.x = from.x + (to.x - from.x) * k;
      if (to.y !== undefined) position.y = from.y + (to.y - from.y) * k;
    });
  }

  /* ------------------------------------------------------- arranging */

  /** Hand-space x under a pointer event (on the hand's plane), or null. */
  handX(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    // A tile swiped up out of the strip still tracks along the hand's row.
    const fromBottom = Math.max(0, Math.min(viewport.strip, rect.bottom - event.clientY));
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (fromBottom / viewport.strip) * 2 - 1,
    );
    this.raycaster.setFromCamera(pointer, handCamera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit.x : null;
  }

  /** Swap two tiles' places in the hand. */
  swap(a, b) {
    const i = this.hand.indexOf(a);
    const j = this.hand.indexOf(b);
    if (i < 0 || j < 0 || i === j) return;
    this.hand[i] = b;
    this.hand[j] = a;
    [a.drawn, b.drawn] = [b.drawn, a.drawn];
    this.setCustom(true);
    sound.cue("swap");
  }

  /** Note (and announce) whether the hand is in your own order. */
  setCustom(custom) {
    if (this.custom === custom) return;
    this.custom = custom;
    this.onCustomChange?.(custom);
  }

  /** Back to the default order: sorted, the drawn tile apart at the end. */
  autoSort() {
    this.setCustom(false);
    const drawn = this.hand.filter((entry) => entry.drawn);
    const plain = this.hand.filter((entry) => !entry.drawn);
    plain.sort((a, b) => tileOrder(a.key) - tileOrder(b.key));
    this.hand = [...plain, ...drawn];
    return this.layoutHand(new Set(), true);
  }

  /** Carry a tile with the pointer; it trades places with each tile it passes. */
  dragTo(entry, event) {
    const x = this.handX(event);
    if (x === null) return;
    const { places, total } = this.handPlaces();
    entry.glide += 1; // the pointer owns this tile now
    entry.tile.position.x = Math.max(-total / 2, Math.min(total / 2, x));
    entry.tile.position.y = HAND_LIFT;
    let target = this.hand.indexOf(entry);
    let best = Infinity;
    this.hand.forEach((other, index) => {
      const distance = Math.abs(places.get(other) - x);
      if (distance < best) {
        best = distance;
        target = index;
      }
    });
    let at = this.hand.indexOf(entry);
    if (at === target) return;
    while (at !== target) {
      const step = target > at ? 1 : -1;
      this.swap(entry, this.hand[at + step]);
      at += step;
    }
    this.layoutHand(new Set(), true, entry);
  }

  /** Show (or clear) that releasing this carried tile will throw it: it swells a little. */
  armThrow(entry, on) {
    const k = on ? 1.12 : 1;
    if (entry.tile.scale.x === k) return false;
    entry.tile.scale.setScalar(k);
    requestRender();
    return true;
  }

  /** Settle every hand tile into its place (after a drag or a swap). */
  settle() {
    this.clearMarks();
    return this.layoutHand(new Set(), true);
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
