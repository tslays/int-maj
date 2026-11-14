/**
 * Win-time scoring. Matching and scoring are separate layers: the matcher
 * decides which printed hand the tiles form; this module turns that hand into
 * points.
 *
 * The Illustrated book prints two scoring routes (pp. 24-26):
 *   - an ordinary / Purity / All Honour hand scores its ground score, doubled
 *     once per honour feature and capped by the limit;
 *   - a special hand scores its printed tier.
 * The player is paid the best of the hands the tiles make, and a calculated
 * hand is scored from its best reading (see `scoreHand`, `calculateHand`).
 *
 * Fishing is not part of the hand score: it is an announced wait settled
 * independently when another player wins (see fishing.ts).
 */

import { createHand, handTiles, isConcealed, type Hand, type Meld } from "./hand.ts";
import { normalizeHand, usedSuits } from "./shape.ts";
import { decomposeStandard, type StandardSet } from "./decompose.ts";
import { bestMatch, matchHand, type PatternMatch } from "./match.ts";
import type { Tier } from "./patterns/types.ts";
import {
  WINDS,
  isHonourKey,
  isTerminalKey,
  suitTileKey,
  tileKey,
  type Suit,
} from "./tiles.ts";

/** The book's worked examples and the Western game use a 1000-point limit. */
export const DEFAULT_LIMIT = 1000;

export interface ScoreOptions {
  /** Hand limit; the ground score is capped at this figure. Default 1000. */
  readonly limit?: number;
  /** Ground bonus (d): this player claimed the first discard East made. */
  readonly firstDiscardByEast?: boolean;
  /** Double (h)(i): the winning tile came from the loose-tile end. */
  readonly wonOnLooseTile?: boolean;
  /** Double (h)(ii): the winning tile was the last tile of the wall. */
  readonly wonOnLastWallTile?: boolean;
  /** Double (h)(iii): the winning tile robbed a kong. */
  readonly robbedKong?: boolean;
  /** Fishing for an ordinary hand scores ground without the 20 for Mah Jong. */
  readonly withoutMahJongBonus?: boolean;
  /** A Goulash hand never scores the no-chows double. */
  readonly goulash?: boolean;
  /** Hands the table plays without (a house rule); they never match. */
  readonly excluded?: readonly string[];
}

export interface ScoreResult {
  readonly matches: readonly PatternMatch[];
  readonly winning: PatternMatch | null;
  readonly tier: Tier | null;
  /** Final points: fixed tier, or ground × 2^doubles capped by the limit. */
  readonly points: number | null;
  /** Ground score for a calculated hand; null for a fixed-tier hand. */
  readonly ground: number | null;
  /** Number of doubles for a calculated hand; null for a fixed-tier hand. */
  readonly doubles: number | null;
  /** ground × 2^doubles before the limit cap; null for a fixed-tier hand. */
  readonly raw: number | null;
  readonly limit: number;
}

/** Printed winning value for a tier at a given limit. */
export function tierPoints(tier: Tier, limit = DEFAULT_LIMIT): number | null {
  switch (tier) {
    case "half":
      return limit / 2;
    case "limit":
      return limit;
    case "middle":
      return limit * 1.5;
    case "double":
      return limit * 2;
    case "calculate":
      return null;
  }
}

/** A hand the tiles form, with what it would score. */
interface Candidate {
  readonly winning: PatternMatch;
  readonly points: number | null;
  readonly ground: number | null;
  readonly doubles: number | null;
  readonly raw: number | null;
}

/**
 * Scores the hand the player would claim: of every printed hand the tiles
 * form, the one that pays most. Tiers are never added (I p. 32), and a
 * calculated hand competes by its calculated points, so a half-limit hand
 * does not hide an ordinary hand that scores more, and a hand that can be
 * read as pungs is not paid as a non-scoring hand of chows.
 */
