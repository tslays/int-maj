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
  PLAY_TILE_KEYS,
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
import type { HandPattern } from "./types.ts";

export type SetFilter = (set: StandardSet) => boolean;
export type KeyPredicate = (key: string) => boolean;

export function isPungSet(set: StandardSet): set is Exclude<StandardSet, { kind: "chow" }> {
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

/**
 * A pung/kong of a suit: Bamboo, Characters or Circles. Winds and Dragons are
 * honours, not a suit, so "in any suit" never reaches them.
 */
export const suitedPung: SetFilter = (set) =>
  isPungSet(set) && setSuitOf(set) !== null;

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

/**
 * One working pool per shape. A pattern may call `matchesGroups` hundreds of
 * times on the same hand, and `consume` always hands the pool back exactly
 * as it found it, so the pool is built once and reused.
 */
const POOLS = new WeakMap<HandShape, Record<string, number>>();

function poolFromShape(shape: HandShape): Record<string, number> {
  const cached = POOLS.get(shape);
  if (cached !== undefined) return cached;
  const pool: Record<string, number> = {};
  for (const [key, count] of Object.entries(shape.counts)) {
    if (count > 0) pool[key] = count;
  }
  POOLS.set(shape, pool);
  return pool;
}

export interface Group {
  readonly options: (pool: Pool) => readonly (readonly string[])[];
}

/**
 * True when the hand's tiles can be partitioned exactly into the supplied
 * groups. Groups are tried in order with backtracking, so order does not
 * change the result (but putting the most selective groups first is faster).
 */
export function matchesGroups(shape: HandShape, groups: readonly Group[]): boolean {
  return consume(poolFromShape(shape), groups, 0);
}

/**
 * Backtracking over one working pool: an option's tiles are taken out before
 * the next group is tried and put back afterwards. This is the matcher's
 * innermost loop (every wait check runs it), so it neither copies the pool
 * nor allocates per option. Group options are computed from the pool before
 * it changes and never keep a reference to it.
 */
function consume(pool: Record<string, number>, groups: readonly Group[], index: number): boolean {
  if (index === groups.length) {
    for (const key in pool) if (pool[key] !== 0) return false;
    return true;
  }
  const group = groups[index]!;
  for (const option of group.options(pool)) {
    if (!take(pool, option)) continue;
    const matched = consume(pool, groups, index + 1);
    putBack(pool, option);
    if (matched) return true;
  }
  return false;
}

/** Takes the option's tiles out of the pool, or leaves it unchanged and says no. */
function take(pool: Record<string, number>, keys: readonly string[]): boolean {
  let taken = 0;
  for (; taken < keys.length; taken++) {
    const key = keys[taken]!;
    const count = pool[key];
    if (count === undefined || count <= 0) break;
    pool[key] = count - 1;
  }
  if (taken === keys.length) return true;
  for (let index = 0; index < taken; index++) pool[keys[index]!]! += 1;
  return false;
}

function putBack(pool: Record<string, number>, keys: readonly string[]): void {
  for (const key of keys) pool[key]! += 1;
}

function suitsOf(value: Suit | "any"): readonly Suit[] {
  return value === "any" ? SUITS : [value];
}

function startsOf(start: number | "any", length: number): number[] {
  if (start !== "any") return [start];
  return Array.from({ length: 10 - length }, (_, index) => index + 1);
}

/** Run groups are constant per suit, start and length, so each is built once. */
const RUN_GROUPS = new Map<number, Group>();

export function runGroup(
  suit: Suit | "any",
  start: number | "any",
  length: number,
): Group {
  const id =
    (suit === "any" ? SUITS.length : SUITS.indexOf(suit)) * 100 +
    (start === "any" ? 0 : start) * 10 +
    length;
  const cached = RUN_GROUPS.get(id);
  if (cached !== undefined) return cached;
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
  const group: Group = { options: () => options };
  RUN_GROUPS.set(id, group);
  return group;
}

/**
 * A run of `length` tiles plus `extras` more tiles, each pairing with a
 * different tile of the run: the Companion's "Any tile 1-9 paired" printed
 * once per extra tile. The run suit carries `length + extras` tiles.
 */
export function runWithPairsGroup(
  suit: Suit | "any",
  start: number,
  length: number,
  extras: number,
): Group {
  return {
    options: (pool) => {
      const options: string[][] = [];
      for (const currentSuit of suitsOf(suit)) {
        const run = Array.from(
          { length },
          (_, offset) => suitTileKey(currentSuit, start + offset),
        );
        const pairable = run.filter((key) => (pool[key] ?? 0) >= 2);
        const choose = (from: number, chosen: string[]): void => {
          if (chosen.length === extras) {
            options.push([...run, ...chosen]);
            return;
          }
          for (let at = from; at < pairable.length; at++) choose(at + 1, [...chosen, pairable[at]!]);
        };
        choose(0, []);
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
  return runWithPairsGroup(suit, start, length, 1);
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
const MIXED_CHOW: Group = (() => {
  const options: string[][] = [];
  for (let start = 1; start <= 7; start++) {
    for (const order of permutations(SUITS)) {
      options.push(
        order.map((currentSuit, index) => suitTileKey(currentSuit, start + index)),
      );
    }
  }
  return { options: () => options };
})();

export function mixedChowGroup(): Group {
  return MIXED_CHOW;
}

/** A pair made of the same number in two different suits ("mixed pair"). */
const MIXED_PAIR: Group = (() => {
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
})();

export function mixedPairGroup(): Group {
  return MIXED_PAIR;
}

/** Pool keys, in pool order, with at least `least` tiles that pass `predicate`. */
function keysWith(pool: Pool, least: number, predicate: KeyPredicate): string[] {
  const keys: string[] = [];
  for (const key in pool) if (pool[key]! >= least && predicate(key)) keys.push(key);
  return keys;
}

export function pungGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) => {
      const options: string[][] = [];
      for (const key in pool) {
        const count = pool[key]!;
        if (count < 3 || !predicate(key)) continue;
        options.push([key, key, key]);
        if (count >= 4) options.push([key, key, key, key]);
      }
      return options;
    },
  };
}

/** Pung-only group: a kong does not satisfy a printed "Pung". */
export function pungOnlyGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) => keysWith(pool, 3, predicate).map((key) => [key, key, key]),
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
    options: (pool) => keysWith(pool, 2, predicate).map((key) => [key, key]),
  };
}

