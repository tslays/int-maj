/**
 * A fishing wait that can only be won from the wall (tester report #147).
 *
 * 1-9 in characters, a spare 1 and 4 and two White Dragons wait on a 1 or a
 * White Dragon for Buried Treasure, which every tile of must come from the
 * wall (I p. 38). Drawn, either wins; thrown by another player, neither does.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { legalActions, viewFor } from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};
const WALL = Array.from({ length: 40 }, (_, index) => ["c6", "o9", "dW", "c3", "o5", "wN"][index % 6]!);
const TESTER = "c1 c1 c2 c3 c4 c4 c5 c6 c7 c8 c9 dW dW";
// Wriggly Snake, one wind short: a concealed hand that wins from a discard too.
const SNAKE = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5";

describe("a wait that wins only from the wall", () => {
  it("marks every tile of the wait when only a self-drawn hand completes it", () => {
    const state = fixture({ hands: { E: TESTER, ...OTHERS }, wall: WALL, phase: "announce", turn: "E" });
    const view = viewFor(state, "E");
    const offer = view.legalActions.find((action) => action.type === "DeclareFishing");
    assert.ok(offer && offer.type === "DeclareFishing");
    assert.deepEqual([...offer.wait].sort(), ["c1", "dW"]);
    assert.deepEqual([...view.fishingDrawOnly].sort(), ["c1", "dW"]);
  });

  it("marks nothing when a discard wins the wait too", () => {
    const state = fixture({ hands: { E: SNAKE, ...OTHERS }, wall: WALL, phase: "announce", turn: "E" });
    assert.ok(viewFor(state, "E").legalActions.some((action) => action.type === "DeclareFishing"));
    assert.deepEqual(viewFor(state, "E").fishingDrawOnly, []);
  });

  it("says nothing when there is no announcement to make", () => {
    const state = fixture({ hands: { E: TESTER, ...OTHERS }, wall: WALL, phase: "draw", turn: "E" });
    assert.deepEqual(viewFor(state, "E").fishingDrawOnly, []);
  });

  it("offers no Mah Jong on the discarded White Dragon, only the pung", () => {
    const state = fixture({
      hands: { E: TESTER, ...OTHERS },
      wall: WALL,
      phase: "claim",
      turn: "E",
      claimWindow: { discarder: "N", tile: "dW", pending: ["E"], claims: [] },
    });
    const actions = legalActions(state, "E");
    assert.ok(!actions.some((action) => action.type === "Win"));
    assert.ok(actions.some((action) => action.type === "Claim" && action.kind === "pung"));
  });
});
