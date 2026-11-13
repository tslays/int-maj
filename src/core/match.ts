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

/**
 * An `excluded` entry that bars every hand at one tier rather than one hand
 * by id: "tier:half" leaves out whatever would score at half limit, so a hand
 * that is half limit only when exposed still counts concealed.
 */
export function tierExclusion(tier: Tier): string {
  return `tier:${tier}`;
}

/** True when `excluded` leaves out this pattern, by id or by the tier it scores at. */
export function isExcluded(excluded: readonly string[], patternId: string, tier: Tier): boolean {
  return excluded.includes(patternId) || excluded.includes(tierExclusion(tier));
}

/**
 * `excluded` names hands the table has agreed to play without (a house rule),
 * by id or by tier (`tierExclusion`): they are skipped, so a hand that also makes another pattern scores as that.
 */
export function matchHand(
  hand: Hand,
  shape: HandShape = normalizeHand(hand),
  excluded: readonly string[] = [],
): PatternMatch[] {
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
    if (isExcluded(excluded, pattern.id, tier)) continue;
    if (!pattern.match(context)) continue;
    matches.push({ pattern, tier, points: TIER_POINTS[tier], concealed });
  }

  // Highest tier wins. Equal tiers keep table order (the table is the
  // documented precedence order); scoring never adds tiers together.
  return matches.sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
}

/**
 * True when some catalogue hand that `accept` allows matches: the same answer
 * as `matchHand(hand).some(...)`, but it stops at the first one. Wait checks
 * ask this for every tile after every discard, so it matters.
 */
export function matchesAny(
  hand: Hand,
  accept: (pattern: HandPattern, tier: Tier) => boolean,
  shape: HandShape = normalizeHand(hand),
): boolean {
  const concealed = isConcealed(hand);
  const context = { shape, hand, isConcealed: concealed, isSelfDrawn: hand.selfDrawn };
  for (const pattern of PATTERNS) {
    if (pattern.requiresSelfDrawn && !hand.selfDrawn) continue;
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier === null) continue;
    if (!accept(pattern, tier)) continue;
    if (pattern.match(context)) return true;
  }
  return false;
}

export function bestMatch(hand: Hand): PatternMatch | null {
  return matchHand(hand)[0] ?? null;
}
