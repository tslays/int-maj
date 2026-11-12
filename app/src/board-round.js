/**
 * The round layers, on phones only: each tile the other players throw this
 * round gets its face laid flat on top of it, larger, in the tile's own place,
 * angle and orientation, so a glance tells what the round threw without
 * leaning in or zooming. A layer appears only once its tile has landed and
 * settled, and expands briefly out of the tile; your own throw clears them
 * all, and the next round starts. A claimed tile takes its layer with it. The
 * newest layer has the latest discard's cyan edge (it covers that plate).
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

const GROW_MS = 200;
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

function setLayerScale(item, scale, order) {
  item.layer.scale.setScalar(scale);
  item.layer.position.z = roundLayerZ(scale, order);
}

export const roundMethods = {
  /** Whether the layers show: on a phone-sized screen only. */
  roundShown() {
    return roundLayersWanted(viewport.width, viewport.height);
  },

  /** An opponent's discard has landed and settled: lay its face over it, expanding out of the tile. */
  addRoundLayer(item) {
    if (!item.tile.parent || this.round.includes(item)) return;
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

  /** Your own throw: the round is over, every layer goes. */
  clearRound() {
    for (const item of this.round) this.removeLayer(item);
    this.round = [];
    requestRender();
  },

  /** A discard leaves the pond (claimed, or the pond rebuilt): its layer goes with it. */
  dropRoundLayer(item) {
    const index = this.round.indexOf(item);
    if (index < 0) return;
    this.removeLayer(item);
    this.round.splice(index, 1);
    this.markNewestLayer();
    requestRender();
  },

  removeLayer(item) {
    item.layer?.removeFromParent();
    item.layer = null;
    item.edge = null;
  },

  /** The screen changed size: show the layers on a phone, hide them on anything larger. */
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
