/**
 * Pattern-table schema. The table is data: the matcher is generic and never
 * knows any hand by name.
 */

import type { Hand } from "../hand.ts";
import type { HandShape } from "../shape.ts";

export type Tier = "half" | "limit" | "middle" | "double" | "calculate";

/**
 * Printed winning values. `calculate` is the book's instruction to compute the
 * score from the earlier rules, so it has no fixed point value.
 */
export const TIER_POINTS: Readonly<Record<Tier, number | null>> = Object.freeze({
  half: 500,
  limit: 1000,
  middle: 1500,
  double: 2000,
  calculate: null,
});

/**
 * Printed fishing values, one per winning tier. The synopsis's right column
 * prints them beside each hand: half 200, limit 400, middle 600, double 800.
 * `calculate` has no fishing figure because the hand score is computed.
 */
export const TIER_FISHING: Readonly<Record<Tier, number | null>> = Object.freeze({
  half: 200,
  limit: 400,
  middle: 600,
  double: 800,
  calculate: null,
});

export type PatternCategory =
  | "plain"
  | "run"
  | "chow"
  | "pairs"
  | "honour"
  | "dragon"
  | "suit";

export interface MatchContext {
  readonly shape: HandShape;
  readonly hand: Hand;
  readonly isConcealed: boolean;
  readonly isSelfDrawn: boolean;
}

export type PatternPredicate = (context: MatchContext) => boolean;

export interface HandPattern {
  /** Stable kebab-case identifier. */
  readonly id: string;
  readonly name: string;
  /**
   * Every printed book page where the hand appears (short list, hand page and
   * full synopsis). One canonical pattern keeps all references.
   */
  readonly pages: readonly number[];
  readonly category: PatternCategory;
  /**
   * Value when the hand is concealed. The book's precedence rule is
   * "highest tier wins, never additive".
   */
  readonly tier: Tier;
  /**
   * Value when any meld is exposed. `null` means the pattern is
   * concealed-only: it does not exist in an exposed form.
   */
  readonly exposedTier: Tier | null;
  /**
   * True for hands whose definition says every tile must come from the wall
   * (the winning tile included), e.g. Chow Chow.
   */
  readonly requiresSelfDrawn: boolean;
  /** Canonical composition, in the book's shorthand expanded. */
  readonly description: string;
  /** Where the composition was transcribed from. */
  readonly source: string;
  /** For variant families such as Dragon's Tail (1 & 2). */
  readonly variantOf?: string;
  /**
   * True when the composition or its tier is a conservative reading of a
   * cropped page. The reading and its reasoning are in rules/ASSUMPTIONS.md.
   */
  readonly provisional?: boolean;
  /** Transcription uncertainty or assumption; also recorded in rules/NOTES.md. */
  readonly notes?: string;
  readonly match: PatternPredicate;
}
