/**
 * Which tiles the table marks as just received in a Goulash exchange (#119,
 * #163). `app/src/received.js` is pure, so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { receivedPlan } from "../../app/src/received.js";

const game = { id: "game" };
const table = [{ discards: [] }, { discards: [] }, { discards: [] }, { discards: [] }];

function answer(handNumber: number, goulashReceived: { stage: number; tiles: string[] } | null, extra = {}) {
  return { game, table, view: { handNumber, goulashReceived }, ...extra };
}

describe("Goulash received marks (#163)", () => {
  it("marks all three tiles, including a received copy of one passed away", () => {
    const before = answer(1, null);
    const next = answer(1, { stage: 0, tiles: ["c8", "o1", "o2"] });
    assert.deepEqual(receivedPlan(before, next), ["c8", "o1", "o2"]);
  });

  it("marks the new exchange's tiles when the stage advances", () => {
    const before = answer(1, { stage: 0, tiles: ["c8", "o1", "o2"] });
    const next = answer(1, { stage: 1, tiles: ["b3", "b4", "b4"] });
    assert.deepEqual(receivedPlan(before, next), ["b3", "b4", "b4"]);
  });

  it("leaves the marks alone when the same exchange is still shown", () => {
    const before = answer(1, { stage: 0, tiles: ["c8", "o1", "o2"] });
    const next = answer(1, { stage: 0, tiles: ["c8", "o1", "o2"] });
    assert.equal(receivedPlan(before, next), null);
  });

  it("marks nothing before any exchange has been named", () => {
    assert.equal(receivedPlan(answer(1, null), answer(1, null)), null);
  });

  it("clears the marks at a new hand", () => {
    const before = answer(1, { stage: 2, tiles: ["c8", "o1", "o2"] });
    const next = answer(2, null);
    assert.equal(receivedPlan(before, next), "clear");
  });

  it("clears the marks once a tile has been thrown", () => {
    const before = answer(1, { stage: 2, tiles: ["c8", "o1", "o2"] });
    const next = answer(1, { stage: 2, tiles: ["c8", "o1", "o2"] }, {
      table: [{ discards: ["c3"] }, { discards: [] }, { discards: [] }, { discards: [] }],
    });
    assert.equal(receivedPlan(before, next), "clear");
  });

  it("clears the marks when there is no earlier view to compare with", () => {
    assert.equal(receivedPlan(null, answer(1, { stage: 0, tiles: ["c8", "o1", "o2"] })), "clear");
  });
});
