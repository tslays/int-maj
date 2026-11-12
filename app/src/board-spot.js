/**
 * The round spotlight, on phones only: the last four discards on the table
 * (one go round, whoever threw them) stand up out of their ponds, larger,
 * turned upright to you and tilted to face the camera, so a glance shows what
 * this round threw without leaning in or zooming. A fifth discard sends the
 * oldest back down to lie flat in its pond; a claimed tile leaves the round.
 * The pond zoom's top-down view lays them flat (it is large already) and
 * stands them up again on the way back. Sizes and the phone test are plain
 * numbers in `layout.js` (`SPOT`, `spotPose`, `spotlightWanted`).
 *
 * Installed on the `Board` like `board-wall.js` and `board-hand.js`; each
 * spotlit discard is the pond's own `{ key, tile, rest }` item, with `seat`,
 * `k` (0 lying, 1 standing) and `target` added.
 */

import * as THREE from "three";
import { SPOT, spotlightWanted, spotPose, toTable } from "./layout.js";
import { animate, easeInOutCubic, easeOutBack, pondZoomed, reducedMotion, requestRender, viewport } from "./stage.js";

const RISE_MS = 340;
const SETTLE_MS = 260;

export const spotMethods = {
  /** Whether discards stand up at all now: on a phone-sized screen, outside the pond zoom. */
  spotOn() {
    return spotlightWanted(viewport.width, viewport.height) && !pondZoomed();
  },

  /** A discard has landed: it joins the round, and the oldest beyond four lies down. */
  spotlight(seat, item) {
    if (!item.tile.parent || this.spot.includes(item)) return;
    item.seat = seat;
    this.spot.push(item);
    while (this.spot.length > SPOT.COUNT) this.raise(this.spot.shift(), false);
    this.raise(item, this.spotOn());
  },

  /** A discard leaves the table (claimed, or the pond rebuilt): forget it, stopping its motion. */
  unspot(item) {
    const index = this.spot.indexOf(item);
    if (index >= 0) this.spot.splice(index, 1);
    item.run = (item.run ?? 0) + 1;
  },

  /** The screen or the zoom changed: stand the round up, or lay it down. */
  refreshSpot() {
    const on = this.spotOn();
    for (const item of this.spot) this.raise(item, on);
  },

  /** Move a discard towards standing (`up`) or lying in its pond. */
  raise(item, up) {
    const target = up ? 1 : 0;
    if ((item.target ?? 0) === target) return;
    item.target = target;
    const run = (item.run = (item.run ?? 0) + 1);
    if (up) item.stand = this.standPose(item);
    const from = item.k ?? 0;
    if (reducedMotion.matches) {
      item.k = target;
      this.poseSpot(item);
      return;
    }
    const ease = up ? easeOutBack : easeInOutCubic;
    void animate(up ? RISE_MS : SETTLE_MS, (t) => {
      if (item.run !== run) return false;
      item.k = from + (target - from) * ease(t);
      this.poseSpot(item);
      return true;
    });
  },

  /** The standing pose in the seat's own frame: where `spotPose` puts it, upright to you. */
  standPose(item) {
    const rel = this.rel(item.seat);
    const index = this.seats[item.seat].discards.indexOf(item);
    const pose = spotPose(rel, index);
    const local = toTable((4 - rel) % 4, pose.x, pose.z);
    const world = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + pose.tilt, 0, 0));
    const unturn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (-rel * Math.PI) / 2, 0));
    return {
      position: new THREE.Vector3(local.x, pose.y, local.z),
      quaternion: unturn.multiply(world),
      scale: pose.scale,
    };
  },

  /** Put a discard `k` of the way from lying in its pond to standing. */
  poseSpot(item) {
    const { tile, rest } = item;
    const stand = item.stand ?? this.standPose(item);
    const k = item.k ?? 0;
    // The rise overshoots a little in size and height; the turn never does.
    tile.position.lerpVectors(rest.position, stand.position, k);
    tile.quaternion.slerpQuaternions(rest.quaternion, stand.quaternion, Math.max(0, Math.min(1, k)));
    tile.scale.setScalar(rest.scale.x + (stand.scale - rest.scale.x) * k);
    requestRender();
  },
};
