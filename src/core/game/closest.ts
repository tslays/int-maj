/**
 * The "closest hands" helper: which catalogue hands one seat is nearest to.
 *
 * It reads the same plan the bots use (bot/plan.ts): every special hand from
 * the generated target table, and every ordinary or pair hand assembled
 * around the seat's own tiles and priced by the real scorer. For each
 * catalogue pattern it keeps the closest version - fewest tiles still
 * missing, then the best chance of collecting them times what the hand pays -
 * and drops versions the seat can no longer finish because the copies it
 * needs are already in sight (discarded or exposed).
 *
 * Only the seat's own `GameView` goes in, so nothing here can reveal another
 * player's concealed tiles. Pure and deterministic.
 */

import { PATTERNS } from "../patterns/table.ts";
import { TIER_POINTS, type HandPattern, type Tier } from "../patterns/types.ts";
import { situationFor } from "./bot.ts";
import { completion, KEYS, oddsFor, planGoals } from "./bot/plan.ts";
import type { GameView } from "./view.ts";

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

/** Where a hand is printed: the printed pages of each of the two books. */
export interface BookPages {
  readonly companion: readonly number[];
  readonly illustrated: readonly number[];
}

export function pagesOf(pattern: HandPattern | undefined): BookPages {
  return {
    companion: [...(pattern?.companionPages ?? [])],
    illustrated: [...(pattern?.illustratedPages ?? [])],
  };
}

export interface ClosestHand {
  readonly pattern: string;
  readonly name: string;
  /** The tier the hand would score at with the seat's current melds. */
  readonly tier: Tier;
  /** The printed value, or null for a hand whose score is calculated. */
  readonly points: number | null;
  /** The printed pages of each book the hand is on. */
  readonly pages: BookPages;
  /**
   * True when the hand exists only concealed: any exposed meld (a called
   * pung, kong or chow) rules it out. Most special hands are like this.
   */
  readonly concealedOnly: boolean;
  /** Tiles still to collect; 0 means the hand in front of you is complete. */
  readonly away: number;
  /** The missing tiles, one key per copy, in canonical order. */
  readonly need: readonly string[];
  /** Rough chance of completing it from here (0..1). */
  readonly chance: number;
}

/** Hands shown by default: enough to compare, few enough for a phone. */
export const CLOSEST_SHOWN = 3;

export function closestHands(view: GameView, limit = CLOSEST_SHOWN): ClosestHand[] {
  // The player's own planner, without any bot's taste for special hands.
  const situation = { ...situationFor(view, view.seat), ambition: 1 };
  const odds = oddsFor(situation);
  const concealed = situation.melds.every((meld) => !meld.exposed);

  const best = new Map<string, { hand: ClosestHand; rank: number }>();
  for (const goal of planGoals(situation)) {
    const pattern = PATTERN_BY_ID.get(goal.pattern);
    if (pattern === undefined) continue;
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier === null) continue;

    const need: string[] = [];
    let live = true;
    for (const key of goal.keys) {
      const want = goal.need[key]! - situation.hand[key]!;
      if (want <= 0) continue;
      if (situation.unseen[key]! < want) live = false;
      for (let copy = 0; copy < want; copy++) need.push(KEYS[key]!);
    }
    if (!live) continue;

    const chance = completion(goal, situation.hand, odds);
    const rank = chance * goal.value;
    const previous = best.get(goal.pattern);
    if (
      previous !== undefined &&
      (previous.hand.away < need.length || (previous.hand.away === need.length && previous.rank >= rank))
    ) {
      continue;
    }
    best.set(goal.pattern, {
      rank,
      hand: {
        pattern: pattern.id,
        name: pattern.name,
        tier,
        points: TIER_POINTS[tier],
        pages: pagesOf(pattern),
        concealedOnly: pattern.exposedTier === null,
        away: need.length,
        need,
        chance: Math.round(chance * 1000) / 1000,
      },
    });
  }

  return [...best.values()]
    .sort((a, b) => a.hand.away - b.hand.away || b.rank - a.rank || a.hand.pattern.localeCompare(b.hand.pattern))
    .slice(0, limit)
    .map((entry) => entry.hand);
}

/** Everything the table can tell a player about one catalogue hand. */
export interface HandDetail {
  readonly pattern: string;
  readonly name: string;
  readonly pages: BookPages;
  /** What the hand is made of, in plain words. */
  readonly description: string;
  /** Concealed-only: no exposed meld is allowed at any point. */
  readonly concealedOnly: boolean;
  /** Every tile must come from the wall, the winning tile included. */
  readonly requiresSelfDrawn: boolean;
  readonly concealedTier: Tier;
  readonly concealedPoints: number | null;
  /** Null when the hand does not exist with exposed melds. */
  readonly exposedTier: Tier | null;
  readonly exposedPoints: number | null;
}

/** One hand by id, for the "explore this hand" view; null for an unknown id. */
export function handDetail(id: string): HandDetail | null {
  const pattern = PATTERN_BY_ID.get(id);
  if (pattern === undefined) return null;
  return {
    pattern: pattern.id,
    name: pattern.name,
    pages: pagesOf(pattern),
    description: pattern.description,
    concealedOnly: pattern.exposedTier === null,
    requiresSelfDrawn: pattern.requiresSelfDrawn,
    concealedTier: pattern.tier,
    concealedPoints: TIER_POINTS[pattern.tier],
    exposedTier: pattern.exposedTier,
    exposedPoints: pattern.exposedTier === null ? null : TIER_POINTS[pattern.exposedTier],
  };
}
