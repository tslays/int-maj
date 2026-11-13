/**
 * Seat labels with the centre pile (#122): a label never lies over the felt
 * the pile can cover while its wall is on the screen, and when the zoomed
 * view has cut its wall off it stays on the screen and slides clear of the
 * pile's tiles. `app/src/label-place.js` is plain numbers, so this needs no
 * browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { convexHull, LABEL_GAP, placeLabel, screenOverlap, SCREEN_MARGIN } from "../../app/src/label-place.js";

interface Point {
  readonly x: number;
  readonly y: number;
}

function rect(centre: Point, width: number, height: number): Point[] {
  return [
    { x: centre.x - width / 2, y: centre.y - height / 2 },
    { x: centre.x + width / 2, y: centre.y - height / 2 },
    { x: centre.x + width / 2, y: centre.y + height / 2 },
    { x: centre.x - width / 2, y: centre.y + height / 2 },
  ];
}

/** A table seen in perspective: the far wall's face narrower than the near one. */
const FELT = [
  { x: 260, y: 60 },
  { x: 580, y: 60 },
  { x: 660, y: 280 },
  { x: 180, y: 280 },
];
const CENTRE = { x: 420, y: 170 };
const VIEW = { width: 844, height: 390 };
const ANCHORS: Point[] = [
  { x: 420, y: 280 }, // you
  { x: 620, y: 170 }, // your right
  { x: 420, y: 60 }, // across
  { x: 220, y: 170 }, // your left
];

describe("seat labels with the centre pile", () => {
  it("finds the convex hull of a box's corners", () => {
    const hull: Point[] = convexHull([...FELT, { x: 420, y: 170 }, { x: 300, y: 100 }]);
    assert.equal(hull.length, 4);
    for (const corner of FELT) assert.ok(hull.some((p) => p.x === corner.x && p.y === corner.y));
  });

  it("moves each label off the felt, onto its wall, wherever the wall faces", () => {
    const hull = convexHull(FELT);
    for (const [rel, anchor] of ANCHORS.entries()) {
      for (const [width, height] of [
        [92, 24],
        [70, 44],
      ] as const) {
        const at: Point = placeLabel({ anchor, centre: CENTRE, hull, width, height, view: VIEW });
        assert.equal(screenOverlap(rect(at, width, height), hull, LABEL_GAP - 0.5), false, `seat ${rel}: the label lies on the felt`);
        // It moved straight out, not much further than half its size (a wall seen at a slant asks a little more).
        assert.ok(Math.hypot(at.x - anchor.x, at.y - anchor.y) <= Math.max(width, height) / 2 + LABEL_GAP + 12, `seat ${rel}: moved too far`);
      }
    }
  });

  it("keeps a label on the screen, sliding along the edge clear of the tiles, when its wall is off it", () => {
    // Zoomed: the felt runs off the top of the screen, and a tile lies right under the far label.
    const hull = convexHull([
      { x: 150, y: -120 },
      { x: 700, y: -120 },
      { x: 700, y: 390 },
      { x: 150, y: 390 },
    ]);
    const tiles = [rect({ x: 420, y: 30 }, 40, 50), rect({ x: 380, y: 30 }, 40, 50)];
    const at: Point = placeLabel({ anchor: { x: 420, y: -120 }, centre: { x: 425, y: 135 }, hull, tiles, width: 92, height: 24, view: VIEW });
    assert.equal(at.y, 12 + SCREEN_MARGIN, "held against the top of the screen");
    for (const tile of tiles) assert.equal(screenOverlap(rect(at, 92, 24), tile, LABEL_GAP - 0.5), false, "and clear of the tiles");
    assert.ok(at.x >= 46 + SCREEN_MARGIN && at.x <= VIEW.width - 46 - SCREEN_MARGIN, "and on the screen");
  });
});
