/**
 * Which hand tiles carry a fish: the discards that leave you fishing, on your
 * own discard turn, while Hints are on. `app/src/fishing-marks.js` is pure,
 * so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { fishDown, fishingMarks, fishNoteText } from "../../app/src/fishing-marks.js";

const DISCARDS = [
  { tile: "b5", hand: "Wriggly Snake", tier: "limit" },
  { tile: "o9", hand: "Wriggly Snake", tier: "limit" },
];

function payload(phase: string, turn: string, fishingDiscards: unknown = DISCARDS) {
  return { seat: "E", view: { phase, turn }, fishingDiscards };
}

describe("fish on hand tiles", () => {
  it("marks each discard that leaves you fishing, with its hand", () => {
    const marks = fishingMarks(payload("discard", "E"), true);
    assert.deepEqual([...marks], [
      ["b5", "Wriggly Snake"],
      ["o9", "Wriggly Snake"],
    ]);
  });

  it("marks nothing with Hints off", () => {
    assert.equal(fishingMarks(payload("discard", "E"), false).size, 0);
  });

  it("marks nothing off your own discard turn", () => {
    assert.equal(fishingMarks(payload("discard", "S"), true).size, 0);
    assert.equal(fishingMarks(payload("announce", "E"), true).size, 0);
    assert.equal(fishingMarks(null, true).size, 0);
  });

  it("copes with an answer from a server that sends no marks", () => {
    assert.equal(fishingMarks({ seat: "E", view: { phase: "discard", turn: "E" } }, true).size, 0);
  });

  it("names only the hand in the note", () => {
    assert.equal(fishNoteText("Wriggly Snake"), "Wriggly Snake");
  });
});

describe("the Fish down call-out", () => {
  const answer = (fishing: string[], handNumber = 1, game = "g1") => ({
    game,
    view: { handNumber, fishing: fishing.map((seat) => ({ seat })) },
  });

  it("names a seat whose fish came down in the same hand", () => {
    assert.deepEqual(fishDown(answer(["S", "W"]), answer(["W"])), ["S"]);
  });

  it("says nothing when a fish goes up or stays", () => {
    assert.deepEqual(fishDown(answer(["S"]), answer(["S", "W"])), []);
    assert.deepEqual(fishDown(null, answer([])), []);
  });

  it("says nothing when a new hand or another game clears the fish", () => {
    assert.deepEqual(fishDown(answer(["S"], 1), answer([], 2)), []);
    assert.deepEqual(fishDown(answer(["S"], 1, "g1"), answer([], 1, "g2")), []);
  });
});
