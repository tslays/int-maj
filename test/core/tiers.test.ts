import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PATTERNS } from "../../src/core/patterns/table.ts";
import {
  TIER_FISHING,
  TIER_POINTS,
  type Tier,
} from "../../src/core/patterns/types.ts";

const PRINTED: Readonly<
  Record<string, readonly [Tier, Tier | null, number | null]>
> = {
  "wriggly-snake": ["limit", null, 1000],
  "run-pung-pair": ["limit", null, 1000],
  "seven-twins": ["half", null, 500],
  "heads-and-tails": ["limit", "limit", 1000],
  "all-pair": ["half", null, 500],
  "all-pair-honours": ["limit", null, 1000],
  "gates-of-heaven": ["limit", null, 1000],
  "heavenly-twins": ["limit", null, 1000],
  "confused-gates": ["limit", null, 1000],
  "red-waratah": ["limit", "half", 1000],
  "dragons-teeth": ["limit", "limit", 1000],
  "all-pair-jade": ["limit", null, 1000],
  "buried-treasure": ["calculate", null, null],
  "chinese-ordinary": ["calculate", "calculate", null],
  "all-kong": ["limit", "limit", 1000],
  "mixed-pung": ["limit", null, 1000],
  "unique-wonder": ["double", null, 2000],
  "windy-ones": ["limit", "half", 1000],
  "three-sisters": ["limit", "half", 1000],
  "three-great-scholars": ["middle", "middle", 1500],
  "four-blessings": ["middle", "middle", 1500],
  "sparrows-sanctuary": ["middle", null, 1500],
  lillypilly: ["limit", "half", 1000],
  "all-winds-and-dragons": ["limit", "limit", 1000],
  "chow-chow": ["half", null, 500],
  professors: ["half", null, 500],
  "little-brother": ["half", null, 500],
  "ods-evens": ["middle", "middle", 1500],
  robin: ["half", "half", 500],
  dragonfly: ["limit", "half", 1000],
  "ordinary-mahjong": ["calculate", "calculate", null],
  "all-honour-hand": ["calculate", "calculate", null],
  "purity-hand": ["calculate", "calculate", null],
  "seven-brothers": ["limit", "half", 1000],
  "numbers-doubled": ["middle", "middle", 1500],
  "dragons-run": ["middle", "middle", 1500],
  "chinese-odds": ["middle", "middle", 1500],
  "civil-war": ["middle", "middle", 1500],
  "up-you-go": ["double", "double", 2000],
  "down-you-go": ["double", "double", 2000],
};

describe("printed tier table", () => {
  for (const [id, [tier, exposed, points]] of Object.entries(PRINTED)) {
    it(`${id} uses the synopsis values`, () => {
      const pattern = PATTERNS.find((entry) => entry.id === id);
      assert.ok(pattern, `missing pattern ${id}`);
      assert.equal(pattern.tier, tier);
      assert.equal(pattern.exposedTier, exposed);
      assert.equal(TIER_POINTS[tier], points);
    });
  }

  it("has a point value for every tier, with Calculate unscored", () => {
    assert.deepEqual(TIER_POINTS, {
      half: 500,
      limit: 1000,
      middle: 1500,
      double: 2000,
      calculate: null,
    });
    assert.deepEqual(TIER_FISHING, {
      half: 200,
      limit: 400,
      middle: 600,
      double: 800,
      calculate: null,
    });
  });

  it("only uses known tiers", () => {
    const tiers = new Set(Object.keys(TIER_POINTS));
    for (const pattern of PATTERNS) {
      assert.ok(tiers.has(pattern.tier), `${pattern.id} has tier ${pattern.tier}`);
      if (pattern.exposedTier !== null) {
        assert.ok(
          tiers.has(pattern.exposedTier),
          `${pattern.id} has exposedTier ${pattern.exposedTier}`,
        );
      }
    }
  });
});
