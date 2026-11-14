/**
 * A fishing wait that can only be won from the wall (tester report #147).
 *
 * 1-9 in characters, a spare 1 and 4 and two White Dragons wait on a 1
 * (Buried Treasure, every tile of which must come from the wall, I p. 38) and on a
 * White Dragon (Buried Treasure, or Grand Sequence, which a discard completes too).
 * Only the 1 wins from the wall alone.
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
// One suit with chows and a dragon pair: only Buried Treasure, so a discard wins nothing.
const BURIED_ONLY = "c2 c3 c4 c3 c4 c5 c6 c7 c8 c9 c9 dW dW";
// Wriggly Snake, one wind short: a concealed hand that wins from a discard too.
const SNAKE = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5";

const announce = (hand: string) =>
  viewFor(fixture({ hands: { E: hand, ...OTHERS }, wall: WALL, phase: "announce", turn: "E" }), "E");

describe("a wait that wins only from the wall", () => {
  it("marks only the tiles a discard cannot win", () => {
    const view = announce(TESTER);
    const offer = view.legalActions.find((action) => action.type === "DeclareFishing");
    assert.ok(offer && offer.type === "DeclareFishing");
    assert.deepEqual([...offer.wait].sort(), ["c1", "dW"]);
    assert.deepEqual(view.fishingDrawOnly, ["c1"], "the White Dragon completes Grand Sequence from a discard");
  });

  it("marks every tile when only Buried Treasure completes the hand", () => {
    const view = announce(BURIED_ONLY);
    const offer = view.legalActions.find((action) => action.type === "DeclareFishing");
    assert.ok(offer && offer.type === "DeclareFishing");
    assert.deepEqual([...view.fishingDrawOnly].sort(), [...offer.wait].sort());
    assert.ok(view.fishingDrawOnly.length > 0);
  });

  it("marks nothing when a discard wins the wait too", () => {
    const view = announce(SNAKE);
    assert.ok(view.legalActions.some((action) => action.type === "DeclareFishing"));
    assert.deepEqual(view.fishingDrawOnly, []);
  });

  it("says nothing when there is no announcement to make", () => {
    const state = fixture({ hands: { E: TESTER, ...OTHERS }, wall: WALL, phase: "draw", turn: "E" });
    assert.deepEqual(viewFor(state, "E").fishingDrawOnly, []);
  });

  it("offers no Mah Jong on a discard that only Buried Treasure would take", () => {
    const state = fixture({
      hands: { E: BURIED_ONLY, ...OTHERS },
      wall: WALL,
      phase: "claim",
      turn: "E",
      claimWindow: { discarder: "N", tile: "c9", pending: ["E"], claims: [] },
    });
    assert.ok(!legalActions(state, "E").some((action) => action.type === "Win"));
  });
});