export function scoreHand(hand: Hand, options: ScoreOptions = {}): ScoreResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const matches = matchHand(hand, undefined, options.excluded);
  const miss = { points: null, ground: null, doubles: null, raw: null } as const;
  const none = (winning: PatternMatch | null): ScoreResult => ({
    matches,
    winning,
    tier: winning?.tier ?? null,
    ...miss,
    limit,
  });
  if (matches.length === 0) return none(null);

  const candidates: Candidate[] = [];
  for (const match of matches) {
    if (match.tier !== "calculate") {
      candidates.push({ winning: match, ...miss, points: tierPoints(match.tier, limit) });
    }
  }

  const calculated = matches.filter((match) => match.tier === "calculate");
  const buried = calculated.find((match) => match.pattern.id === "buried-treasure");
  const nonScoring = isNonScoringFourChows(hand);
  if (buried !== undefined && nonScoring) {
    candidates.push({ winning: buried, ...miss, points: 10 });
  } else {
    const route = calculated.find((match) => match.pattern.id !== "buried-treasure");
    if (route !== undefined && route.pattern.id === "chinese-ordinary" && nonScoring) {
      candidates.push({ winning: route, ...miss, points: 10 });
    } else if (route !== undefined) {
      const score = calculateHand(hand, options);
      if (score !== null) {
        candidates.push({
          winning: route,
          points: Math.min(score.raw, limit),
          ground: score.ground,
          doubles: score.doubles,
          raw: score.raw,
        });
      }
    }
  }

  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (best === null || (candidate.points ?? -1) > (best.points ?? -1)) best = candidate;
  }
  if (best === null) return none(matches[0]!);
  return {
    matches,
    winning: best.winning,
    tier: best.winning.tier,
    points: best.points,
    ground: best.ground,
    doubles: best.doubles,
    raw: best.raw,
    limit,
  };
}

/** One group of the reading being scored. Chows carry their place so the
 * "only possible places" bonus (I p. 24 (e), illustrated p. 25) can be read. */
interface ScoredSet {
  readonly kind: "chow" | "pung" | "kong";
  readonly tile?: string;
  readonly suit?: Suit;
  readonly start?: number;
  readonly exposed: boolean;
}

interface CalculatedScore {
  readonly ground: number;
  readonly doubles: number;
  readonly raw: number;
}

function meldSet(meld: Meld): ScoredSet {
  const first = meld.tiles[0]!;
  if (meld.kind === "chow" && first.kind === "suited") {
    const start = Math.min(
      ...meld.tiles.map((tile) => (tile.kind === "suited" ? tile.rank : 99)),
    );
    return { kind: "chow", suit: first.suit, start, exposed: meld.exposed };
  }
  return { kind: meld.kind, tile: tileKey(first), exposed: meld.exposed };
}

function decompositionSet(set: StandardSet): ScoredSet {
  if (set.kind === "chow") {
    return { kind: "chow", suit: set.suit, start: set.start, exposed: false };
  }
  return { kind: set.kind, tile: set.tile, exposed: false };
}

function isHighGroup(key: string): boolean {
  return isHonourKey(key) || isTerminalKey(key);
}

/** Ground points for one pung/kong (chows score nothing). */
function setGround(set: ScoredSet): number {
  if (set.kind === "chow") return 0;
  const high = isHighGroup(set.tile!);
  const exposed = set.kind === "kong" ? (high ? 16 : 8) : high ? 4 : 2;
  return set.exposed ? exposed : exposed * 2;
}

function pairGround(pair: string, hand: Hand): number {
  let points = 0;
  if (pair.startsWith("d")) points += 2; // (a)
  if (pair === `w${hand.seatWind}`) points += 2; // (b)
  if (pair === `w${hand.prevailingWind}`) points += 2; // (c)
  return points;
}

function chowHolds(set: ScoredSet, key: string): boolean {
  if (set.kind !== "chow") return false;
  for (let rank = set.start!; rank < set.start! + 3; rank++) {
    if (suitTileKey(set.suit!, rank) === key) return true;
  }
  return false;
}

/**
 * The chow was completed in one of the places the book's diagram shows
 * (illustrated p. 25): the far end of a 1-2 or 8-9 (the 3 of 1-2-3, the 7 of
 * 7-8-9), or the middle of a chow. A two-sided wait is not one of them.
 */
