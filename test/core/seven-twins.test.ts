/**
 * Seven Twins at the table (Companion p. 13: "Seven Pairs of anything. All
 * tiles from wall - INCLUDING LAST"). The last tile must be self-drawn, so the
 * hand can never be completed by a claim: not on a discard, not by robbing a
 * kong. A four-of-a-kind counts as two pairs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { legalActions, type GameState, type Seat } from "../../src/core/game/index.ts";
import { fixture, play, playError } from "../helpers/game-fixture.ts";

const FILLER = {
  W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};

// Mixed suits, so neither Heavenly Twins nor All Pair can also match.
const PAIRS_13 = "b2 b2 b3 b3 c4 c4 c6 c6 o5 o5 o7 o7 b9";

const winOptions = (state: GameState, seat: Seat) =>
  legalActions(state, seat).filter(
    (action) => action.type === "Win" || (action.type === "Claim" && action.kind === "mahjong"),
  );

describe("Seven Twins at the table", () => {
  it("cannot be completed on a discard", () => {
    const state = fixture({
      hands: { E: "b1 c1 c2 c3 c7 c8 c9 o1 o2 o3 wE wS b9 b8", S: PAIRS_13, ...FILLER },
      wall: ["o6", "o7"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b8", end: "front" },
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b9" }).state;
    assert.deepEqual(winOptions(discarded, "S"), []);
    playError(discarded, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b9"] }, /.*/);
  });

  it("cannot be completed by robbing a kong", () => {
    const robbed = (southHand: string) =>
      play(
        fixture({
          hands: { E: "b9 b5 b5 b5 b6 b7 b8 c1 c2 c3 c4", S: southHand, ...FILLER },
          melds: { E: [{ kind: "pung", tiles: ["b9", "b9", "b9"], exposed: true }] },
          wall: ["o1", "o2", "o3", "o9"],
          phase: "discard",
          turn: "E",
          lastDraw: { seat: "E", tile: "b9", end: "front" },
        }),
        { type: "AddedKong", seat: "E", tile: "b9" },
      ).state;
    // Control: an ordinary hand waiting on the same tile gets a rob window.
    const control = robbed("b1 b1 b1 b2 b3 b4 b5 b5 b5 b7 b7 b7 b9");
    assert.equal(control.claimWindow?.kind, "kong");
    // Seven pairs waiting on that tile: nobody can rob, so no window opens.
    const state = robbed(PAIRS_13);
    assert.notEqual(state.claimWindow?.kind, "kong");
    assert.deepEqual(winOptions(state, "S"), []);
    assert.equal(state.result?.winner ?? null, null);
  });

  it("wins when the last tile is self-drawn", () => {
    const state = fixture({
      hands: { E: "b2 b2 b3 b3 c4 c4 c6 c6 o5 o5 o7 o7 b9 b9", S: FILLER.W, ...FILLER },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b9", end: "front" },
    });
    assert.equal(winOptions(state, "E").length, 1);
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.result?.patternId, "seven-twins");
    assert.equal(won.state.result?.selfDrawn, true);
  });

  it("wins on a self-drawn loose tile", () => {
    const state = fixture({
      hands: { E: "b2 b2 b3 b3 c4 c4 c6 c6 o5 o5 o7 o7 b9 b9", S: FILLER.W, ...FILLER },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b9", end: "loose" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.result?.patternId, "seven-twins");
  });

  it("counts a kong as two pairs", () => {
    const state = fixture({
      hands: { E: "b2 b2 b2 b2 c4 c4 c6 c6 o5 o5 o7 o7 b9 b9", S: FILLER.W, ...FILLER },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b9", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.result?.patternId, "seven-twins");
  });

  it("is not available with an exposed meld", () => {
    const state = fixture({
      hands: { E: "c4 c4 c6 c6 o5 o5 o7 o7 b9 b9 b3 b3", S: FILLER.W, ...FILLER },
      melds: { E: [{ kind: "pung", tiles: ["b2", "b2", "b2"], exposed: true }] },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b3", end: "front" },
    });
    assert.deepEqual(winOptions(state, "E"), []);
  });
});
