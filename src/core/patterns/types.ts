/**
 * Pattern-table schema. The table is data: the matcher is generic and never
 * knows any hand by name.
 */

import type { Hand } from "../hand.ts";
import type { HandShape } from "../shape.ts";
import type { Group } from "./predicates.ts";

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
 * Printed fishing values, one per winning tier. The Illustrated pages print
 * fractions of the limit: half 200, limit 400, double 500. Middle 600 belongs
 * only to Companion hands; a Companion double hand keeps its printed 800.
 * `calculate` has no fixed fishing figure because the hand score is computed.
 */
export const TIER_FISHING: Readonly<Record<Tier, number | null>> = Object.freeze({
  half: 200,
  limit: 400,
  middle: 600,
  double: 500,
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

/**
 * Where a hand is printed, book by book. The two books number their pages
 * independently, so a page number means nothing without its book: every
 * reference shown to a player names the book.
 */
export interface PageRefs {
  /** Pages of *The Game of Mah Jong Illustrated* (primary). */
  readonly illustrated: readonly number[];
  /** Pages of *The Mah Jong Player's Companion* (supplement). */
  readonly companion: readonly number[];
}

export interface HandPattern {
  /** Stable kebab-case identifier. */
  readonly id: string;
  readonly name: string;
  /**
   * Every printed page where the hand appears, by book: the Illustrated hand
   * page (`rules/RULES.md` Part II) and the Companion's short list, hand page
   * and synopsis. One canonical pattern keeps all references.
   */
  readonly pages: PageRefs;
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
   * cropped page. The reading and its reasoning is in rules/archive/ASSUMPTIONS.md
 * (historical); the normative rule is rules/RULES.md.
   */
  readonly provisional?: boolean;
  /** Transcription uncertainty or assumption; also recorded in rules/archive/NOTES.md. */
  readonly notes?: string;
  readonly match: PatternPredicate;
  /**
   * The hand as a partition into groups, for the patterns that are one: the
   * alternative readings for a hand whose own wind is the argument (`"wE"`
   * ...). `match` is derived from it, so a pattern states its structure once;
   * `closestHands` reads it to say how near a player's tiles are, exactly.
   * Absent for hands no group list describes.
   */
  readonly groups?: (ownWind: string) => readonly (readonly Group[])[];
}
