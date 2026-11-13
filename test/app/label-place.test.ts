/**
 * Seat labels with the centre pile (#122): each label has one fixed place
 * against the inside of its wall, from the wall's face towards the table's
 * centre, which depends on the camera alone; a label whose place is off the
 * screen is not shown. `app/src/label-place.js` is plain numbers, so this
 * needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { LABEL_GAP, placeLabel } from "../../app/src/label-place.js";

const VIEW = { width: 844, height: 390 };
const CENTRE = { x: 420, y: 170 };

describe("seat labels with the centre pile", () => {
  it("stands each label on the felt against its wall, facing the centre", () => {
    // Your wall below the pond: the label lies just above it.
    const near = placeLabel({ anchor: { x: 420, y: 280 }, centre: CENTRE, width: 100, height: 24, view: VIEW });
    assert.deepEqual(near, { x: 420, y: 280 - 12 - LABEL_GAP, shown: true });
    // The seat on your right: the label stands on end, just left of its wall.
    const side = placeLabel({ anchor: { x: 620, y: 170 }, centre: CENTRE, width: 80, height: 24, turned: true, view: VIEW });
    assert.deepEqual(side, { x: 620 - 12 - LABEL_GAP, y: 170, shown: true });
  });

  it("lays the far seat's label half over its wall", () => {
    const far = placeLabel({ anchor: { x: 420, y: 60 }, centre: CENTRE, width: 90, height: 24, over: 0.5, view: VIEW });
    assert.deepEqual(far, { x: 420, y: 60, shown: true });
  });

  it("depends on the camera alone: the same view gives the same place", () => {
    const args = { anchor: { x: 220, y: 170 }, centre: CENTRE, width: 80, height: 24, turned: true, view: VIEW };
    assert.deepEqual(placeLabel(args), placeLabel(args));
  });

  it("hides a label whose place is off the screen (the zoomed view cuts its wall off)", () => {
    const cut = placeLabel({ anchor: { x: 420, y: -40 }, centre: { x: 420, y: 200 }, width: 90, height: 24, over: 0.5, view: VIEW });
    assert.equal(cut.shown, false);
  });
});