function chowInOnlyPossiblePlace(set: ScoredSet, key: string): boolean {
  const rank = Number(key.slice(1));
  const start = set.start!;
  if (rank === start + 1) return true;
  if (start === 1 && rank === 3) return true;
  return start === 7 && rank === 7;
}

/** What the winning tile did in one reading of the hand. */
type Role =
  | { readonly kind: "none" }
  | { readonly kind: "pair" }
  | { readonly kind: "set"; readonly index: number };

interface Reading {
  readonly sets: readonly ScoredSet[];
  readonly pair: string;
}

/**
 * Every way the concealed tiles can be read as the remaining sets and a pair.
 * Declared melds are fixed sets. A Western ordinary hand holds at most one
 * chow (I p. 14), so a reading with more is not a hand the player may claim;
 * if no reading satisfies that, all readings are kept rather than leave a
 * matched win unscored.
 */
function readingsOf(hand: Hand): Reading[] {
  const setCount = 4 - hand.melds.length;
  if (setCount < 0) return [];
  const shape = normalizeHand(createHand({ concealed: hand.concealed }));
  const decompositions = decomposeStandard(shape, { setCount, allowKongs: false });
  const fixed = hand.melds.map(meldSet);
  const all = decompositions.map((decomposition) => ({
    sets: [...fixed, ...decomposition.sets.map(decompositionSet)],
    pair: decomposition.pair,
  }));
  if (hand.variant === "chinese") return all;
  const legal = all.filter(
    (reading) => reading.sets.filter((set) => set.kind === "chow").length <= 1,
  );
  return legal.length > 0 ? legal : all;
}

/**
 * The places the winning tile may have gone in a reading. Taking the best of
 * them is the player's choice of how to read a tile that fits two ways.
 */
function rolesOf(hand: Hand, reading: Reading): Role[] {
  if (hand.winningTile === null) return [{ kind: "none" }];
  const key = tileKey(hand.winningTile);
  const roles: Role[] = [];
  if (reading.pair === key) roles.push({ kind: "pair" });
  reading.sets.forEach((set, index) => {
    if (set.kind === "chow") {
      // A chow claimed to win is declared exposed; a concealed one is read
      // from the hand. A drawn tile can only sit in a concealed chow.
      if (chowHolds(set, key) && (!set.exposed || !hand.selfDrawn)) {
        roles.push({ kind: "set", index });
      }
    } else if (!set.exposed && set.kind === "pung" && set.tile === key) {
      roles.push({ kind: "set", index });
    }
  });
  return roles.length > 0 ? roles : [{ kind: "none" }];
}

