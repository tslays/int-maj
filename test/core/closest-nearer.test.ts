/**
 * The closest-hands panel never passes one version of a hand off as another:
 * when the seat is nearer a version it cannot play, the hand shown says so
 * (`ClosestHand.nearer`). Tester reports #209 (Big Robert in a Goulash with
 * the half-limit bar, C pp. 14 and 55) and #211 (a Triple Knitting wait whose
 * every copy was already discarded).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestHands, viewFor } from "../../src/core/game/index.ts";
import { GOULASH_NO_HALF_LIMIT } from "../../src/core/game/hands.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dG dG dW dW",
  W: "b1 b2 b5 b6 c1 c2 c5 c6 c7 c9 wE wS wW",
  N: "c5 c6 c7 c8 c9 o7 o8 o9 b5 b6 b7 b8 b9",
};

const LONG_WALL: readonly string[] = Array.from(
  { length: 60 },
  (_, index) => ["c2", "o9", "dW", "c3", "o5", "wN"][index % 6]!,
);

function find(state: ReturnType<typeof fixture>, pattern: string) {
  const hand = closestHands(viewFor(state, "E"), 100).find((entry) => entry.pattern === pattern);
  assert.ok(hand, `${pattern} is in reach`);
  return hand;
}

describe("a nearer version the seat cannot play", () => {
  // #209: 1-4 bamboos, 1 3 4 characters, 3-6 circles, two Red Dragons. The 2 character
  // makes the mixed-numbers Big Robert, half limit (C p. 14), which the bar removes (C p. 55).
  const ROBERT = "b1 b2 b3 b4 c1 c3 c4 o3 o4 o5 o6 dR dR";
  const base = { hands: { E: ROBERT, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" } as const;

  it("shows Big Robert's limit version in a barred Goulash, and says the nearer one is barred", () => {
    const robert = find(fixture({ ...base, goulash: true, excludedHands: [GOULASH_NO_HALF_LIMIT] }), "big-robert");
    assert.equal(robert.tier, "limit");
    assert.equal(robert.points, 1000);
    assert.ok(robert.away > 1, `the same-numbers version is further: ${robert.need}`);
    assert.equal(robert.scoringWhen, "when the three runs use the same numbers");
    assert.deepEqual(robert.nearer, {
      away: 1,
      need: ["c2"],
      dead: [],
      barred: "half",
      scoringWhen: "when the three runs do not all use the same numbers",
    });
  });

  it("shows the mixed version itself, with nothing nearer, outside a Goulash", () => {
    const robert = find(fixture(base), "big-robert");
    assert.equal(robert.tier, "half");
    assert.equal(robert.away, 1);
    assert.deepEqual(robert.need, ["c2"]);
    assert.equal(robert.nearer, null);
  });

  // #211: four knitted triples less one tile, waiting on the 6 circle (C p. 20).
  const KNITTING = "b4 b4 b6 b7 b8 c4 c6 c7 c8 o4 o4 o7 o8";
  const knitting = { hands: { E: KNITTING, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" } as const;

  it("names a wait whose every copy is in sight, and shows the nearest version still open", () => {
    const state = fixture({ ...knitting, discards: { W: ["o6", "o6"], N: ["o6", "o6"] } });
    const hand = find(state, "triple-knitting");
    assert.ok(hand.away > 1, `the 6 circle is gone, so the hand is further: ${hand.need}`);
    assert.ok(!hand.need.includes("o6"));
    assert.equal(hand.nearer?.away, 1);
    assert.deepEqual(hand.nearer?.need, ["o6"]);
    assert.deepEqual(hand.nearer?.dead, ["o6"]);
    assert.equal(hand.nearer?.barred, null);
  });

  it("says nothing while a copy of the wait is still unseen", () => {
    const state = fixture({ ...knitting, discards: { W: ["o6", "o6"], N: ["o6"] } });
    const hand = find(state, "triple-knitting");
    assert.equal(hand.away, 1);
    assert.deepEqual(hand.need, ["o6"]);
    assert.equal(hand.nearer, null);
    assert.ok(hand.chance > 0);
  });
});
