/**
 * The hand sets (all, Companion, Companion with pictures): the hands a set leaves
 * out are no hand for the scorer, the waits, the bots' plans or the closest-hands
 * helper alike.
 *
 * A left-out hand is no hand at all unless the tiles also make another one:
 * four pungs in three suits are a Mixed Pung and nothing else, so under the
 * house rule they are neither a win nor a wait.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  closestHands,
  handIsComplete,
  newGame,
  nextHand,
  replaySteps,
  serialize,
  situationFor,
  stepsFromEvents,
  viewFor,
  waitsOf,
} from "../../src/core/game/index.ts";
import { planGoals } from "../../src/core/game/bot/plan.ts";
import { createHand } from "../../src/core/hand.ts";
import {
  COMPANION_UNILLUSTRATED_HANDS,
  HAND_SET_EXCLUDED,
  ILLUSTRATED_ONLY_HANDS,
  PATTERNS,
} from "../../src/core/patterns/table.ts";
import { scoreHand } from "../../src/core/score.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b2 b3 b5 b6 c1 c2 c3 c4 c6 c7 o4 o5 o6",
  N: "c1 c2 c3 c4 c6 o4 o5 o6 o7 o8 wS wW dW",
};
const LONG_WALL: readonly string[] = Array.from(
  { length: 60 },
  (_, index) => ["c6", "o7", "dW", "c3", "o5", "wN"][index % 6]!,
);

// Mixed Pung (I p. 30): four pungs and a pair, every tile from the wall.
const MIXED_PUNG = "b1 b1 b1 c5 c5 c5 o9 o9 o9 wE wE wE b4 b4";
const MIXED_PUNG_WAITING = "b1 b1 b1 c5 c5 c5 o9 o9 o9 wE wE b4 b4";
// Buried Treasure (I p. 38): one suit, chows and a pair, every tile from the wall.
const BURIED_TREASURE = "o2 o3 o4 o3 o4 o5 o6 o7 o8 o6 o7 o8 o9 o9";

describe("hand sets", () => {
  it("leaves out exactly the hands the Companion does not print", () => {
    // rules/AUDIT.md "Missing from the table": I p. 38 hand 11, and the two on I p. 30.
    assert.deepEqual([...ILLUSTRATED_ONLY_HANDS].sort(), ["all-kong", "buried-treasure", "mixed-pung"]);
    for (const id of ILLUSTRATED_ONLY_HANDS) {
      assert.ok(PATTERNS.some((pattern) => pattern.id === id));
    }
  });

  it("is exactly the Companion's \"N/I\" hands that the pictured set drops", () => {
    // C p. 4 "N/I = Not Illustrated"; the synopsis marks these nine (rules/RULES.md Part III §2).
    assert.deepEqual([...COMPANION_UNILLUSTRATED_HANDS].sort(), [
      "blue-mountains", "down-you-go", "dragons-run", "dragons-scales", "driven-snow",
      "ods-evens", "robin", "up-you-go", "white-elephant",
    ]);
    assert.deepEqual(HAND_SET_EXCLUDED.all, []);
    assert.deepEqual(HAND_SET_EXCLUDED.companion, ILLUSTRATED_ONLY_HANDS);
    for (const id of ILLUSTRATED_ONLY_HANDS) {
      assert.ok(!COMPANION_UNILLUSTRATED_HANDS.includes(id), "no hand is in both lists");
    }
    assert.equal(HAND_SET_EXCLUDED["companion-pictured"].length, 12);
  });

  it("does not offer Dragon's Run as a wait once pictures are required", () => {
    // Run 1-9 + one of each Dragon + a pair of Winds (C p. 59, N/I).
    const waiting = {
      hands: { E: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dR dW wE", ...OTHERS },
      wall: LONG_WALL,
      phase: "draw",
      turn: "E",
    } as const;
    // A second wind of any kind also makes Five Odd Honours (in both books, pictured): only
    // the matching East Wind needs Dragon's Run.
    const everyWind = ["wE", "wS", "wW", "wN"];
    assert.deepEqual(waitsOf(fixture(waiting), "E"), everyWind);
    assert.deepEqual(waitsOf(fixture({ ...waiting, excludedHands: HAND_SET_EXCLUDED.companion }), "E"), everyWind);
    assert.deepEqual(
      waitsOf(fixture({ ...waiting, excludedHands: HAND_SET_EXCLUDED["companion-pictured"] }), "E"),
      ["wS", "wW", "wN"],
    );
    const view = viewFor(fixture({ ...waiting, excludedHands: HAND_SET_EXCLUDED["companion-pictured"] }), "E");
    assert.ok(closestHands(view, 50).every((hand) => hand.pattern !== "dragons-run"));
  });

  it("does not accept a Mixed Pung when the hand is left out", () => {
    const hand = createHand({ concealed: MIXED_PUNG, selfDrawn: true });
    const printed = scoreHand(hand);
    assert.equal(printed.winning?.pattern.id, "mixed-pung");
    assert.equal(printed.points, 1000);

    const house = scoreHand(hand, { excluded: ILLUSTRATED_ONLY_HANDS });
    assert.equal(house.winning, null, "three suits: no ordinary hand either (I p. 34)");
    assert.deepEqual(house.matches, []);
  });

  it("scores the tiles as the other hand they make, never as Buried Treasure", () => {
    const hand = createHand({ concealed: BURIED_TREASURE, selfDrawn: true });
    assert.ok(scoreHand(hand).matches.some((match) => match.pattern.id === "buried-treasure"));
    const house = scoreHand(hand, { excluded: ILLUSTRATED_ONLY_HANDS });
    assert.equal(house.winning?.pattern.id, "chow-chow", "the Companion's own four-chow hand (C p. 15)");
    assert.ok(house.matches.every((match) => match.pattern.id !== "buried-treasure"));
  });

  it("is neither a win nor a wait in a game", () => {
    const base = { hands: { E: MIXED_PUNG, ...OTHERS }, wall: LONG_WALL, phase: "discard", turn: "E" } as const;
    const printed = handIsComplete(fixture(base), "E", "wE");
    assert.equal(printed?.winning?.pattern.id, "mixed-pung");
    const house = handIsComplete(fixture({ ...base, excludedHands: ILLUSTRATED_ONLY_HANDS }), "E", "wE");
    assert.equal(house, null);

    const waiting = { ...base, hands: { E: MIXED_PUNG_WAITING, ...OTHERS }, phase: "draw" } as const;
    assert.deepEqual(waitsOf(fixture(waiting), "E"), ["b4", "wE"]);
    assert.deepEqual(waitsOf(fixture({ ...waiting, excludedHands: ILLUSTRATED_ONLY_HANDS }), "E"), []);
  });

  it("drops the hands from the closest-hands helper and from the bots' plans", () => {
    const base = { hands: { E: MIXED_PUNG_WAITING, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" } as const;
    const printed = closestHands(viewFor(fixture(base), "E"), 50);
    assert.ok(printed.some((hand) => hand.pattern === "mixed-pung"), "listed by the book's own rules");

    const view = viewFor(fixture({ ...base, excludedHands: ILLUSTRATED_ONLY_HANDS }), "E");
    assert.deepEqual(view.excludedHands, ILLUSTRATED_ONLY_HANDS);
    const house = closestHands(view, 50);
    assert.ok(house.length > 0);
    assert.ok(house.every((hand) => !ILLUSTRATED_ONLY_HANDS.includes(hand.pattern)));
    for (const seat of ["E", "S", "W", "N"] as const) {
      const seatView = viewFor(fixture({ ...base, excludedHands: ILLUSTRATED_ONLY_HANDS }), seat);
      const goals = planGoals(situationFor(seatView, seat));
      assert.ok(goals.every((goal) => !ILLUSTRATED_ONLY_HANDS.includes(goal.pattern)));
    }
  });

  it("is dealt with the game, changes only at a deal, and replays", () => {
    const dealt = newGame("house-rules", { dealer: "E", excludedHands: ILLUSTRATED_ONLY_HANDS });
    assert.deepEqual(dealt.state.excludedHands, ILLUSTRATED_ONLY_HANDS);
    assert.equal(newGame("house-rules", { dealer: "E" }).state.excludedHands, undefined);

    const finished = fixture({
      excludedHands: ILLUSTRATED_ONLY_HANDS,
      phase: "finished",
      result: { ...drawnResult(), nextDealer: "S" },
    });
    const kept = nextHand(finished);
    assert.deepEqual(kept.state.excludedHands, ILLUSTRATED_ONLY_HANDS);
    assert.deepEqual(stepsFromEvents(kept.events), [{ type: "NextHand" }]);

    const lifted = nextHand(finished, { excludedHands: [] });
    assert.equal(lifted.state.excludedHands, undefined);
    assert.deepEqual(stepsFromEvents(lifted.events), [{ type: "NextHand", excludedHands: [] }]);

    const replayed = replaySteps("house-rules", [], { dealer: "E", excludedHands: ILLUSTRATED_ONLY_HANDS });
    assert.equal(serialize(replayed.state), serialize(dealt.state));
  });
});

function drawnResult() {
  const state = fixture({ wall: [], phase: "draw", turn: "E" });
  return {
    ...(state.result ?? {}),
    kind: "drawn",
    winner: null,
    from: null,
    selfDrawn: false,
    tile: null,
    patternId: null,
    patternName: null,
    tier: null,
    points: null,
    ground: null,
    doubles: null,
    raw: null,
    limit: 1000,
    nextDealer: "S",
    reason: "wall exhausted",
  } as unknown as NonNullable<ReturnType<typeof fixture>["result"]>;
}
