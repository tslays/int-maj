/**
 * Generic composition predicates for the pattern table.
 *
 * The matcher in match.ts never knows a hand by name. Every predicate here is
 * a reusable test over the normalised shape: standard 4-set decompositions,
 * arbitrary group partitions, or simple count checks. Hand-specific logic
 * lives in the table as data, not in the matcher.
 */

import {
  decomposeStandard,
  type StandardDecomposition,
  type StandardSet,
} from "../decompose.ts";
import {
  SUITS,
  isHonourKey,
  parseTile,
  suitTileKey,
  type Dragon,
  type Suit,
} from "../tiles.ts";
import {
  rankCount,
  tileCount,
  usedSuits,
  type HandShape,
} from "../shape.ts";

export type SetFilter = (set: StandardSet) => boolean;
export type KeyPredicate = (key: string) => boolean;

export function isPungSet(set: StandardSet): boolean {
  return set.kind === "pung" || set.kind === "kong";
}

export function setSuitOf(set: StandardSet): Suit | null {
  if (set.kind === "chow") return set.suit;
  const tile = parseTile(set.tile);
  return tile.kind === "suited" ? tile.suit : null;
}

export function setRankOf(set: StandardSet): number | null {
  if (set.kind === "chow") return set.start;
  const tile = parseTile(set.tile);
  return tile.kind === "suited" ? tile.rank : null;
}

export const anyPung: SetFilter = isPungSet;

export const anyChow: SetFilter = (set) => set.kind === "chow";

export function pungOf(key: string): SetFilter {
  return (set) => isPungSet(set) && set.tile === key;
}

export function pungSuit(
  suit: Suit,
  ranks?: readonly number[],
): SetFilter {
  return (set) => {
    if (!isPungSet(set)) return false;
    const rank = setRankOf(set);
    return setSuitOf(set) === suit && rank !== null && (!ranks || ranks.includes(rank));
  };
}

export function chowSuit(
  suit: Suit,
  starts?: readonly number[],
): SetFilter {
  return (set) =>
    set.kind === "chow" &&
    set.suit === suit &&
    (!starts || starts.includes(set.start));
}

function assignSets(
  sets: readonly StandardSet[],
  filters: readonly SetFilter[],
  used: Set<number> = new Set(),
): boolean {
  if (used.size === sets.length) return true;
  const set = sets[used.size]!;
  for (let index = 0; index < filters.length; index++) {
    if (used.has(index) || !filters[index]!(set)) continue;
    used.add(index);
    if (assignSets(sets, filters, used)) return true;
    used.delete(index);
  }
  return false;
}

/**
 * True when the hand decomposes into four standard sets plus a pair and the
 * pair/sets can be assigned to the supplied filters. A kong is one set.
 */
export function matchesStandard(
  shape: HandShape,
  pair: KeyPredicate,
  sets: readonly SetFilter[],
): boolean {
  if (sets.length !== 4) return false;
  return decomposeStandard(shape).some(
    (decomposition: StandardDecomposition) =>
      pair(decomposition.pair) && assignSets(decomposition.sets, sets),
  );
}

/** Counts per canonical key for the shape; missing keys are absent. */
export type Pool = Readonly<Record<string, number>>;

function poolFromShape(shape: HandShape): Pool {
  const pool: Record<string, number> = {};
  for (const [key, count] of Object.entries(shape.counts)) {
    if (count > 0) pool[key] = count;
  }
  return pool;
}

export interface Group {
  readonly options: (pool: Pool) => readonly (readonly string[])[];
}

function hasTiles(pool: Pool, keys: readonly string[]): boolean {
  const need: Record<string, number> = {};
  for (const key of keys) need[key] = (need[key] ?? 0) + 1;
  return Object.entries(need).every(([key, count]) => (pool[key] ?? 0) >= count);
}

function removeTiles(pool: Pool, keys: readonly string[]): Pool {
  const next: Record<string, number> = { ...pool };
  for (const key of keys) next[key] = (next[key] ?? 0) - 1;
  return next;
}

/**
 * True when the hand's tiles can be partitioned exactly into the supplied
 * groups. Groups are tried in order with backtracking, so order does not
 * change the result (but putting the most selective groups first is faster).
 */
