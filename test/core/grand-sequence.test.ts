/**
 * Grand Sequence (Companion pp. 11, 40): a run 1-9, a pung or kong of winds or
 * dragons, and "Any tile 1-9 paired" printed twice. Those two tiles pair with
 * tiles of the run; they are not a free pair (owner ruling 2026-11-14, tester
 * report #147: a player held 1-9, a second 1 and 4, two White Dragons, and the
 * discarded White Dragon had to be Mah Jong).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { legalActions } from "../../src/core/game/index.ts";
import { createHand } from "../../src/core/hand.ts";
import { matchHand } from "../../src/core/match.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};
const WALL = ["c6", "o9", "dW", "c3", "o5", "wN"].flatMap((key) => Array<string>(6).fill(key));

const makes = (tiles: string): boolean =>
  matchHand(createHand({ concealed: tiles, selfDrawn: false })).some((match) => match.pattern.id === "grand-sequence");

describe("Grand Sequence", () => {
  it("is the run, an honour pung and two tiles each pairing with a run tile", () => {
    assert.ok(makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW c1 c4"), "the tester's hand");
    assert.ok(makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 wN wN wN c8 c9"));
    assert.ok(makes("b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dG dG b5 b2"), "the book's second picture (Bamboo, Green Dragons)");
    assert.ok(makes("o1 o2 o3 o4 o5 o6 o7 o8 o9 wE wE wE o1 o9"));
  });

  it("is not a run, a pung and a pair from outside the run", () => {
    assert.ok(!makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW o5 o5"), "a pair of another suit");
    assert.ok(!makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW b9 c4"), "a tile of another suit");
    assert.ok(!makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW wE wE"), "a wind pair is not 1-9");
    assert.ok(!makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW c4"), "one paired tile of the two");
    assert.ok(!makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dR dR c1"), "no honour pung");
  });

  it("lets both tiles copy one run tile: 'any' is not 'different' (owner, 2026-11-14)", () => {
    assert.ok(makes("c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW dW c1 c1"), "1, 1, 1 with 2-9");
    assert.ok(makes("o1 o2 o3 o4 o5 o6 o7 o8 o9 wS wS wS o9 o9"));
  });

  it("is Mah Jong on a discarded White Dragon for the tester's hand", () => {
    const state = fixture({
      hands: { E: "c1 c1 c2 c3 c4 c4 c5 c6 c7 c8 c9 dW dW", ...OTHERS },
      wall: WALL,
      phase: "claim",
      turn: "E",
      claimWindow: { discarder: "N", tile: "dW", pending: ["E"], claims: [] },
    });
    const actions = legalActions(state, "E");
    assert.ok(actions.some((action) => action.type === "Win"), "Mah Jong is offered");
    assert.ok(actions.some((action) => action.type === "Claim" && action.kind === "pung"), "and the pung");
  });

  it("is not Mah Jong with only one spare tile", () => {
    const state = fixture({
      hands: { E: "c1 c1 c2 c3 c4 c5 c6 c7 c8 c9 dW dW o5", ...OTHERS },
      wall: WALL,
      phase: "claim",
      turn: "E",
      claimWindow: { discarder: "N", tile: "dW", pending: ["E"], claims: [] },
    });
    assert.ok(!legalActions(state, "E").some((action) => action.type === "Win"));
  });
});
