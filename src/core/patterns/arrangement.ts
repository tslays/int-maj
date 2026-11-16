/**
 * How a winning hand is laid out in groups when it is shown (the result card).
 *
 * Display only: the matcher and `closestHands` never read this. A hand lists
 * here when its picture in the book groups its tiles differently from the
 * plain four sets and a pair (a run of nine kept whole, the winds as one
 * group, seven pairs rather than a ten-tile lump, the extra tile of a
 * "paired" card on its own). Every other hand is shown by its `groups`, or as
 * four sets and a pair.
 *
 * Each layout is the book's own grouping, in the order the book prints it, and
 * is declared with the same `Group` pieces the patterns use. A hand's layout
 * is tried against the winning tiles; the first reading that partitions them
 * is the one shown. `test/core/arrangement.test.ts` checks every layout
 * against every sample picture of the books.
 */

import { SUITS, suitTileKey } from "../tiles.ts";
import {
  exactGroup,
  pairGroup,
  pungGroup,
  runGroup,
  singleGroup,
  type Group,
} from "./predicates.ts";

type Layout = (ownWind: string) => readonly (readonly Group[])[];

const isWind = (key: string): boolean => key.startsWith("w");
const isDragon = (key: string): boolean => key.startsWith("d");
const isHonour = (key: string): boolean => isWind(key) || isDragon(key);
const isTerminal = (key: string): boolean => /^[bco][19]$/.test(key);
const everyTile = (): boolean => true;
const repeat = (group: Group, times: number): Group[] => Array.from({ length: times }, () => group);

/** One tile of each kind in the pool that passes `predicate`, as one group (the winds a hand holds). */
function presentGroup(predicate: (key: string) => boolean): Group {
  return {
    options: (pool) => {
      const keys = Object.keys(pool).filter((key) => pool[key]! > 0 && predicate(key));
      return keys.length === 0 ? [] : [keys];
    },
  };
}

/** A group with exactly these alternatives. */
function oneOf(options: readonly (readonly string[])[]): Group {
  return { options: () => options };
}

const WINDS = exactGroup(["wE", "wS", "wW", "wN"]);
const DRAGONS = exactGroup(["dR", "dG", "dW"]);
const RUN_OF_NINE = runGroup("any", 1, 9);
const CHOW = runGroup("any", "any", 3);
const PAIR = pairGroup(everyTile);
const TERMINAL_PUNG = pungGroup(isTerminal);
const DRAGON_PUNG = pungGroup(isDragon);
const SPARE = singleGroup(everyTile);

/** The same tile set in each suit: for Civil War, 1-1-6-8 in one suit and 1-5-6-8 in another. */
const inASuit = (ranks: readonly number[]): Group =>
  oneOf(SUITS.map((suit) => ranks.map((rank) => suitTileKey(suit, rank))));

/** The two extra tiles of Grand Sequence, shown together as the book prints them. */
const TWO_SPARES: Group = {
  options: (pool) => {
    const keys = Object.keys(pool).filter((key) => pool[key]! > 0);
    const options: string[][] = [];
    keys.forEach((first, at) => {
      for (const second of keys.slice(at)) {
        if (first !== second || pool[first]! >= 2) options.push([first, second]);
      }
    });
    return options;
  },
};

const SEVEN_PAIRS: Layout = () => [repeat(PAIR, 7)];

export const ARRANGEMENTS: Readonly<Record<string, Layout>> = Object.freeze({
  // A run of nine kept whole, with the honours and the extra tile as the book groups them.
  "wriggly-snake": () => [[RUN_OF_NINE, WINDS, SPARE]],
  "run-pung-pair": () => [[RUN_OF_NINE, pungGroup(everyTile), PAIR]],
  "guardian-winds": () => [[RUN_OF_NINE, pungGroup(isWind), pairGroup(isWind)]],
  "guardian-dragons": () => [[RUN_OF_NINE, DRAGON_PUNG, pairGroup(isDragon)]],
  "dragons-tail": () => [[RUN_OF_NINE, pungGroup(isHonour), pairGroup(isHonour)]],
  "wriggly-dragon": () => [[RUN_OF_NINE, DRAGONS, pairGroup(isDragon)]],
  "dragons-run": () => [[RUN_OF_NINE, DRAGONS, pairGroup(isWind)]],
  "five-odd-honours": () => [[RUN_OF_NINE, presentGroup(isDragon), presentGroup(isWind)]],
  "gretas-garden": () => [[runGroup("any", 1, 7), WINDS, DRAGONS]],
  "gretas-dragon": () => [[runGroup("any", 1, 7), WINDS, DRAGON_PUNG]],
  "grand-sequence": () => [[pungGroup(isHonour), RUN_OF_NINE, TWO_SPARES]],
  "gerties-garter": () => [repeat(runGroup("any", 1, 7), 2)],
  "hachi-ban": () => [[runGroup("any", "any", 8), ...repeat(pairGroup(isHonour), 3)]],

  // The gates: the two terminal pungs, the run 2-8 and the tile that pairs with it.
  "gates-of-heaven": () => [[...repeat(TERMINAL_PUNG, 2), runGroup("any", 2, 7), SPARE]],
  "confused-gates": () => [[...repeat(TERMINAL_PUNG, 2), runGroup("any", 2, 7), SPARE]],
  "dragons-gates": () => [[TERMINAL_PUNG, DRAGON_PUNG, runGroup("any", 2, 7), SPARE]],
  "dragons-teeth": () => [[...repeat(DRAGON_PUNG, 2), runGroup("any", "any", 7), SPARE]],
  "red-lantern": (own) => [[pungGroup((key) => key === "dR"), pungGroup((key) => key === own), runGroup("any", 1, 7), SPARE]],
  "unique-wonder": () => [
    [
      oneOf([["b1", "c1", "o1"]]),
      oneOf([["b9", "c9", "o9"]]),
      WINDS,
      DRAGONS,
      SPARE,
    ],
  ],

  // Chows the book prints beside one another.
  "moon-at-bottom-of-well": () => [
    [runGroup("any", 1, 3), runGroup("any", 4, 3), runGroup("any", 7, 3), CHOW, PAIR],
  ],
  "yin-yang": () => [[PAIR, CHOW, PAIR, PAIR, CHOW, PAIR]],

  // Pairs each on their own.
  "dragons-breath": () => [[...repeat(PAIR, 5), DRAGONS, SPARE]],
  "dragonette": () => [[...repeat(PAIR, 3), WINDS, DRAGONS, SPARE]],
  "windfall": () => [[...repeat(PAIR, 5), WINDS]],
  "all-pair-jade": SEVEN_PAIRS,
  "sparrows-sanctuary": SEVEN_PAIRS,
  "golden-gates": () => [[TERMINAL_PUNG, DRAGON_PUNG, ...repeat(PAIR, 4)]],
  "civil-war": () => [
    [pungGroup((key) => key === "wN"), pungGroup((key) => key === "wS"), inASuit([1, 1, 6, 8]), inASuit([1, 5, 6, 8])],
  ],
});