export function singleGroup(predicate: KeyPredicate): Group {
  return {
    options: (pool) => keysWith(pool, 1, predicate).map((key) => [key]),
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
      const keys = keysWith(pool, 2, predicate);
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

// ---------------------------------------------------------------------------
// Hands declared as groups. The same declaration answers two questions: is a
// finished hand this pattern (`match`), and how near are some tiles to it
// (`groups`, read by reach.ts). A pattern states its groups once.

/** One reading of a hand as groups, or several alternative readings. */
export type GroupLayout = readonly Group[] | readonly (readonly Group[])[];

/** A layout built for the hand's own wind (`"wE"` ...); most layouts ignore it. */
export type GroupLayoutFor = (ownWind: string) => GroupLayout;

function alternativesOf(layout: GroupLayout): readonly (readonly Group[])[] {
  return layout.length > 0 && Array.isArray(layout[0])
    ? (layout as readonly (readonly Group[])[])
    : [layout as readonly Group[]];
}

/** A layout built once per own wind: groups are stateless, so they are shared. */
function memoised<T>(build: (ownWind: string) => T): (ownWind: string) => T {
  const built = new Map<string, T>();
  return (ownWind) => {
    let value = built.get(ownWind);
    if (value === undefined) {
      value = build(ownWind);
      built.set(ownWind, value);
    }
    return value;
  };
}

/** The readings of a layout, built once per own wind (what `HandPattern.groups` holds). */
export function groupReadings(layout: GroupLayoutFor): NonNullable<HandPattern["groups"]> {
  return memoised((ownWind) => alternativesOf(layout(ownWind)));
}

/** A pattern that is a partition of the hand into these groups (or any one of several readings). */
export function groupPattern(layout: GroupLayoutFor): Pick<HandPattern, "groups" | "match"> {
  const groups = groupReadings(layout);
  return {
    groups,
    match: ({ shape }) => groups(ownWindKey(shape)).some((reading) => matchesGroups(shape, reading)),
  };
}

const ALL_SETS: readonly StandardSet[] = [
  ...PLAY_TILE_KEYS.map((key): StandardSet => ({ kind: "pung", tile: key })),
  ...SUITS.flatMap((suit) =>
    Array.from({ length: 7 }, (_, index): StandardSet => ({ kind: "chow", suit, start: index + 1 })),
  ),
];

function setKeys(set: StandardSet): string[] {
  if (set.kind === "chow") return [0, 1, 2].map((offset) => suitTileKey(set.suit, set.start + offset));
  return [set.tile, set.tile, set.tile];
}

/** The pair and four set filters of a standard hand, as groups: the sets each filter accepts. */
export function standardGroups(pair: KeyPredicate, sets: readonly SetFilter[]): Group[] {
  return [
    pairGroup(pair),
    ...sets.map((filter): Group => {
      const options = ALL_SETS.filter((set) => filter(set)).map(setKeys);
      return { options: () => options };
    }),
  ];
}

/** What `matchesStandard` takes: the pair's test and the four sets' filters. */
export interface StandardLayout {
  readonly pair: KeyPredicate;
  readonly sets: readonly SetFilter[];
}

/** A pattern that is four sets and a pair matching these filters (or any one of several such readings). */
export function standardPattern(
  layout: (ownWind: string) => StandardLayout | readonly StandardLayout[],
): Pick<HandPattern, "groups" | "match"> {
  const readings = memoised((ownWind): readonly StandardLayout[] => {
    const built = layout(ownWind);
    return Array.isArray(built) ? (built as readonly StandardLayout[]) : [built as StandardLayout];
  });
  return {
    groups: memoised((ownWind) => readings(ownWind).map(({ pair, sets }) => standardGroups(pair, sets))),
    match: ({ shape }) =>
      readings(ownWindKey(shape)).some(({ pair, sets }) => matchesStandard(shape, pair, sets)),
  };
}

export function isOneSuit(shape: HandShape): boolean {
  return usedSuits(shape).length === 1;
}


