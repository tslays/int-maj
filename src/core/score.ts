/**
 * Win-time scoring. The winning pattern is the highest tier among all matches;
 * tiers are never summed.
 *
 * Fishing is not part of the hand score: it is a declared wait settled
 * independently when another player wins (see fishing.ts). Keeping the two
 * apart stops "won on a discard" being mistaken for "fishing".
 */

import { bestMatch, matchHand, type PatternMatch } from "./match.ts";
import type { Hand } from "./hand.ts";
import type { Tier } from "./patterns/types.ts";

export interface ScoreResult {
  readonly matches: readonly PatternMatch[];
  readonly winning: PatternMatch | null;
  readonly tier: Tier | null;
  /** Points from the winning pattern only; tiers are not added together. */
  readonly points: number | null;
}

export function scoreHand(hand: Hand): ScoreResult {
  const matches = matchHand(hand);
  const winning = matches[0] ?? null;

  return {
    matches,
    winning,
    tier: winning?.tier ?? null,
    points: winning?.points ?? null,
  };
}

export { bestMatch };
