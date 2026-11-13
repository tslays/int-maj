/**
 * House rule "a win needs the fish shown" (#118): a seat offered the fishing
 * announcement goes out only after showing the fish. A seat never offered it
 * (waiting straight from the deal) may go out. Off by default: neither book
 * asks for an announcement before a win (I p. 21, C p. 55).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  chooseAction,
  isApplyError,
  legalActions,
  viewFor,
  WIN_NEEDS_FISH,
  type GameState,
} from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

// South waits on the 1 Bamboo for an ordinary hand (three pungs, a chow, the pair).
const SOUTH_WAITING = "b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1";
const HANDS = {
  E: "b1 c5 c6 c1 c2 c3 o1 o2 o3 wN wN dG dR dW",
  S: SOUTH_WAITING,
  W: "b2 b3 b5 b6 c1 c2 c3 c4 c6 c7 o4 o5 o6",
  N: "c1 c2 c7 c8 c9 o4 o5 o6 o7 o8 wS wW dW",
};
const WALL: readonly string[] = Array.from({ length: 60 }, (_, index) => ["c6", "o7", "b9", "c3", "o5", "wN"][index % 6]!);
const SHOWN = { seat: "S", wait: ["b1"], tier: "calculate" } as const;

/** East throws the 1 Bamboo; true when South is offered Mah Jong on it. */
function southMayClaim(options: Parameters<typeof fixture>[0]): boolean {
  const state = fixture({ hands: HANDS, wall: WALL, phase: "discard", turn: "E", ...options });
  const thrown = apply(state, { type: "Discard", seat: "E", tile: "b1" });
  assert.ok(!isApplyError(thrown));
  const after = thrown.state as GameState;
  return legalActions(after, "S").some((action) => action.type === "Win");
}

describe("a win needs the fish shown (house rule)", () => {
  it("changes nothing when the table does not play it", () => {
    assert.equal(southMayClaim({ fishOffered: ["S"] }), true);
  });

  it("bars a seat that was offered the announcement and kept quiet", () => {
    assert.equal(southMayClaim({ excludedHands: [WIN_NEEDS_FISH], fishOffered: ["S"] }), false);
  });

  it("lets a seat that showed the fish go out", () => {
    assert.equal(southMayClaim({ excludedHands: [WIN_NEEDS_FISH], fishOffered: ["S"], fishing: [SHOWN] }), true);
  });

  it("lets a seat go out that never had the chance to announce", () => {
    assert.equal(southMayClaim({ excludedHands: [WIN_NEEDS_FISH] }), true);
  });

  it("applies to a self-drawn win too", () => {
    const base = {
      hands: { ...HANDS, S: `${SOUTH_WAITING} b1` },
      wall: WALL,
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "b1", end: "front" },
    } as const;
    const wins = (options: Parameters<typeof fixture>[0]) =>
      legalActions(fixture({ ...base, ...options }), "S").some((action) => action.type === "Win");
    assert.equal(wins({}), true);
    assert.equal(wins({ excludedHands: [WIN_NEEDS_FISH], fishOffered: ["S"] }), false);
    assert.equal(wins({ excludedHands: [WIN_NEEDS_FISH], fishOffered: ["S"], fishing: [SHOWN] }), true);
  });

  it("records the offer when a discard leaves a seat fishing", () => {
    const state = fixture({
      hands: { ...HANDS, S: `${SOUTH_WAITING} dR` },
      wall: WALL,
      phase: "discard",
      turn: "S",
      excludedHands: [WIN_NEEDS_FISH],
    });
    const thrown = apply(state, { type: "Discard", seat: "S", tile: "dR" });
    assert.ok(!isApplyError(thrown));
    assert.equal(thrown.state.phase, "announce");
    assert.deepEqual(thrown.state.fishOffered, ["S"]);
    assert.equal(viewFor(thrown.state, "S").winNeedsFish, true);
    // A bot shows the fish at once under the rule, however long the wall.
    assert.equal(chooseAction(viewFor(thrown.state, "S"), "S")?.type, "DeclareFishing");
  });
});