export function matchesGroups(shape: HandShape, groups: readonly Group[]): boolean {
  return consume(poolFromShape(shape), groups, 0);
}

function consume(pool: Pool, groups: readonly Group[], index: number): boolean {
  if (index === groups.length) {
    return Object.values(pool).every((count) => count === 0);
  }
  const group = groups[index]!;
  for (const option of group.options(pool)) {
    if (!hasTiles(pool, option)) continue;
    if (consume(removeTiles(pool, option), groups, index + 1)) return true;
  }
  return false;
}

function suitsOf(value: Suit | "any"): readonly Suit[] {
  return value === "any" ? SUITS : [value];
}

function startsOf(start: number | "any", length: number): number[] {
  if (start !== "any") return [start];
  return Array.from({ length: 10 - length }, (_, index) => index + 1);
}

export function runGroup(
  suit: Suit | "any",
  start: number | "any",
  length: number,
): Group {
  return {
    options: () => {
      const options: string[][] = [];
      for (const currentSuit of suitsOf(suit)) {
        for (const currentStart of startsOf(start, length)) {
          options.push(
            Array.from(
              { length },
              (_, offset) => suitTileKey(currentSuit, currentStart + offset),
            ),
          );
        }
      }
      return options;
    },
  };
}

/**
 * A run of `length` tiles plus one extra tile that pairs with a run tile:
 * so the run suit carries `length + 1` tiles.
 */
export function runWithPairGroup(
  suit: Suit | "any",
  start: number,
  length: number,
): Group {
  return {
    options: (pool) => {
      const options: string[][] = [];
      for (const currentSuit of suitsOf(suit)) {
        const run = Array.from(
          { length },
          (_, offset) => suitTileKey(currentSuit, start + offset),
        );
        for (const key of run) {
          if ((pool[key] ?? 0) >= 2) options.push([...run, key]);
        }
      }
      return options;
    },
  };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index++) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([items[index]!, ...tail]);
  }
  return result;
}

/** Three consecutive numbers, one tile in each of the three suits. */
export function mixedChowGroup(): Group {
  const options: string[][] = [];
  for (let start = 1; start <= 7; start++) {
    for (const order of permutations(SUITS)) {
      options.push(
        order.map((currentSuit, index) => suitTileKey(currentSuit, start + index)),
      );
    }
  }
  return { options: () => options };
}

/** A pair made of the same number in two different suits ("mixed pair"). */
export function mixedPairGroup(): Group {
  const options: string[][] = [];
  for (let rank = 1; rank <= 9; rank++) {
    for (let first = 0; first < SUITS.length; first++) {
      for (let second = first + 1; second < SUITS.length; second++) {
        options.push([
          suitTileKey(SUITS[first]!, rank),
          suitTileKey(SUITS[second]!, rank),
        ]);
      }
    }
  }
  return { options: () => options };
}

export function pungGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) => {
      const options: string[][] = [];
      for (const [key, count] of Object.entries(pool)) {
        if (!predicate(key)) continue;
        if (count >= 3) options.push([key, key, key]);
        if (count >= 4) options.push([key, key, key, key]);
      }
      return options;
    },
  };
}

/** Pung-only group: a kong does not satisfy a printed "Pung". */
export function pungOnlyGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) =>
      Object.entries(pool)
        .filter(([key, count]) => count >= 3 && predicate(key))
        .map(([key]) => [key, key, key]),
  };
}

/** Pung-only set filter, for standard decompositions. */
export function pungOnlySuit(
  suit: Suit,
  ranks?: readonly number[],
): SetFilter {
  return (set) => {
    if (set.kind !== "pung") return false;
    const rank = setRankOf(set);
    return setSuitOf(set) === suit && rank !== null && (!ranks || ranks.includes(rank));
  };
}

export function pairGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) =>
      Object.entries(pool)
        .filter(([key, count]) => count >= 2 && predicate(key))
        .map(([key]) => [key, key]),
  };
}

export function singleGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) =>
      Object.entries(pool)
        .filter(([key, count]) => count >= 1 && predicate(key))
        .map(([key]) => [key]),
  };
}

export function exactGroup(keys: readonly string[]): Group {
  return { options: () => [keys] };
}

