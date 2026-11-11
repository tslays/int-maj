import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld } from "../../src/core/hand.ts";
import { TIER_POINTS } from "../../src/core/patterns/types.ts";
import { matchHand } from "../../src/core/match.ts";
import { DEFAULT_LIMIT, scoreHand, tierPoints } from "../../src/core/score.ts";

describe("tier points", () => {
  it("matches the printed tier ladder", () => {
    assert.deepEqual(TIER_POINTS, {
      half: 500,
      limit: 1000,
      middle: 1500,
      double: 2000,
      calculate: null,
    });
  });

  it("scales printed tiers against the agreed limit", () => {
    assert.equal(tierPoints("half", 1000), 500);
    assert.equal(tierPoints("limit", 1000), 1000);
    assert.equal(tierPoints("middle", 1000), 1500);
    assert.equal(tierPoints("double", 1000), 2000);
    assert.equal(tierPoints("calculate", 1000), null);
    assert.equal(tierPoints("limit", 500), 500);
  });
});

describe("ground score and doubles", () => {
  it("scores the book's worked example at ground 84 and five doubles", () => {
    const hand = createHand({
      concealed: "b3 b3 b3 wE wE",
      melds: [
        meld({ kind: "pung", tiles: "wW wW wW", exposed: true }),
        meld({ kind: "kong", tiles: "dG dG dG dG", exposed: true }),
        meld({ kind: "kong", tiles: "b1 b1 b1 b1", exposed: false }),
      ],
      flowers: "f3",
      winningTile: "b3",
      selfDrawn: true,
      seatWind: "W",
      prevailingWind: "E",
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "ordinary-mahjong");
    assert.equal(result.ground, 84);
    assert.equal(result.doubles, 5);
    assert.equal(result.raw, 2688);
    assert.equal(result.points, 1000);
    assert.equal(result.limit, DEFAULT_LIMIT);
  });

  it("scores an uncapped ordinary hand as ground × 2^doubles", () => {
    const hand = createHand({
      concealed: "c1 c2 c3 c6 c6 c6 c7 c7 c7 c9 c9 c9 c5 c5",
      selfDrawn: false,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "ordinary-mahjong");
    assert.equal(result.ground, 36);
    assert.equal(result.doubles, 3);
    assert.equal(result.raw, 288);
    assert.equal(result.points, 288);
  });

  it("counts 1s and 9s as honours in the ground score", () => {
    const terminal = createHand({
      concealed: "b1 b1 b1 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      selfDrawn: false,
    });
    const middle = createHand({
      concealed: "b2 b2 b2 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      selfDrawn: false,
    });
    assert.equal(scoreHand(terminal).ground! - scoreHand(middle).ground!, 4);
    assert.equal(scoreHand(terminal).doubles, scoreHand(middle).doubles);
  });

  it("adds four points for each flower and season", () => {
    const bare = createHand({
      concealed: "b1 b1 b1 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      selfDrawn: false,
      seatWind: "W",
      prevailingWind: "E",
    });
    const withBonus = createHand({
      concealed: "b1 b1 b1 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      flowers: "f3",
      seasons: "s2",
      selfDrawn: false,
      seatWind: "W",
      prevailingWind: "E",
    });
    assert.equal(scoreHand(withBonus).ground! - scoreHand(bare).ground!, 8);
  });

  it("scores a non-scoring Buried Treasure at the printed 10 points", () => {
    const hand = createHand({
      concealed: "b2 b3 b4 b3 b4 b5 b6 b7 b8 b6 b7 b8 b9 b9",
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "buried-treasure");
    assert.equal(result.points, 10);
  });

  it("scores a bouquet as three doubles", () => {
    const bare = createHand({
      concealed: "b1 b1 b1 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      selfDrawn: false,
      seatWind: "W",
      prevailingWind: "E",
    });
    const bouquet = createHand({
      concealed: "b1 b1 b1 b5 b5 b5 b6 b7 b8 wS wS wS wE wE",
      flowers: "f1 f2 f3 f4",
      selfDrawn: false,
      seatWind: "W",
      prevailingWind: "E",
    });
    assert.equal(scoreHand(bouquet).ground! - scoreHand(bare).ground!, 16);
    assert.equal(scoreHand(bouquet).doubles! - scoreHand(bare).doubles!, 3);
  });

  it("caps a calculated hand at the agreed limit", () => {
    const hand = createHand({
      concealed: "c6 c6 c6 c7 c7 c7 c8 c8 c8 c9 c9 c9 c5 c5",
      selfDrawn: true,
    });
    assert.equal(scoreHand(hand, { limit: 500 }).points, 500);
  });
});

describe("scoring precedence", () => {
  const overlapping = createHand({
    concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
    selfDrawn: true,
  });

  it("returns every pattern the hand satisfies", () => {
    const found = scoreHand(overlapping).matches.map((match) => match.pattern.id);
    assert.ok(found.includes("ordinary-mahjong"));
    assert.ok(found.includes("three-great-scholars"));
  });

  it("awards the highest tier only, never the sum", () => {
    const result = scoreHand(overlapping);
    assert.equal(result.winning?.pattern.id, "three-great-scholars");
    assert.equal(result.tier, "middle");
    assert.equal(result.points, 1500);
  });

  it("scores a Calculate hand from ground and doubles", () => {
    const hand = createHand({
      concealed: "b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1 b1",
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "ordinary-mahjong");
    assert.equal(result.tier, "calculate");
    assert.equal(typeof result.points, "number");
    assert.equal(typeof result.ground, "number");
    assert.equal(typeof result.doubles, "number");
  });

  it("leaves a fixed tier independent of how the tile was won", () => {
    const onDiscard = createHand({
      concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
      selfDrawn: false,
    });
    const result = scoreHand(onDiscard);
    assert.equal(result.points, 1500);
    assert.deepEqual(Object.keys(result).sort(), [
      "doubles",
      "ground",
      "limit",
      "matches",
      "points",
      "raw",
      "tier",
      "winning",
    ]);
  });
});

describe("exposed and concealed-only effects", () => {
  it("scores an exposed Dragon's Tail at half limit", () => {
    const hand = createHand({
      concealed: "b4 b5 b6 b7 b8 b9 wE wE wE dR dR",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    const match = matchHand(hand).find(
      (entry) => entry.pattern.id === "dragons-tail",
    );
    assert.ok(match);
    assert.equal(match!.tier, "half");
    assert.equal(match!.points, 500);
  });

  it("does not score a concealed-only hand when a meld is exposed", () => {
    const hand = createHand({
      concealed: "b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning, null);
    assert.equal(result.points, null);
  });

  it("does not score Chow Chow when a meld is exposed", () => {
    const hand = createHand({
      concealed: "b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning, null);
    assert.equal(result.points, null);
  });

  it("does not score Chow Chow without a self-drawn win", () => {
    const hand = createHand({
      concealed: "b1 b2 b3 b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5",
      selfDrawn: false,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning, null);
    assert.equal(result.points, null);
  });

  it("returns no points when no pattern matches", () => {
    const hand = createHand({
      concealed: "b1 b4 b7 c2 c5 c8 o1 o4 o7 wE wS dR dG b9",
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning, null);
    assert.equal(result.matches.length, 0);
    assert.equal(result.points, null);
    assert.equal(result.ground, null);
  });
});
