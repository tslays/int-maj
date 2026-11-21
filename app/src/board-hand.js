/**
 * Your own hand on the 3D table: keeping its tiles equal to the payload,
 * laying them out, and everything the pointer does with them (picking,
 * lifting, dragging into your own order, arming a throw). Methods of `Board`
 * (see board.js), which installs them on its prototype; `this` is the board.
 */

import * as THREE from "three";
import { W, makeTile, markFishing, markReceived, tileOrder } from "./tiles.js";
import { picksStand, planHand } from "./hand-plan.js";
import { sortPref } from "./sort-pref.js";
import { HAND_DRAWN_GAP, HAND_GAP, HAND_LIFT, handTileStart, handWidth } from "./layout.js";
import { pace } from "./pace.js";
import { sound } from "./sound.js";
import { animate, easeOutCubic, handCamera, renderer, requestRender, setHandRowWidth, tween, viewport } from "./stage.js";

const HAND_TILT = -0.16;

export const handMethods = {
  /* ------------------------------------------------------- your hand */

  reconcileHand(payload, animated) {
    const view = payload.view;
    const keys = [...view.player.hand];
    const ownTurn = view.phase === "discard" && view.turn === this.me;
    let drawnKey = null;
    if (ownTurn && view.lastDraw !== null && view.lastDraw.seat === this.me && keys.includes(view.lastDraw.tile)) {
      drawnKey = view.lastDraw.tile;
    }
    // Picked for a Goulash pass, or just thrown: these copies are the ones that leave (#210, #214).
    const leaving = new Set(this.raised);
    if (this.thrown !== null) leaving.add(this.thrown);
    const { order } = planHand({ hand: this.hand, keys, drawnKey, sorted: sortPref.on, leaving });

    const next = [];
    const fresh = new Set();
    for (const item of order) {
      let entry = item.entry;
      if (entry === null) {
        entry = { key: item.key, tile: makeTile(item.key, { shadows: false }), drawn: false, glide: 0 };
        entry.tile.rotation.x = HAND_TILT;
        this.handGroup.add(entry.tile);
        fresh.add(entry);
      }
      entry.drawn = item.drawn;
      next.push(entry);
    }
    for (const entry of this.hand) if (!next.includes(entry)) entry.tile.removeFromParent();
    if (!next.includes(this.thrown)) this.thrown = null;
    this.hand = next;
    for (const entry of this.raised) if (!next.includes(entry)) this.raised.delete(entry);
    // Picks stand up only while an exchange is offered: once it is over none stays raised.
    if (!picksStand(payload)) this.raised.clear();
    // The tile you raised was used up (a call took it): if you still hold another copy, the lift moves to it.
    if (this.lifted !== null && !next.includes(this.lifted)) {
      const key = this.lifted.key;
      this.lifted = next.find((entry) => entry.key === key && !fresh.has(entry)) ?? next.find((entry) => entry.key === key) ?? null;
      if (this.lifted === null) this.clearMarks();
    }

    // A tile you are carrying stays with your pointer, even if the table moves on meanwhile.
    const work = this.layoutHand(fresh, animated, this.carried);

    return work;
  },

  /** Positions of the hand tiles, with the drawn tile set apart. */
  handPlaces() {
    const plain = this.hand.filter((entry) => !entry.drawn);
    const total = handWidth(plain.length);
    let x = -total / 2 + W / 2;
    const places = new Map();
    for (const entry of plain) {
      places.set(entry, x);
      x += W + HAND_GAP;
    }
    const drawn = this.hand.find((entry) => entry.drawn);
    if (drawn) places.set(drawn, x - HAND_GAP + HAND_DRAWN_GAP);
    return { places, total };
  },

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
          if (entry.drawn) sound.cue("draw", { own: true, delay: pace.scale(0.17) });
        }
        continue;
      }
      // A tile you have raised (or picked for a Goulash pass) stays raised while the hand shifts around it.
      const y = entry === this.lifted || this.raised.has(entry) ? HAND_LIFT : 0;
      const position = entry.tile.position;
      if (Math.abs(position.x - x) > 1e-3 || Math.abs(position.y - y) > 1e-3) {
        if (animated) work.push(this.glide(entry, { x, y }, 220));
        else position.set(x, y, 0);
      }
    }
    return work;
  },

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
    if (hits.length === 0) return this.liftedGapHit() ? this.lifted : null;
    let object = hits[0].object;
    while (object.parent !== this.handGroup) object = object.parent;
    return this.hand.find((entry) => entry.tile === object) ?? null;
  },

  /**
   * Whether the pointer ray (set by `pick`) passes through the gap a raised
   * tile leaves beneath it. That gap counts as part of the tile, so moving
   * from the tile down into it keeps the tile up instead of flickering.
   */
  liftedGapHit() {
    const entry = this.lifted;
    if (entry === null || !this.hand.includes(entry)) return false;
    const tile = entry.tile;
    const y = tile.position.y;
    const box = new THREE.Box3().setFromObject(tile);
    tile.position.y = 0;
    tile.updateMatrixWorld(true);
    box.union(new THREE.Box3().setFromObject(tile));
    tile.position.y = y;
    tile.updateMatrixWorld(true);
    return this.raycaster.ray.intersectsBox(box);
  },

  /** Raise a hand tile (marking its copies on the table) or put it back; `lifted` is the one raised. */
  lift(entry, up) {
    if (up) {
      this.lifted = entry;
      this.markCopies(entry.key);
    } else {
      if (this.lifted === entry) this.lifted = null;
      this.clearMarks();
    }
    this.noteLift();
    return this.glide(entry, { y: up ? HAND_LIFT : 0 }, 140);
  },

  /**
   * Raise or lower a tile picked for a Goulash pass. Several can be up at
   * once, and none marks its copies on the table.
   */
  raise(entry, up) {
    if (up) this.raised.add(entry);
    else this.raised.delete(entry);
    return this.glide(entry, { y: up ? HAND_LIFT : 0 }, 140);
  },

  /**
   * The keyboard's place in a Goulash pick (`keys.js`): the tile stands half
   * raised, below a picked one. A picked tile stays as it is.
   */
  peek(entry, on) {
    if (this.raised.has(entry)) return Promise.resolve();
    return this.glide(entry, { y: on ? HAND_LIFT * 0.45 : 0 }, 140);
  },

  /** Put every picked tile down (a new exchange, or the exchange is over). */
  lowerAll() {
    const work = [...this.raised].map((entry) => this.glide(entry, { y: 0 }, 140));
    this.raised.clear();
    return work;
  },

  /**
   * Mark the tiles a Goulash exchange just brought in (#119), replacing the
   * marks of the exchange before. One mark per copy received.
   */
  markReceived(keys) {
    this.clearReceived();
    const left = [...keys];
    for (const entry of [...this.hand].reverse()) {
      const at = left.indexOf(entry.key);
      if (at < 0) continue;
      left.splice(at, 1);
      entry.received = markReceived(entry.tile);
    }
    requestRender();
  },

  clearReceived() {
    for (const entry of this.hand) {
      entry.received?.removeFromParent();
      entry.received = null;
    }
    requestRender();
  },

  /**
   * Put a fish on every copy of each tile whose discard leaves you fishing
   * (`marks`: tile key -> hand, from `fishingMarks`), and take it off the
   * rest. Every copy, since throwing any one of them is the same throw.
   */
  markFishing(marks) {
    for (const entry of this.hand) {
      const hand = marks.get(entry.key) ?? null;
      if (hand !== null && !entry.fishing) entry.fishing = markFishing(entry.tile);
      if (hand === null && entry.fishing) {
        entry.fishing.removeFromParent();
        entry.fishing = null;
      }
      entry.fishHand = hand;
    }
    this.noteLift();
    requestRender();
  },

  /** Tell the table which hand the lifted tile would fish for, if it carries a fish (`onLiftNote`). */
  noteLift() {
    this.onLiftNote?.(this.lifted?.fishHand ?? null);
  },

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
  },

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
  },

  /** Swap two tiles' places in the hand (used while dragging past a tile). */
  swap(a, b) {
    const i = this.hand.indexOf(a);
    const j = this.hand.indexOf(b);
    if (i < 0 || j < 0 || i === j) return;
    this.hand[i] = b;
    this.hand[j] = a;
    [a.drawn, b.drawn] = [b.drawn, a.drawn];
    sortPref.set(false, "arranged"); // your own order now: the game stops sorting (#213, #269)
    sound.cue("swap");
  },

  /** Back to the default order: sorted, the drawn tile apart at the end. */
  autoSort() {
    const drawn = this.hand.filter((entry) => entry.drawn);
    const plain = this.hand.filter((entry) => !entry.drawn);
    plain.sort((a, b) => tileOrder(a.key) - tileOrder(b.key));
    this.hand = [...plain, ...drawn];
    return this.layoutHand(new Set(), true);
  },

  /**
   * Carry a tile with the pointer; with `reorder` it trades places with each
   * tile it passes (and so turns Sort off), otherwise it only follows.
   */
  dragTo(entry, event, reorder = true) {
    const x = this.handX(event);
    if (x === null) return;
    const { places, total } = this.handPlaces();
    this.carried = entry;
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
    if (!reorder || at === target) return;
    while (at !== target) {
      const step = target > at ? 1 : -1;
      this.swap(entry, this.hand[at + step]);
      at += step;
    }
    this.layoutHand(new Set(), true, entry);
  },

  /** Show (or clear) that releasing this carried tile will throw it: it swells a little. */
  armThrow(entry, on) {
    const k = on ? 1.12 : 1;
    if (entry.tile.scale.x === k) return false;
    entry.tile.scale.setScalar(k);
    requestRender();
    return true;
  },

  /** Settle every hand tile into its place (after a drag or a swap). */
  settle() {
    this.clearMarks();
    this.carried = null;
    this.lifted = null;
    return this.layoutHand(new Set(), true);
  },

  /** Remember where the tile you throw left the hand, so its arc starts there. */
  noteThrow(entry) {
    this.lastThrowX = entry.tile.position.x;
    this.thrown = entry; // this copy leaves the hand, not another of the same face
    this.carried = null;
    this.lifted = null;
  },
};
