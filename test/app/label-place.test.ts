/**
 * Seat labels with the centre pile (#122): each seat's wind letter has one
 * fixed place, centred on the top of its wall, which depends on the camera
 * alone; a label whose place is off the screen is not shown.
 * `app/src/label-place.js` is plain numbers, so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { placeLabel } from "../../app/src/label-place.js";
// @ts-expect-error - a plain browser module without type declarations
import { H, W, WALL_TOP_CENTRE } from "../../app/src/layout.js";

const VIEW = { width: 844, height: 390 };

describe("seat labels with the centre pile", () => {
  it("centres each letter dead on the top of its wall", () => {
    for (const anchor of [{ x: 420, y: 280 }, { x: 620, y: 170 }, { x: 420, y: 60 }, { x: 220, y: 170 }]) {
      assert.deepEqual(placeLabel({ anchor, width: 24, height: 24, view: VIEW }), { ...anchor, shown: true });
    }
  });

  it("takes the wall's own centre, which sits off the seat's middle where the walls meet", () => {
    assert.deepEqual(WALL_TOP_CENTRE, { x: (W - H) / 2, z: 11 });
  });

  it("hides a label whose place is off the screen (the zoomed view cuts its wall off)", () => {
    assert.equal(placeLabel({ anchor: { x: 420, y: -40 }, width: 24, height: 24, view: VIEW }).shown, false);
    assert.equal(placeLabel({ anchor: { x: 6, y: 200 }, width: 24, height: 24, view: VIEW }).shown, false);
  });
});
