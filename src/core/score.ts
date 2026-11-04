/**
 * Win-time scoring. Matching and scoring are separate layers: the matcher
 * decides which printed hand the tiles form; this module turns that hand into
 * points.
 *
 * The Illustrated book prints two scoring routes (pp. 24-26):
 *   - an ordinary / Purity / All Honour hand scores its ground score, doubled
 *     once per honour feature and capped by the limit;
 *   - a special hand scores its printed tier.
 *
 * Fishing is not part of the hand score: it is a declared wait settled
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
  tileKey,
  type Suit,
} from "./tiles.ts";

/** The book's worked examples and the Western game use a 1000-point limit. */
export const DEFAULT_LIMIT = 1000;

export interface ScoreOptions {
  /** Hand limit; the ground score is capped at this figure. Default 1000. */
  readonly limit?: number;
  /** Ground bonus (d): the winning tile was East's first discard. */
  readonly firstDiscardByEast?: boolean;
  /** Ground bonus (e): the winning chow had only one possible completion. */
  readonly onlyPossibleChow?: boolean;
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

export function scoreHand(hand: Hand, options: ScoreOptions = {}): ScoreResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const matches = matchHand(hand);
  const winning = matches[0] ?? null;

  if (winning === null) {
    return {
      matches,
      winning,
      tier: null,
      points: null,
      ground: null,
      doubles: null,
      raw: null,
      limit,
    };
  }

  if (winning.tier !== "calculate") {
    return {
      matches,
      winning,
      tier: winning.tier,
      points: tierPoints(winning.tier, limit),
      ground: null,
      doubles: null,
      raw: null,
      limit,
    };
  }

  const calculated = calculateHand(hand, options);
  if (calculated === null) {
    return {
      matches,
      winning,
      tier: winning.tier,
      points: null,
      ground: null,
      doubles: null,
      raw: null,
      limit,
    };
  }

  return {
    matches,
    winning,
    tier: winning.tier,
    points: Math.min(calculated.raw, limit),
    ground: calculated.ground,
    doubles: calculated.doubles,
    raw: calculated.raw,
    limit,
  };
}

interface ScoredSet {
  readonly kind: "chow" | "pung" | "kong";
  readonly tile?: string;
  readonly exposed: boolean;
}

interface CalculatedScore {
  readonly ground: number;
  readonly doubles: number;
  readonly raw: number;
}

function meldSet(meld: Meld): ScoredSet {
  if (meld.kind === "chow") return { kind: "chow", exposed: meld.exposed };
  return { kind: meld.kind, tile: tileKey(meld.tiles[0]!), exposed: meld.exposed };
}

function decompositionSet(set: StandardSet): ScoredSet {
  if (set.kind === "chow") return { kind: "chow", exposed: false };
  return { kind: set.kind, tile: set.tile, exposed: false };
}

/** The concealed tiles' remaining sets and pair. Declared kongs are excluded. */
function concealedDecomposition(hand: Hand): { sets: ScoredSet[]; pair: string } | null {
  const setCount = 4 - hand.melds.length;
  if (setCount < 0) return null;
  const shape = normalizeHand(createHand({ concealed: hand.concealed }));
  const decompositions = decomposeStandard(shape, {
    setCount,
    allowKongs: false,
  });
  const first = decompositions[0];
  if (first === undefined) return null;
  return { sets: first.sets.map(decompositionSet), pair: first.pair };
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
  if (pair.startsWith("d")) points += 2;
  if (pair === `w${hand.seatWind}`) points += 2;
  if (pair === `w${hand.prevailingWind}`) points += 2;
  return points;
}

function calculateHand(hand: Hand, options: ScoreOptions): CalculatedScore | null {
  const concealed = concealedDecomposition(hand);
  if (concealed === null) return null;
  const sets = [...hand.melds.map(meldSet), ...concealed.sets];
  const pair = concealed.pair;

  let ground = hand.flowers.length * 4 + hand.seasons.length * 4;
  for (const set of sets) ground += setGround(set);
  ground += pairGround(pair, hand);
  if (options.firstDiscardByEast) ground += 2;
  if (options.onlyPossibleChow) ground += 2;
  if (hand.selfDrawn) ground += 2;
  if (hand.winningTile !== null && tileKey(hand.winningTile) === pair) ground += 2;
  if (!options.withoutMahJongBonus) ground += 20;

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

  let doubles = 0;
  doubles += dragonPungs; // (a) each pung/kong of Dragons
  if (ownWindPung) doubles += 1; // (b)
  if (prevailingPung) doubles += 1; // (c)
  if (ownSeason && !bouquetSeasons) doubles += 1; // (d)
  if (ownFlower && !bouquetFlowers) doubles += 1; // (e)

  // (f)-(h) are for the winning/fishing hand only; this module scores a win.
  if (suits.length === 1 && hasHonour) doubles += 1; // (f)
  if (noChows) doubles += 1; // (g)
  if (options.wonOnLooseTile || options.wonOnLastWallTile || options.robbedKong) {
    doubles += 1; // (h)(i)-(iii): one double, not one per manner
  }

  if (isConcealed(hand) && hand.selfDrawn) doubles += 2; // concealed Mah Jong

  const allOneSuitNoHonours = suits.length === 1 && !hasHonour;
  if (allOneSuitNoHonours) {
    doubles += 3; // (j)
    if (ownSeason && !bouquetSeasons) doubles += 1;
    if (ownFlower && !bouquetFlowers) doubles += 1;
    if (noChows) doubles += 1;
  }

  const allHonours = handTiles(hand).every((tile) =>
    isHighGroup(tileKey(tile)),
  );
  if (allHonours) {
    doubles += 3; // (k), includes one double for all Pungs
    doubles += dragonPungs;
    if (ownWindPung) doubles += 1;
    if (prevailingPung) doubles += 1;
    if (ownSeason && !bouquetSeasons) doubles += 1;
    if (ownFlower && !bouquetFlowers) doubles += 1;
    if (terminalsOneSuit(hand)) doubles += 1;
  }

  if (bouquetSeasons) doubles += 3;
  if (bouquetFlowers) doubles += 3;

  return { ground, doubles, raw: ground * 2 ** doubles };
}

function terminalsOneSuit(hand: Hand): boolean {
  const suits = new Set<Suit>();
  for (const tile of handTiles(hand)) {
    if (tile.kind === "suited" && (tile.rank === 1 || tile.rank === 9)) {
      suits.add(tile.suit);
    }
  }
  return suits.size === 1;
}

export { bestMatch };