/**
 * Exactly `units` pairs from one suit. A four-of-a-kind counts as two pairs.
 * All ranks are available; callers narrow with a dedicated predicate when the
 * book names particular tiles.
 */
export function pairsInSuitGroup(suit: Suit, units: number): Group {
  return {
    options: (pool) => {
      const options: string[][] = [];
      const walk = (rank: number, left: number, chosen: string[]): void => {
        if (left === 0) {
          options.push(chosen.slice());
          return;
        }
        if (rank > 9) return;
        const key = suitTileKey(suit, rank);
        const count = pool[key] ?? 0;
        walk(rank + 1, left, chosen);
        if (left >= 1 && count >= 2) {
          chosen.push(key, key);
          walk(rank + 1, left - 1, chosen);
          chosen.pop();
          chosen.pop();
        }
        if (left >= 2 && count >= 4) {
          chosen.push(key, key, key, key);
          walk(rank + 1, left - 2, chosen);
          chosen.length -= 4;
        }
      };
      walk(1, units, []);
      return options;
    },
  };
}

/** `count` distinct pairs (two tiles each) among keys matching pred. */
export function distinctPairsGroup(count: number, predicate: KeyPredicate): Group {
  return {
    options: (pool) => {
      const keys = Object.entries(pool)
        .filter(([key, value]) => value >= 2 && predicate(key))
        .map(([key]) => key);
      const options: string[][] = [];
      const choose = (index: number, chosen: string[]): void => {
        if (chosen.length === count * 2) {
          options.push(chosen.slice());
          return;
        }
        for (let cursor = index; cursor < keys.length; cursor++) {
          const key = keys[cursor]!;
          chosen.push(key, key);
          choose(cursor + 1, chosen);
          chosen.pop();
          chosen.pop();
        }
      };
      choose(0, []);
      return options;
    },
  };
}

/** All keys in the shape, with at least one copy. */
export function shapeKeys(shape: HandShape): string[] {
  return Object.keys(shape.counts).filter((key) => (shape.counts[key] ?? 0) > 0);
}

function suitTotal(shape: HandShape, suit: Suit): number {
  return shape.suits[suit].reduce((sum, count) => sum + count, 0);
}

/** True when a suit contains exactly the listed ranks, once each. */
export function suitIsExactRun(
  shape: HandShape,
  suit: Suit,
  start: number,
  length: number,
): boolean {
  if (suitTotal(shape, suit) !== length) return false;
  for (let rank = 1; rank <= 9; rank++) {
    const expected = rank >= start && rank < start + length ? 1 : 0;
    if (rankCount(shape, suit, rank) !== expected) return false;
  }
  return true;
}

/** True when a suit contains exactly the listed ranks, once each. */
export function suitIsExactRanks(
  shape: HandShape,
  suit: Suit,
  ranks: readonly number[],
): boolean {
  if (suitTotal(shape, suit) !== ranks.length) return false;
  for (let rank = 1; rank <= 9; rank++) {
    const present = rankCount(shape, suit, rank) > 0;
    if (present !== ranks.includes(rank)) return false;
  }
  return true;
}

export const RED_BAMBOO_RANKS: readonly number[] = [1, 5, 7, 9];
export const GREEN_BAMBOO_RANKS: readonly number[] = [2, 3, 4, 6, 8];
export const BLUE_CIRCLE_RANKS: readonly number[] = [2, 3, 4, 5, 8, 9];
export const EVEN_RANKS: readonly number[] = [2, 4, 6, 8];
export const ODD_RANKS: readonly number[] = [1, 3, 5, 7, 9];

export const DRAGON_KEYS: Readonly<Record<Dragon, string>> = Object.freeze({
  red: "dR",
  green: "dG",
  white: "dW",
});

/** The dragon that corresponds to a suit: Bamboo-Green, Characters-Red, Circles-White. */
export const CORRESPONDING_DRAGON: Readonly<Record<Suit, Dragon>> = Object.freeze({
  bamboo: "green",
  characters: "red",
  circles: "white",
});

export function ownWindKey(shape: HandShape): string {
  return `w${shape.hand.seatWind}`;
}

export function isOneSuit(shape: HandShape): boolean {
  return usedSuits(shape).length === 1;
}


