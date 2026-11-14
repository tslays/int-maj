/**
 * Buried Treasure with a pung is paid by ground and doubles (I p. 32, R-071);
 * its 10-point form is covered in the scoring tests. After #146 a pung left the win
 * unscored, so nobody paid (found with tester report #147).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apply, isApplyError, legalActions } from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};

function selfDrawn(hand: string, tile: string) {
  const state = fixture({
    hands: { E: hand, ...OTHERS },
    wall: ["c6", "o9", "dW", "c3"],
    phase: "discard",
    turn: "E",
    lastDraw: { seat: "E", tile, end: "front" },
  });
  const win = legalActions(state, "E").find((action) => action.type === "Win");
  assert.ok(win, "the self-drawn hand is a win");
  const done = apply(state, win);
  assert.ok(!isApplyError(done));
  assert.ok(done.state.result !== null && done.state.result.kind === "win");
  return { result: done.state.result, ledger: done.state.ledger };
}

describe("Buried Treasure scoring", () => {
  it("scores a pung, chows and a dragon pair by ground and doubles, and is paid", () => {
    const { result, ledger } = selfDrawn("c1 c1 c1 c2 c3 c4 c4 c5 c6 c7 c8 c9 dW dW", "c1");
    assert.equal(result.patternId, "buried-treasure");
    assert.ok(result.points !== null && result.points > 10, `scores ${result.points}`);
    assert.ok(ledger.every((entry) => entry.points !== null && entry.points > 0));
  });
});
