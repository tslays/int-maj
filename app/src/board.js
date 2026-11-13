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
import { D, H, W, makeTile, roundedRect, markTile, markMaterial, markFillMaterial, markHaloMaterial, poseFaceUp, poseFaceDown, TABLE } from "./tiles.js";
import { discardSlot, latestPlate, LATEST_MARGIN, meldLayout, pondPad } from "./layout.js";
import { createPile, pileReach } from "./pile.js";
import { discardLayout } from "./discard-layout.js";
import { pace } from "./pace.js";
import { sound } from "./sound.js";
import { animate, easeInOutCubic, easeOutBack, easeOutCubic, handScene, onViewChange, requestRender, setPondCounts, setPondReach, tableScene, tween } from "./stage.js";
import { handMethods } from "./board-hand.js";
import { wallMethods } from "./board-wall.js";
import { roundMethods } from "./board-round.js";
import { largeDiscards } from "./large-discards.js";

const SEATS = ["E", "S", "W", "N"];
const { WALL_STACKS, WALL_R, HAND_Z, DISCARD_SCALE } = TABLE;
const GAP = 0.02;

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
    this.carried = null; // the hand tile under your pointer: no animation moves it
    this.lifted = null; // the hand tile you have raised (hover or tap): it stays up, and marked, while the table moves
    this.raised = new Set(); // tiles picked for a Goulash pass: up together, unmarked
    this.lastThrowX = 0;
    this.raycaster = new THREE.Raycaster();
    this.marked = [];
    this.markId = 0;
    this.round = []; // this round's opponent discards, each with its face layer on a phone (board-round.js)
    onViewChange(() => this.refreshRound());
    largeDiscards.onChange(() => this.refreshRound());
    // The centre pile (#122): where each discard lies, per seat, in the seat's own frame.
    this.pileSim = null;
    this.pilePoses = null;
    this.lastPayload = null;
    discardLayout.onChange(() => this.relayDiscards());
  }

  /** Where the pile puts each seat's live discards this hand, in table space; null in rows. */
  layoutPile(payload) {
    if (!discardLayout.pile) return null;
    const seed = `${payload.seed}:${payload.view.handNumber}`;
    if (this.pileSim?.seed !== seed) this.pileSim = createPile(seed);
    const pond = payload.pond.map((entry) => ({ rel: this.rel(entry.seat), key: entry.tile, taken: entry.taken }));
    const poses = this.pileSim.settle(pond);
    const bySeat = new Map(SEATS.map((seat) => [seat, []]));
    payload.pond.forEach((entry, index) => {
      if (!entry.taken) bySeat.get(entry.seat).push(poses[index]);
    });
    return bySeat;
  }

  /** A pile pose (table space) in `seat`'s frame: { x, z, yaw }. */
  pileLocal(seat, pose) {
    const rel = this.rel(seat);
    const a = (-rel * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: pose.x * cos + pose.z * sin,
      z: -pose.x * sin + pose.z * cos,
      yaw: pose.angle - (rel * Math.PI) / 2,
      landX: pose.landX * cos + pose.landZ * sin,
      landZ: -pose.landX * sin + pose.landZ * cos,
    };
  }

  /** Where discard `index` of `seat` rests: its row slot, or its place in the pile. */
  discardRest(seat, index) {
    const rest = new THREE.Object3D();
    const pose = this.pilePoses?.get(seat)?.[index];
    if (pose === undefined) {
      const slot = discardSlot(index);
      poseFaceUp(rest, slot.x, slot.z, index * 7 + SEATS.indexOf(seat), DISCARD_SCALE);
      return { rest, land: null };
    }
    const local = this.pileLocal(seat, pose);
    poseFaceUp(rest, local.x, local.z, 0, DISCARD_SCALE);
    rest.position.set(local.x, rest.position.y, local.z);
    rest.rotation.z = local.yaw;
    return { rest, land: { x: local.landX, z: local.landZ } };
  }

  /** The pile settled under every discard: tiles a throw knocked slide to their new places. */
  nudgePile(fresh, animated) {
    if (this.pilePoses === null) return [];
    const work = [];
    let knocked = false;
    for (const seat of SEATS) {
      const state = this.seats[seat];
      state.discards.forEach((item, index) => {
        if (fresh.has(item)) return;
        const { rest } = this.discardRest(seat, index);
        const tile = item.tile;
        const far = Math.hypot(tile.position.x - rest.position.x, tile.position.z - rest.position.z);
        const turn = Math.abs(tile.rotation.z - rest.rotation.z);
        if (far < 1e-3 && turn < 1e-3) return;
        if (!animated) {
          tile.position.copy(rest.position);
          tile.rotation.z = rest.rotation.z;
          return;
        }
        knocked = true;
        // Knocked as the throw lands (its arc touches down at about 0.36 s).
        const from = { x: tile.position.x, z: tile.position.z, yaw: tile.rotation.z };
        work.push(
          new Promise((resolve) => setTimeout(resolve, pace.scale(330))).then(() =>
            animate(260, (t) => {
              const k = easeOutCubic(t);
              tile.position.x = from.x + (rest.position.x - from.x) * k;
              tile.position.z = from.z + (rest.position.z - from.z) * k;
              tile.rotation.z = from.yaw + (rest.rotation.z - from.yaw) * k;
            }),
          ),
        );
      });
    }
    if (knocked) sound.cue("tick", { delay: pace.scale(0.36), pitch: 0.2 });
    return work;
  }

  /** The layout changed in Options: lay every discard again, without animation. */
  relayDiscards() {
    const payload = this.lastPayload;
    if (payload === null || this.handId === null) return;
    for (const seat of SEATS) {
      const state = this.seats[seat];
      if (state === undefined) continue;
      for (const item of state.discards) {
        this.dropRoundLayer(item);
        item.tile.removeFromParent();
      }
      state.discards = [];
    }
    this.pilePoses = this.layoutPile(payload);
    for (const entry of payload.table) {
      entry.discards.forEach((key, index) => void this.addDiscard(entry.seat, key, index, false));
    }
    this.showPond(payload);
    this.markThrower(payload);
    this.keepLift();
  }

  /** Frame the zoomed view on the rows or the pile; the pads tint the rows only. */
  showPond(payload) {
    if (this.pilePoses === null) {
      setPondCounts(payload.table.map((entry) => entry.discards.length));
    } else {
      setPondReach(pileReach([...this.pilePoses.values()].flat()));
    }
    for (const seat of SEATS) {
      if (this.seats[seat]?.pad) this.seats[seat].pad.visible = this.pilePoses === null;
    }
  }

  rel(seat) {
    return (SEATS.indexOf(seat) - SEATS.indexOf(this.me) + 4) % 4;
  }

  frameOf(seat) {
    return this.frames[this.rel(seat)];
  }

  /** Where a seat's label sits with the centre pile: on the felt just inside its wall, in world space. */
  labelPoint(rel) {
    return this.frames[rel].localToWorld(new THREE.Vector3(0, 0.5, WALL_R - 1.2));
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
    this.carried = null;
    this.lifted = null;
    this.raised.clear();
    this.clearMarks();
    this.setCustom(false);
    this.seats = {};
    this.clearRound();
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
   * A new hand: clear the table and build its wall. A `closed` wall still
   * stands whole (the opening lifts the break stack with `breakWall`).
   */
  startHand(payload, { closed = false } = {}) {
    this.me = payload.seat;
    this.handId = `${payload.game}:${payload.view.handNumber}`;
    this.clear();
    this.buildWall(`${payload.seed}:${payload.view.handNumber}`, payload.view.dealer, { closed });
  }

  /**
   * Bring the table in line with `payload`. Resolves when every animation it
   * started has finished. Returns what happened worth announcing.
   */
  async reconcile(payload, { animated = true } = {}) {
    // A tile you are studying keeps its gold marks while the bots play; they are refreshed at the end.
    if (this.lifted === null) this.clearMarks();
    this.me = payload.seat;
    const handId = `${payload.game}:${payload.view.handNumber}`;
    if (handId !== this.handId) {
      this.startHand(payload);
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
    this.lastPayload = payload;
    this.pilePoses = this.layoutPile(payload);
    const fresh = new Set();
    for (const entry of payload.table) {
      work.push(...this.reconcileDiscards(entry, meldsGrew, animated, fresh));
    }
    work.push(...this.nudgePile(fresh, animated));
    // The zoomed view frames every pond, however far a fourth row has run (or the pile spreads).
    this.showPond(payload);
    for (const entry of payload.table) {
      if (entry.seat !== this.me) work.push(...this.reconcileRow(entry, animated));
      work.push(...this.reconcileMelds(entry, meldsGrew.has(entry.seat)));
    }
    work.push(...this.reconcileHand(payload, animated));
    requestRender();
    await Promise.all(work);
    this.markThrower(payload);
    this.keepLift();
    return calls;
  }

  /** After the table moved: a lifted tile still in your hand keeps its marks (a new discard gets one); one that left drops them. */
  keepLift() {
    if (this.lifted === null) return;
    if (!this.hand.includes(this.lifted)) {
      this.lifted = null;
      this.clearMarks();
      return;
    }
    this.markCopies(this.lifted.key);
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
      const index = state.discards.length - 1;
      const pose = this.pilePoses?.get(last.seat)?.[index];
      if (pose === undefined) {
        this.plate = flatPlate(latestPlate(index), plateMaterial, 0.2, 0.012);
      } else {
        // Under the pile's latest tile, turned with it, so a claim can still find it.
        const local = this.pileLocal(last.seat, pose);
        const box = { x: local.x, z: local.z, width: W * DISCARD_SCALE + LATEST_MARGIN * 2, depth: H * DISCARD_SCALE + LATEST_MARGIN * 2 };
        this.plate = flatPlate(box, plateMaterial, 0.2, 0.012);
        this.plate.rotation.z = local.yaw;
      }
      this.frameOf(last.seat).add(this.plate);
      // Opened mid-hand (a reload, a review board): the round starts with the latest discard, if not yours.
      if (this.round.length === 0 && last.seat !== this.me) this.addRoundLayer(state.discards[state.discards.length - 1]);
    }
    requestRender();
  }

  reconcileDiscards(entry, meldsGrew, animated, fresh = new Set()) {
    const state = this.seats[entry.seat];
    const before = state.discards.map((item) => item.key);
    const after = entry.discards;
    const work = [];
    const samePrefix = (length) => before.slice(0, length).every((key, index) => key === after[index]);

    if (after.length >= before.length && samePrefix(before.length)) {
      for (let index = before.length; index < after.length; index++) {
        work.push(this.addDiscard(entry.seat, after[index], index, animated && after.length - before.length <= 2));
        fresh.add(state.discards.at(-1));
      }
    } else if (after.length === before.length - 1 && samePrefix(after.length)) {
      const taken = state.discards.pop();
      this.dropRoundLayer(taken);
      const claimer = [...meldsGrew.keys()].find((seat) => seat !== entry.seat) ?? null;
      work.push(animated && claimer !== null ? this.flyToClaimer(taken.tile, claimer) : Promise.resolve(taken.tile.removeFromParent()));
    } else {
      for (const item of state.discards) {
        this.dropRoundLayer(item);
        item.tile.removeFromParent();
      }
      state.discards = [];
      after.forEach((key, index) => {
        work.push(this.addDiscard(entry.seat, key, index, false));
        fresh.add(state.discards.at(-1));
      });
    }
    return work;
  }

  addDiscard(seat, key, index, animated) {
    const state = this.seats[seat];
    const tile = makeTile(key);
    const { rest, land } = this.discardRest(seat, index);
    tile.scale.copy(rest.scale);
    this.frameOf(seat).add(tile);
    const item = { key, tile };
    state.discards.push(item);
    if (!animated) {
      tile.position.copy(rest.position);
      tile.rotation.copy(rest.rotation);
      return Promise.resolve();
    }
    // Your throw ends the round: this round's face layers go as it leaves your hand.
    if (seat === this.me) this.clearRound();
    // Thrown from the seat's hand, in an arc, turning face up as it lands.
    const fromX = seat === this.me ? this.lastThrowX * 0.45 : 0;
    const from = new THREE.Vector3(fromX, 1.4, HAND_Z - (seat === this.me ? -0.5 : 0.8));
    tile.position.copy(from);
    tile.rotation.set(seat === this.me ? -0.35 : 0.2, 0, 0);
    // The arc touches down at about 0.36 of its 0.4 s: that is when it clacks.
    sound.cue("clack", { delay: pace.scale(0.36), intensity: seat === this.me ? 1 : 0.85, ...this.ear(seat) });
    const startRotation = tile.rotation.clone();
    // In the pile the throw touches down where it was aimed, then slides clear of the tiles there.
    const touch = land === null ? rest.position.clone() : new THREE.Vector3(land.x, rest.position.y, land.z);
    return animate(400, (t) => {
      const k = easeOutCubic(t);
      tile.position.lerpVectors(from, touch, k);
      tile.position.y += Math.sin(Math.PI * Math.min(1, t * 1.1)) * 1.4;
      tile.rotation.x = startRotation.x + (rest.rotation.x - startRotation.x) * easeInOutCubic(t);
      tile.rotation.z = startRotation.z + (rest.rotation.z - startRotation.z) * k;
    }).then(() => {
      if (land === null) return undefined;
      const slide = { x: touch.x, z: touch.z };
      return animate(180, (t) => {
        const k = easeOutCubic(t);
        tile.position.x = slide.x + (rest.position.x - slide.x) * k;
        tile.position.z = slide.z + (rest.position.z - slide.z) * k;
      });
    }).then(() => {
      const y = rest.position.y;
      return tween(tile.position, { y: y + 0.05 }, 60).then(() => tween(tile.position, { y }, 90));
    }).then(() => {
      // Only once the throw has landed and settled does its face layer appear.
      if (seat !== this.me) this.addRoundLayer(item);
    });
  }

  /** A claimed discard flies from the heap towards the claimer and goes into the meld. */
  flyToClaimer(tile, claimer) {
    tableScene.attach(tile);
    const target = this.meldTarget(claimer);
    const from = tile.position.clone();
    sound.cue("clack", { delay: pace.scale(0.33), intensity: 0.7, ...this.ear(claimer) });
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
        sound.cue("draw", { delay: pace.scale(0.03), ...this.ear(entry.seat) });
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
    if (fresh) sound.cue("meld", { delay: pace.scale(0.135), count: groups.at(-1).length, ...this.ear(entry.seat) });
    return work;
  }

  /** Where a seat's newest meld lands, in table space: the end of its lane. */
  meldTarget(seat) {
    const state = this.seats[seat];
    const count = Math.max(1, state?.callCount ?? 1);
    const place = meldLayout(new Array(count).fill(3), this.wall?.extent[this.rel(seat)] ?? WALL_STACKS, 8, { rel: this.rel(seat) }).tiles.at(-1);
    return this.frameOf(seat).localToWorld(new THREE.Vector3(place.x, 1.2, place.z));
  }

  /* ------------------------------------------------------- marks */

  /** Gold-mark every identical tile already open on the table (discards, melds), never your own hand. */
  markCopies(key) {
    const found = [];
    for (const seat of SEATS) {
      const state = this.seats[seat];
      // A tile under a round layer is marked on the layer, which hides it.
      for (const item of state.discards) if (item.key === key) found.push(item.layer?.visible ? item.layer : item.tile);
      for (const tile of state.melds.children) if (tile.userData.key === key) found.push(tile);
    }
    // The very same tiles are already marked (the table moved but nothing changed for this tile): leave the glow breathing.
    const same = found.length === this.marked.length && found.every((tile) => this.marked.some((frame) => frame.parent === tile));
    if (same && found.length > 0) return;
    this.clearMarks();
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
    }, { fixed: true });
  }

  clearMarks() {
    this.markId++;
    for (const frame of this.marked) frame.removeFromParent();
    this.marked = [];
    requestRender();
  }

  /** Where a seat sits, for placing call-outs: a point on the table in world space. */
  seatPoint(seat) {
    const point = new THREE.Vector3(0, 1.5, this.rel(seat) === 0 ? WALL_R - 1.6 : HAND_Z - 2.6);
    return this.frameOf(seat).localToWorld(point);
  }
}

Object.assign(Board.prototype, wallMethods, handMethods, roundMethods);
