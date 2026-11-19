import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { continueNote } = await import("../../app/src/start-note.js");

describe("the Continue card", () => {
  it("names the round, the hand and your points", () => {
    const payload = { seat: "S", view: { prevailingWind: "E", handNumber: 3 } };
    assert.equal(continueNote(payload, { E: 0, S: 16400, W: 0, N: 0 }), "East round · hand 3 · 16,400 points");
    assert.equal(
      continueNote({ seat: "E", view: { prevailingWind: "N", handNumber: 12 } }, { E: 9500, S: 0, W: 0, N: 0 }),
      "North round · hand 12 · 9,500 points",
    );
  });
});