function calculateReading(
  hand: Hand,
  options: ScoreOptions,
  reading: Reading,
  role: Role,
): CalculatedScore {
  // A pung completed by a tile taken from a discard is an exposed pung: the
  // book calls a tile exposed when it "has been taken from discards" (p. 24).
  const completedByDiscard = hand.winningTile !== null && !hand.selfDrawn;
  const sets = reading.sets.map((set, index): ScoredSet => {
    if (
      completedByDiscard &&
      role.kind === "set" &&
      role.index === index &&
      set.kind === "pung"
    ) {
      return { ...set, exposed: true };
    }
    return set;
  });
  const pair = reading.pair;

  let ground = hand.flowers.length * 4 + hand.seasons.length * 4;
  for (const set of sets) ground += setGround(set);
  ground += pairGround(pair, hand);
  if (options.firstDiscardByEast) ground += 2; // (d)
  if (role.kind === "set") {
    const completed = sets[role.index]!;
    if (completed.kind === "chow" && chowInOnlyPossiblePlace(completed, tileKey(hand.winningTile!))) {
      ground += 2; // (e)
    }
  }
  if (hand.selfDrawn) ground += 2; // (f)
  if (role.kind === "pair") ground += 2; // (g)
  if (!options.withoutMahJongBonus) ground += 20; // (h)

  const shape = normalizeHand(hand);
  const suits = usedSuits(shape);
  const hasHonour = shape.honoursTotal > 0;
  const noChows = !options.goulash && sets.every((set) => set.kind !== "chow");
  const ownWindPung = sets.some(
    (set) => set.kind !== "chow" && set.tile === `w${hand.seatWind}`,
  );
  const prevailingPung = sets.some(
    (set) => set.kind !== "chow" && set.tile === `w${hand.prevailingWind}`,
  );
  const dragonPungs = sets.filter(
    (set) => set.kind !== "chow" && set.tile?.startsWith("d"),
  ).length;

  const ownIndex = WINDS.indexOf(hand.seatWind) + 1;
  const ownSeason = hand.seasons.some(
    (tile) => tile.kind === "season" && tile.index === ownIndex,
  );
  const ownFlower = hand.flowers.some(
    (tile) => tile.kind === "flower" && tile.index === ownIndex,
  );
  const bouquetSeasons = hand.seasons.length === 4;
  const bouquetFlowers = hand.flowers.length === 4;
  const allOneSuitNoHonours = suits.length === 1 && !hasHonour;
  const allHonours = handTiles(hand).every((tile) => isHighGroup(tileKey(tile)));

  // Each feature counts once. Lines (j) and (k) restate "own Season, own
  // Flower, no Chows" and "a, b, c, d, e" for their hands; they do not pay a
  // second double for them, and (k) already "includes one double for all
  // Pungs", so the no-chows double is not added on top (rules/archive/
  // ASSUMPTIONS.md, "Doubles are counted once").
  let doubles = 0;
  doubles += dragonPungs; // (a) each pung/kong of Dragons
  if (ownWindPung) doubles += 1; // (b)
  if (prevailingPung) doubles += 1; // (c)
  if (ownSeason && !bouquetSeasons) doubles += 1; // (d)
  if (ownFlower && !bouquetFlowers) doubles += 1; // (e)
  if (suits.length === 1 && hasHonour) doubles += 1; // (f), and (k)'s cleared suit
  if (noChows && !allHonours) doubles += 1; // (g)
  if (options.wonOnLooseTile || options.wonOnLastWallTile || options.robbedKong) {
    doubles += 1; // (h)(i)-(iii): one double, not one per manner
  }
  if (isConcealed(hand) && hand.selfDrawn) doubles += 2; // concealed Mah Jong
  if (allOneSuitNoHonours) doubles += 3; // (j)
  if (allHonours) doubles += 3; // (k), includes one double for all pungs
  if (bouquetSeasons) doubles += 3; // includes own Season
  if (bouquetFlowers) doubles += 3; // includes own Flower

  return { ground, doubles, raw: ground * 2 ** doubles };
}

/** The best reading of the hand, the way a player would choose to count it. */
function calculateHand(hand: Hand, options: ScoreOptions): CalculatedScore | null {
  const limit = options.limit ?? DEFAULT_LIMIT;
  let best: CalculatedScore | null = null;
  for (const reading of readingsOf(hand)) {
    for (const role of rolesOf(hand, reading)) {
      const score = calculateReading(hand, options, reading, role);
      if (
        best === null ||
        Math.min(score.raw, limit) > Math.min(best.raw, limit) ||
        (Math.min(score.raw, limit) === Math.min(best.raw, limit) && score.raw > best.raw)
      ) {
        best = score;
      }
    }
  }
  return best;
}

/**
 * A hand that scores nothing but its bonuses: every reading of it is four
 * chows and a pair of no value. A hand that can also be read with a pung (or
 * a pair of Dragons or Winds) scores by that reading, as the player would
 * claim it, so it is not the 10-point hand (I p. 29, p. 38).
 */
function isNonScoringFourChows(hand: Hand): boolean {
  const decompositions = decomposeStandard(normalizeHand(hand));
  return (
    decompositions.length > 0 &&
    decompositions.every(
      (decomposition) =>
        decomposition.sets.every((set) => set.kind === "chow") &&
        !decomposition.pair.startsWith("d") &&
        !decomposition.pair.startsWith("w"),
    )
  );
}

export { bestMatch };
