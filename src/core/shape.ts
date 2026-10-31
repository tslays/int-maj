/**
 * Normalised hand shape: suit-grouped rank counts plus honour counts.
 *
 * This is the only input pattern predicates see, so patterns describe tile
 * composition rather than meld bookkeeping.
 */

import { handTiles, type Hand, type Meld } from "./hand.ts";
import {
  DRAGONS,
  SUITS,
  WINDS,
  isSuited,
  tileKey,
  type Dragon,
  type Suit,
  type Wind,
} from "./tiles.ts";

export interface HandShape {
  /** Count per canonical tile key over concealed + meld tiles. */
  readonly counts: Readonly<Record<string, number>>;
  /** Rank counts, index 1..9; index 0 is always 0. */
  readonly suits: Readonly<Record<Suit, readonly number[]>>;
  readonly winds: Readonly<Record<Wind, number>>;
  readonly dragons: Readonly<Record<Dragon, number>>;
  readonly total: number;
  readonly suitedTotal: number;
  readonly honoursTotal: number;
  readonly kongCount: number;
  readonly melds: readonly Meld[];
  readonly hand: Hand;
}

export function normalizeHand(hand: Hand): HandShape {
  const counts: Record<string, number> = {};
  const suits: Record<Suit, number[]> = {
    bamboo: Array<number>(10).fill(0),
    characters: Array<number>(10).fill(0),
    circles: Array<number>(10).fill(0),
  };
  const winds: Record<Wind, number> = { E: 0, S: 0, W: 0, N: 0 };
  const dragons: Record<Dragon, number> = { red: 0, green: 0, white: 0 };
  let suitedTotal = 0;
  let honoursTotal = 0;

  for (const tile of handTiles(hand)) {
    const key = tileKey(tile);
    counts[key] = (counts[key] ?? 0) + 1;
    if (isSuited(tile)) {
      suits[tile.suit][tile.rank]! += 1;
      suitedTotal += 1;
    } else if (tile.kind === "wind") {
      winds[tile.wind] += 1;
      honoursTotal += 1;
    } else {
      dragons[tile.dragon] += 1;
      honoursTotal += 1;
    }
  }

  return {
    counts,
    suits,
    winds,
    dragons,
    total: suitedTotal + honoursTotal,
    suitedTotal,
    honoursTotal,
    kongCount: hand.melds.filter((m) => m.kind === "kong").length,
    melds: hand.melds,
    hand,
  };
}

export function tileCount(shape: HandShape, key: string): number {
  return shape.counts[key] ?? 0;
}

export function rankCount(shape: HandShape, suit: Suit, rank: number): number {
  return shape.suits[suit][rank] ?? 0;
}

export function windCount(shape: HandShape, wind: Wind): number {
  return shape.winds[wind];
}

export function dragonCount(shape: HandShape, dragon: Dragon): number {
  return shape.dragons[dragon];
}

export function usedSuits(shape: HandShape): Suit[] {
  return SUITS.filter((suit) => shape.suits[suit].some((count) => count > 0));
}

export function hasRun(shape: HandShape, suit: Suit, start: number, length: number): boolean {
  for (let rank = start; rank < start + length; rank++) {
    if (rankCount(shape, suit, rank) < 1) return false;
  }
  return true;
}

export function hasPung(shape: HandShape, key: string): boolean {
  return tileCount(shape, key) >= 3;
}

/** Sum of floor(count/2): kongs count as two pairs in a seven-pairs hand. */
export function pairUnits(shape: HandShape): number {
  let units = 0;
  for (const count of Object.values(shape.counts)) units += Math.floor(count / 2);
  return units;
}

export function isSevenPairs(shape: HandShape): boolean {
  if (shape.total !== 14) return false;
  if (pairUnits(shape) !== 7) return false;
  return Object.values(shape.counts).every((count) => count % 2 === 0);
}

export function allHonours(shape: HandShape): boolean {
  return shape.suitedTotal === 0;
}

export function eastSouthWestNorth(shape: HandShape): boolean {
  return WINDS.every((w) => windCount(shape, w) >= 1);
}

export function allThreeDragons(shape: HandShape): boolean {
  return DRAGONS.every((d) => dragonCount(shape, d) >= 1);
}
