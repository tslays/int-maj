/**
 * Seat labels with the centre pile (#122): a label takes the best spot its
 * seat offers that lies on the screen clear of everything it must never
 * cover (discards, claimed melds, the players' walls, the panels) and of the
 * other labels; on a packed table, the spot it overlaps least.
 * `app/src/label-place.js` is plain numbers, so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { boundsOf, LABEL_GAP, labelRect, overlapArea, placeLabels } from "../../app/src/label-place.js";

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
interface Place {
  readonly x: number;
  readonly y: number;
  readonly clear: boolean;
}

const VIEW = { width: 844, height: 390 };
const W = 92;
const H = 24;

/** A seat's spots from the pond outwards along a line, as the board offers them. */
function line(from: { x: number; y: number }, step: { x: number; y: number }, count: number) {
  return Array.from({ length: count }, (_, i) => ({ x: from.x + step.x * i, y: from.y + step.y * i }));
}

describe("seat labels with the centre pile", () => {
  it("measures rectangles and overlaps", () => {
    assert.deepEqual(boundsOf([{ x: 3, y: 9 }, { x: -1, y: 4 }, { x: 7, y: 2 }]), { left: -1, top: 2, right: 7, bottom: 9 });
    const a: Rect = labelRect({ x: 50, y: 50 }, 20, 10);
    assert.deepEqual(a, { left: 40, top: 45, right: 60, bottom: 55 });
    assert.equal(overlapArea(a, { left: 60, top: 45, right: 70, bottom: 55 }), 0, "touching edges share nothing");
    assert.ok(overlapArea(a, { left: 60, top: 45, right: 70, bottom: 55 }, LABEL_GAP) > 0, "but come within the gap");
  });

  it("takes the best spot when it is clear", () => {
    const [place] = placeLabels({ labels: [{ width: W, height: H, candidates: line({ x: 420, y: 300 }, { x: 0, y: 5 }, 10) }], obstacles: [], view: VIEW }) as Place[];
    assert.deepEqual(place, { x: 420, y: 300, clear: true });
  });

  it("never covers a tile or a panel while a clear spot is left: it moves on to the next", () => {
    const pile: Rect = { left: 300, top: 120, right: 540, bottom: 320 };
    const wall: Rect = { left: 260, top: 362, right: 580, bottom: 384 };
    const panel: Rect = { left: 640, top: 10, right: 840, bottom: 180 };
    const labels = [
      // From the pond's middle outwards towards you: past the pile, short of your wall.
      { width: W, height: H, candidates: line({ x: 420, y: 220 }, { x: 0, y: 4 }, 40) },
      // The seat on your right, whose best spots run under the panel.
      { width: W, height: H, candidates: [...line({ x: 700, y: 120 }, { x: 0, y: 6 }, 5), ...line({ x: 600, y: 230 }, { x: 4, y: 0 }, 20)] },
    ];
    const places = placeLabels({ labels, obstacles: [pile, wall, panel], view: VIEW }) as Place[];
    for (const place of places) {
      assert.equal(place.clear, true);
      const rect = labelRect(place, W, H);
      for (const obstacle of [pile, wall, panel]) assert.equal(overlapArea(rect, obstacle, LABEL_GAP), 0);
    }
    // It stops at the first clear spot: just past the pile, not out at the wall.
    assert.ok(places[0]!.y - H / 2 >= pile.bottom + LABEL_GAP && places[0]!.y + H / 2 <= wall.top - LABEL_GAP);
    assert.ok(places[0]!.y < pile.bottom + LABEL_GAP + H / 2 + 4, "as near the pond as it can");
  });

  it("keeps labels off each other and off the screen's edges", () => {
    const spots = line({ x: 420, y: 10 }, { x: 0, y: 10 }, 30);
    const places = placeLabels({ labels: [0, 1, 2].map(() => ({ width: W, height: H, candidates: spots })), obstacles: [], view: VIEW }) as Place[];
    const rects = places.map((place) => labelRect(place, W, H));
    for (const rect of rects) assert.ok(rect.top >= LABEL_GAP && rect.bottom <= VIEW.height - LABEL_GAP);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) assert.equal(overlapArea(rects[i], rects[j]), 0, `labels ${i} and ${j} overlap`);
    }
  });

  it("on a packed table, takes the spot it overlaps least", () => {
    const candidates = [
      { x: 200, y: 200 },
      { x: 400, y: 200 },
    ];
    const obstacles: Rect[] = [
      { left: 0, top: 0, right: 844, bottom: 390 }, // every spot overlaps this
      { left: 150, top: 150, right: 250, bottom: 250 }, // and the first this too
    ];
    const [place] = placeLabels({ labels: [{ width: W, height: H, candidates }], obstacles, view: VIEW }) as Place[];
    assert.equal(place!.clear, false);
    assert.equal(place!.x, 400);
  });
});
