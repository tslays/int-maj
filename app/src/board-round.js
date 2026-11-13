/**
 * The large discard, on phones only: the tile another player has just thrown
 * gets its face laid flat on top of it, larger, in the tile's own place,
 * angle and orientation, so a glance tells what was thrown without leaning in
 * or zooming. One at a time (owner ruling for alpha.7: the whole round at
 * once was too distracting): each new throw takes the large face from the one
 * before. It appears only once its tile has landed and settled, expanding
 * briefly out of the tile. The tile the player on your left throws has no next
 * throw to replace it, so it clears by itself after as long as the two before
 * it stayed up (measured, so it keeps the table's rhythm at any pace); your
 * own throw clears it too. A claimed tile takes its large face with it. Options has a switch
 * for it (on by default, `large-discards.js`). It has the latest discard's
 * cyan edge (it covers that plate).
 *
 * Each layer is a child of its tile (`makeFaceLayer` in `tiles.js`), so it
 * goes wherever the tile goes. Sizes and the phone test are plain numbers in
 * `layout.js` (`ROUND_LAYER`, `roundLayerZ`). Installed on the `Board` like
 * `board-wall.js` and `board-hand.js`; a round entry is the pond's own
 * `{ key, tile }` item, given `layer` and `edge`.
 */

import { layerEdge, makeFaceLayer } from "./tiles.js";
import { ROUND_LAYER, roundLayersWanted, roundLayerZ } from "./layout.js";
import { animate, easeOutCubic, requestRender, viewport } from "./stage.js";
import { pace } from "./pace.js";
import { largeDiscards } from "./large-discards.js";

const GROW_MS = 200;
/** Before any large face has been timed (a new game), how long the left player's one stays up. */
const FIRST_HOLD_MS = 1500;
const SEATS = ["E", "S", "W", "N"];
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

function setLayerScale(item, scale, order) {
  item.layer.scale.setScalar(scale);
  item.layer.position.z = roundLayerZ(scale, order);
}

export const roundMethods = {
  /** Whether the layers show: on a phone-sized screen, with Large discards on (Options). */
  roundShown() {
    return largeDiscards.on && roundLayersWanted(viewport.width, viewport.height);
  },

  /**
   * An opponent's discard has landed and settled: lay its face over it,
   * expanding out of the tile; the one before goes. `seat` threw it.
   */
  addRoundLayer(item, seat) {
    if (!item.tile.parent || this.round.includes(item)) return;
    const now = performance.now();
    // A face replaced by the next throw tells how long a large face stays up at this pace.
    if (this.round.length > 0 && this.layerShownAt !== null) {
      this.layerHolds = [...(this.layerHolds ?? []), now - this.layerShownAt].slice(-2);
    }
    this.clearRound();
    this.layerShownAt = now;
    // The player on your left throws last before you: nothing replaces it, so it goes by itself, on the beat.
    const left = SEATS[(SEATS.indexOf(this.me) + 3) % 4];
    if (seat === left) {
      const holds = this.layerHolds ?? [];
      const hold = holds.length > 0 ? holds.reduce((sum, ms) => sum + ms, 0) / holds.length : pace.scale(FIRST_HOLD_MS);
      const token = (this.layerTimer = (this.layerTimer ?? 0) + 1);
      setTimeout(() => {
        if (this.layerTimer === token && this.round.includes(item)) {
          this.clearRound();
          this.layerShownAt = null;
        }
      }, hold);
    }
    const order = this.round.length;
    const { group, edge } = makeFaceLayer(item.key);
    group.visible = this.roundShown();
    item.layer = group;
    item.edge = edge;
    item.tile.add(group);
    this.round.push(item);
    this.markNewestLayer();
    if (reducedMotion.matches) {
      setLayerScale(item, ROUND_LAYER.SCALE, order);
      requestRender();
      return;
    }
    setLayerScale(item, 1, order);
    void animate(GROW_MS, (t) => {
      if (item.layer !== group) return false;
      setLayerScale(item, 1 + (ROUND_LAYER.SCALE - 1) * easeOutCubic(t), order);
      return true;
    }, { fixed: true });
  },

  /** Your own throw (or the next throw): the large face goes. */
  clearRound() {
    for (const item of this.round) this.removeLayer(item);
    this.round = [];
    requestRender();
  },

  /** Your own throw: the large face goes, and the next one is not timed from it. */
  endRound() {
    this.clearRound();
    this.layerShownAt = null;
    this.layerTimer = (this.layerTimer ?? 0) + 1;
  },

  /** A discard leaves the pond (claimed, or the pond rebuilt): its layer goes with it. */
  dropRoundLayer(item) {
    const index = this.round.indexOf(item);
    if (index < 0) return;
    this.removeLayer(item);
    this.round.splice(index, 1);
    this.layerShownAt = null;
    this.markNewestLayer();
    requestRender();
  },

  removeLayer(item) {
    item.layer?.removeFromParent();
    item.layer = null;
    item.edge = null;
  },

  /** The screen changed size or the switch was turned: show the layers, or hide them. */
  refreshRound() {
    const shown = this.roundShown();
    for (const item of this.round) item.layer.visible = shown;
    requestRender();
  },

  /** Only the newest layer carries the latest discard's cyan edge. */
  markNewestLayer() {
    this.round.forEach((item, index) => {
      item.edge.material = index === this.round.length - 1 ? layerEdge.latest : layerEdge.plain;
    });
  },
};
