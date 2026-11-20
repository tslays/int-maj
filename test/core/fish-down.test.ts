/**
 * The fish comes down when a throw leaves the hand waiting on nothing, and
 * may be shown again once the hand waits anew. A throw that changes the wait
 * keeps the fish up and follows the new wait.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewFor, type GameState } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
  W: "c2 c2 c2 c3 c3 c3 c4 c4 c4 c5 c5 c5 c6",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};
// All Pair waiting on the 9 circle, with a 1 character drawn.
const SHOWN = "wE wE wS wS wN wN o6 o6 o7 o7 o8 o8 o9 c1";
const FISH = { seat: "E" as const, wait: ["o9"], tier: "half" as const, value: 200 };

const fishTurn = (hand = SHOWN): GameState =>
  fixture({ hands: { E: hand, ...OTHERS }, wall: ["o5", "b9", "c9", "dR"], phase: "discard", turn: "E", fishing: [FISH] });

describe("taking the fish down", () => {
  it("takes the fish down when a throw leaves nothing to wait on", () => {
    const thrown = play(fishTurn(), { type: "Discard", seat: "E", tile: "wE" });
    assert.deepEqual(thrown.state.fishing, []);
    assert.ok(thrown.events.some((event) => event.type === "FishingWithdrawn" && event.seat === "E"));
    assert.notEqual(thrown.state.phase, "announce", "nothing to announce");
    assert.deepEqual(viewFor(thrown.state, "S").fishing, [], "the table sees no fish");
  });

  it("keeps the fish up when the throw keeps the wait", () => {
    const thrown = play(fishTurn(), { type: "Discard", seat: "E", tile: "c1" });
    assert.deepEqual(thrown.state.fishing, [FISH]);
    assert.ok(!thrown.events.some((event) => event.type === "FishingWithdrawn"));
  });

  it("follows a new wait when the throw changes it", () => {
    const thrown = play(fishTurn(), { type: "Discard", seat: "E", tile: "o9" });
    assert.equal(thrown.state.fishing.length, 1);
    assert.deepEqual(thrown.state.fishing[0]!.wait, ["c1"]);
    assert.equal(thrown.state.fishing[0]!.tier, "half");
  });

  it("offers the fish again once the hand waits anew", () => {
    const down = play(fishTurn(), { type: "Discard", seat: "E", tile: "wE" }).state;
    assert.deepEqual(down.fishing, []);
    // Later the hand waits again: the next throw is followed by the offer.
    const again = fixture({ hands: { E: SHOWN, ...OTHERS }, wall: ["o5"], phase: "discard", turn: "E", fishing: down.fishing });
    const thrown = play(again, { type: "Discard", seat: "E", tile: "c1" });
    assert.equal(thrown.state.phase, "announce");
    assert.ok(viewFor(thrown.state, "E").legalActions.some((action) => action.type === "DeclareFishing"));
  });
});
