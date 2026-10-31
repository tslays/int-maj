/**
 * Generic matcher: evaluates every pattern in the table against one
 * normalised hand. No hand-specific branching lives here.
 */

import { isConcealed, type Hand } from "./hand.ts";
import { normalizeHand, type HandShape } from "./shape.ts";
import { PATTERNS } from "./patterns/table.ts";
import { TIER_POINTS, type HandPattern, type Tier } from "./patterns/types.ts";

export interface PatternMatch {
  readonly pattern: HandPattern;
  /** Effective tier after the concealed/exposed rule. */
  readonly tier: Tier;
  readonly points: number | null;
  readonly concealed: boolean;
}

export function matchHand(hand: Hand, shape: HandShape = normalizeHand(hand)): PatternMatch[] {
  const concealed = isConcealed(hand);
  const context = {
    shape,
    hand,
    isConcealed: concealed,
    isSelfDrawn: hand.selfDrawn,
  };

  const matches: PatternMatch[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.requiresSelfDrawn && !hand.selfDrawn) continue;
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier === null) continue;
    if (!pattern.match(context)) continue;
    matches.push({ pattern, tier, points: TIER_POINTS[tier], concealed });
  }

  // Highest tier wins. Equal tiers keep table order (the table is the
  // documented precedence order); scoring never adds tiers together.
  return matches.sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
}

export function bestMatch(hand: Hand): PatternMatch | null {
  return matchHand(hand)[0] ?? null;
}
