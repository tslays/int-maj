import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld } from "../src/core/hand.ts";
import { TIER_POINTS } from "../src/core/patterns/types.ts";
import { matchHand } from "../src/core/match.ts";
import { scoreHand } from "../src/core/score.ts";

describe("tier points", () => {
  it("matches the book's four tiers", () => {
    assert.deepEqual(TIER_POINTS, {
      half: 500,
      limit: 1000,
      middle: 1500,
      double: 2000,
      calculate: null,
    });
  });
});

describe("scoring precedence", () => {
  const overlapping = createHand({
    concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
    selfDrawn: true,
  });

  it("returns every pattern the hand satisfies", () => {
    const result = scoreHand(overlapping);
    const found = result.matches.map((match) => match.pattern.id);
    assert.ok(found.includes("ordinary-mahjong"));
    assert.ok(found.includes("three-great-scholars"));
  });

  it("awards the highest tier only, never the sum", () => {
    const result = scoreHand(overlapping);
    assert.equal(result.winning?.pattern.id, "three-great-scholars");
    assert.equal(result.tier, "middle");
    assert.equal(result.points, 1500);
  });

  it("keeps Calculate hands unscored", () => {
    const hand = createHand({
      concealed: "b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1 b1",
      selfDrawn: true,
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "ordinary-mahjong");
    assert.equal(result.tier, "calculate");
    assert.equal(result.points, null);
  });

  it("ignores whether the winning tile came from a discard", () => {
    const onDiscard = createHand({
      concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
      selfDrawn: false,
    });
    const result = scoreHand(onDiscard);
    assert.equal(result.points, 1500);
    assert.deepEqual(Object.keys(result).sort(), [
      "matches",
      "points",
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
  });
});
