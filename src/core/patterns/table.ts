/**
 * The single pattern table.
 *
 * Rule authority is documented in rules/SOURCE.md. This is an existing
 * derived implementation, not a source of truth: its entries came from earlier
 * transcriptions and remain unverified until checked against the primary scan.
 * Keep citations and repeated-printing metadata, but let the primary scan
 * override any conflicting entry or previous decision.
 *
 * This table is data. `match.ts` only iterates it; each entry's predicate is
 * built from the reusable helpers in predicates.ts.
 */

import { decomposeStandard } from "../decompose.ts";
import {
  dragonCount,
  eastSouthWestNorth,
  hasRun,
  isSevenPairs,
  rankCount,
  tileCount,
  usedSuits,
  windCount,
  type HandShape,
} from "../shape.ts";
import {
  SUITS,
  isHonourKey,
  isSuitedKey,
  isTerminalKey,
  parseTile,
  suitTileKey,
  tileKey,
  type Suit,
} from "../tiles.ts";
import type { HandPattern } from "./types.ts";
import {
  BLUE_CIRCLE_RANKS,
  CORRESPONDING_DRAGON,
  EVEN_RANKS,
  GREEN_BAMBOO_RANKS,
  ODD_RANKS,
  RED_BAMBOO_RANKS,
  anyChow,
  anyPung,
  chowSuit,
  distinctPairsGroup,
  exactGroup,
  isOneSuit,
  isPungSet,
  matchesGroups,
  matchesStandard,
  mixedChowGroup,
  mixedPairGroup,
  ownWindKey,
  pairGroup,
  pairsInSuitGroup,
  pungGroup,
  pungOf,
  pungOnlyGroup,
  pungOnlySuit,
  pungSuit,
  runGroup,
  runWithPairGroup,
  setSuitOf,
  shapeKeys,
  singleGroup,
  suitIsExactRanks,
  suitIsExactRun,
} from "./predicates.ts";

const isWind = (key: string) => key.startsWith("w");
const isDragon = (key: string) => key.startsWith("d");
const isBamboo = (key: string) => key.startsWith("b");
const isCharacters = (key: string) => key.startsWith("c");
const isCircles = (key: string) => key.startsWith("o");
const isRedBamboo = (key: string) =>
  isBamboo(key) && RED_BAMBOO_RANKS.includes(Number(key[1]));
const isEvenCircle = (key: string) =>
  isCircles(key) && EVEN_RANKS.includes(Number(key[1]));
const isOddCharacter = (key: string) =>
  isCharacters(key) && ODD_RANKS.includes(Number(key[1]));
const isEvenCharacter = (key: string) =>
  isCharacters(key) && EVEN_RANKS.includes(Number(key[1]));
const WIND_KEYS = ["wE", "wS", "wW", "wN"] as const;

function isMixedPairKeys(first: string, second: string): boolean {
  const a = parseTile(first);
  const b = parseTile(second);
  return (
    a.kind === "suited" &&
    b.kind === "suited" &&
    a.rank === b.rank &&
    a.suit !== b.suit
  );
}

/**
 * Triple Knitting: four "triple sets" (one tile of the same number in each
 * suit) plus a knitting pair (the same number in two suits). The four ranks
 * are distinct; the pair may be a fifth rank or a second copy at a chosen one.
 */
function tripleKnitting(shape: HandShape): boolean {
  if (shape.total !== 14) return false;
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let a = 0; a < ranks.length; a++) {
    for (let b = a + 1; b < ranks.length; b++) {
      for (let c = b + 1; c < ranks.length; c++) {
        for (let d = c + 1; d < ranks.length; d++) {
          const chosen = [ranks[a]!, ranks[b]!, ranks[c]!, ranks[d]!];
          if (
            !chosen.every((rank) =>
              SUITS.every((suit) => rankCount(shape, suit, rank) >= 1),
            )
          ) {
            continue;
          }
          const remaining: Record<string, number> = { ...shape.counts };
          for (const rank of chosen) {
            for (const suit of SUITS) {
              const key = suitTileKey(suit, rank);
              remaining[key] = (remaining[key] ?? 0) - 1;
            }
          }
          const leftovers: string[] = [];
          for (const [key, count] of Object.entries(remaining)) {
            for (let index = 0; index < count; index++) leftovers.push(key);
          }
          if (
            leftovers.length === 2 &&
            isMixedPairKeys(leftovers[0]!, leftovers[1]!)
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Big Robert: one four-tile run in each suit plus an honour pair. The book
 * scores the same-numbers version at limit and every other version at half
 * limit; the two predicates are mutually exclusive.
 */
function bigRobert(shape: HandShape, sameNumbers: boolean): boolean {
  for (let bambooStart = 1; bambooStart <= 6; bambooStart++) {
    for (let characterStart = 1; characterStart <= 6; characterStart++) {
      for (let circleStart = 1; circleStart <= 6; circleStart++) {
        const same =
          bambooStart === characterStart && characterStart === circleStart;
        if (same !== sameNumbers) continue;
        if (
          matchesGroups(shape, [
            runGroup("bamboo", bambooStart, 4),
            runGroup("characters", characterStart, 4),
            runGroup("circles", circleStart, 4),
            pairGroup((key) => isWind(key) || isDragon(key)),
          ])
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
const DRAGON_KEYS = ["dR", "dG", "dW"] as const;
const pungWind = (set: Parameters<typeof isPungSet>[0]) => isPungSet(set) && isWind(set.tile);
const pungDragon = (set: Parameters<typeof isPungSet>[0]) => isPungSet(set) && isDragon(set.tile);
const honourPung = (set: Parameters<typeof isPungSet>[0]) => isPungSet(set) && isHonourKey(set.tile);

export const PATTERNS: readonly HandPattern[] = Object.freeze([
  {
    id: "ordinary-mahjong",
    name: "Ordinary Mah Jong",
    companionPages: [42],
    illustratedPages: [34],
    category: "plain",
    tier: "calculate",
    exposedTier: "calculate",
    requiresSelfDrawn: false,
    description:
      "Four pungs/kongs, or three pungs/kongs and one chow, plus a pair. " +
      "All suited tiles are in one suit; winds and dragons may be used.",
    source: "Short list p. 6; synopsis p. 56; illustrated hand page p. 42.",
    notes:
      "The p. 42 hand page prints CALCULATE SCORE. An all-honour hand is " +
      "excluded here because it scores as All Honour Hand.",
    match: ({ shape }) => {
      if (usedSuits(shape).length !== 1) return false;
      if (shape.suitedTotal === 0) return false;
      return decomposeStandard(shape).some((decomposition) => {
        const chows = decomposition.sets.filter((set) => set.kind === "chow").length;
        if (chows > 1) return false;
        return decomposition.sets.some(
          (set) => set.kind === "chow" || isSuitedKey(set.tile),
        );
      });
    },
  },
  {
    id: "wriggly-snake",
    name: "Wriggly Snake",
    companionPages: [10, 27],
    illustratedPages: [38],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, one of each wind, and one extra tile that pairs " +
      "with any tile already in the hand.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 10.",
    notes:
      "The p. 10 hand page prints LIMIT (Concealed); the pattern is " +
      "concealed-only.",
    match: ({ shape }) => {
      if (shape.total !== 14) return false;
      const suits = usedSuits(shape);
      if (suits.length !== 1) return false;
      const suit = suits[0]!;
      if (!hasRun(shape, suit, 1, 9)) return false;
      if (!eastSouthWestNorth(shape)) return false;
      let extra = 0;
      for (const [key, count] of Object.entries(shape.counts)) {
        if (count === 0) continue;
        const suited = isSuitedKey(key);
        if (suited && key[0] !== suitTileKey(suit, 1)[0]) return false;
        if (!suited && !isWind(key)) return false;
        extra += count - 1;
      }
      return extra === 1;
    },
  },
  {
    id: "all-pair",
    name: "All Pair",
    companionPages: [22],
    illustratedPages: [34],
    category: "pairs",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs. All suited pairs are in one suit; winds and/or dragons " +
      "may also be paired. A kong counts as two pairs.",
    source: "Short list p. 6; hand illustration p. 22.",
    notes:
      "At least one suited pair is required; seven pairs of honours alone is " +
      "All Pair Honours.",
    match: ({ shape }) => {
      if (!isSevenPairs(shape)) return false;
      return usedSuits(shape).length === 1 && shape.suitedTotal >= 2;
    },
  },
  {
    id: "three-great-scholars",
    name: "Three Great Scholars",
    companionPages: [33],
    illustratedPages: [49],
    category: "honour",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of all three dragons, plus one pung/kong or chow and a " +
      "pair; the pair is in the fourth set's suit or is a wind pair.",
    source: "Synopsis p. 58; short-list tier convention.",
    notes:
      "MIDDLE LIMIT, exposed allowed (C p. 33). The Illustrated book prints " +
      "LIMIT; the Companion's value governs (rules/RULES.md Part III).",
    match: ({ shape }) => {
      if (
        dragonCount(shape, "green") < 3 ||
        dragonCount(shape, "red") < 3 ||
        dragonCount(shape, "white") < 3
      ) {
        return false;
      }
      if (usedSuits(shape).length !== 1) return false;
      return decomposeStandard(shape).some((decomposition) => {
        const numeric = decomposition.sets.filter(
          (set) => set.kind === "chow" || isSuitedKey(set.tile),
        );
        const honours = decomposition.sets.filter(
          (set) => set.kind !== "chow" && isHonourKey(set.tile),
        );
        return (
          numeric.length === 1 &&
          honours.length === 3 &&
          (isSuitedKey(decomposition.pair) || isWind(decomposition.pair))
        );
      });
    },
  },
  {
    id: "chow-chow",
    name: "Chow Chow",
    companionPages: [15],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: true,
    description:
      "Four chows and a pair, all in one suit. Every tile, including the " +
      "winning tile, must come from the wall.",
    source: "Synopsis p. 56.",
    notes:
      "The p. 15 hand page prints HALF LIMIT (Concealed). exposedTier null " +
      "and the no-meld check encode the concealed-only requirement.",
    match: ({ shape, hand }) =>
      hand.melds.length === 0 &&
      shape.total === 14 &&
      shape.honoursTotal === 0 &&
      usedSuits(shape).length === 1 &&
      decomposeStandard(shape).some(
        (decomposition) =>
          decomposition.sets.every((set) => set.kind === "chow") &&
          isSuitedKey(decomposition.pair),
      ),
  },
  {
    id: "run-pung-pair",
    name: "Run, Pung & Pair",
    companionPages: [9, 47],
    illustratedPages: [36],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description: "Run 1-9, one pung/kong and a pair, all in one suit.",
    source: "Short list p. 6; synopsis p. 56.",
    notes:
      "The p. 47 hand page prints LIMIT (Concealed); page 9 is outside the " +
      "scanned spreads. Composition is from the short list and synopsis.",
    match: ({ shape }) =>
      isOneSuit(shape) &&
      SUITS.some(
        (suit) =>
          matchesStandard(
            shape,
            (key) => key[0] === suitTileKey(suit, 1)[0],
            [
              chowSuit(suit, [1]),
              chowSuit(suit, [4]),
              chowSuit(suit, [7]),
              pungSuit(suit),
            ],
          ),
      ),
  },
  {
    id: "gates-of-heaven",
    name: "Gates of Heaven",
    companionPages: [9, 49],
    illustratedPages: [36],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 2-8 in one suit with one run tile paired, plus pungs/kongs of 1s " +
      "and 9s in the same suit.",
    source: "Short list p. 6; synopsis p. 56.",
    notes:
      "Hand page 9 is not in the scanned excerpt. Composition is taken from " +
      "the short list and synopsis; limit/half is assumed.",
    match: ({ shape }) =>
      SUITS.some((suit) => {
        const prefix = suitTileKey(suit, 1)[0]!;
        return matchesGroups(shape, [
          runWithPairGroup(suit, 2, 7),
          pungGroup((key) => key === `${prefix}1`),
          pungGroup((key) => key === `${prefix}9`),
        ]);
      }),
  },
  {
    id: "confused-gates",
    name: "Confused Gates",
    companionPages: [9, 51],
    illustratedPages: [57],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 2-8 in one suit with one run tile paired, plus pungs/kongs of 1s " +
      "and 9s, with the run and the two terminal pungs in three different suits.",
    source: "Short list p. 6; synopsis p. 56; three-suit synopsis p. 60.",
    notes:
      "Hand page 9 is not in the scanned excerpt. Composition is taken from " +
      "the short list and synopsis; limit/half is assumed.",
    match: ({ shape }) => {
      for (const runSuit of SUITS) {
        for (const oneSuit of SUITS) {
          for (const nineSuit of SUITS) {
            if (new Set([runSuit, oneSuit, nineSuit]).size !== 3) continue;
            if (
              matchesGroups(shape, [
                runWithPairGroup(runSuit, 2, 7),
                pungGroup((key) => key === `${suitTileKey(oneSuit, 1)[0]}1`),
                pungGroup((key) => key === `${suitTileKey(nineSuit, 1)[0]}9`),
              ])
            ) {
              return true;
            }
          }
        }
      }
      return false;
    },
  },
  {
    id: "hachi-ban",
    name: "Hachi Ban",
    companionPages: [10, 25, 30, 32],
    illustratedPages: [57],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-8 or 2-9 in one suit, plus three pairs: one of three different " +
      "winds, or one of each dragon.",
    source: "Synopsis pp. 56 and 58; illustrations pp. 10, 30 and 32.",
    notes:
      "The three printings share one shape family and are deduped here. The " +
      "concealed label is LIMIT; exposed half is assumed where cropped.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        [1, 2].some((start) => {
          const run = runGroup(suit, start, 8);
          return (
            matchesGroups(shape, [run, distinctPairsGroup(3, isWind)]) ||
            matchesGroups(shape, [run, distinctPairsGroup(3, isDragon)])
          );
        }),
      ),
  },
  {
    id: "guardian-winds",
    name: "Guardian Winds",
    companionPages: [10, 39],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description: "Run 1-9 in one suit, a pung/kong of winds and a wind pair.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 10.",
    notes:
      "Exposed value is cropped on the hand page; half is assumed from the " +
      "book's usual concealed/exposed split.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesStandard(shape, isWind, [
          chowSuit(suit, [1]),
          chowSuit(suit, [4]),
          chowSuit(suit, [7]),
          pungWind,
        ]),
      ),
  },
  {
    id: "wriggly-dragon",
    name: "Wriggly Dragon",
    companionPages: [11, 31],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, one of each dragon, and a pair of dragons.",
    source: "Synopsis pp. 56 and 58.",
    notes:
      "The p. 13 hand page prints LIMIT (Concealed); concealed-only.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          runGroup(suit, 1, 9),
          exactGroup(DRAGON_KEYS),
          pairGroup(isDragon),
        ]),
      ),
  },
  {
    id: "five-odd-honours",
    name: "Five Odd Honours",
    companionPages: [11, 38],
    illustratedPages: [56],
    category: "run",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit plus five different winds/dragons, with no pair " +
      "among the honours.",
    source: "Synopsis p. 56; illustration p. 38.",
    match: ({ shape }) =>
      shape.total === 14 &&
      SUITS.some((suit) => {
        if (!suitIsExactRun(shape, suit, 1, 9)) return false;
        const honours = shapeKeys(shape).filter(isHonourKey);
        return (
          honours.length === 5 &&
          honours.every((key) => tileCount(shape, key) === 1)
        );
      }),
  },
  {
    id: "guardian-dragons",
    name: "Guardian Dragons",
    companionPages: [10, 39],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, a pung/kong of dragons and a dragon pair.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 10.",
    notes:
      "The hand page prints only 'As Guardian Winds ... with Pung/K Dragons " +
      "and Pair Dragons'; exposed half is assumed.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesStandard(shape, isDragon, [
          chowSuit(suit, [1]),
          chowSuit(suit, [4]),
          chowSuit(suit, [7]),
          pungDragon,
        ]),
      ),
  },
  {
    id: "grand-sequence",
    name: "Grand Sequence",
    companionPages: [11, 40],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, a pung/kong of winds or dragons, and a suited " +
      "pair (1-9).",
    source: "Synopsis p. 56; illustrations p. 40.",
    notes:
      "The two illustrated " +
      "versions on p. 40 differ only in the suit of the run; they are one " +
      "shape.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesStandard(shape, isSuitedKey, [
          chowSuit(suit, [1]),
          chowSuit(suit, [4]),
          chowSuit(suit, [7]),
          honourPung,
        ]),
      ),
  },
  {
    id: "dragons-tail",
    name: "Dragon's Tail (1 & 2)",
    companionPages: [12, 41],
    illustratedPages: [52],
    category: "run",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, a pung/kong of winds and a dragon pair, or a " +
      "pung/kong of dragons and a wind pair.",
    source: "Synopsis p. 56; illustration p. 12.",
    notes:
      "The two printed variants are deduped: the predicate accepts either " +
      "orientation, so one shape never yields two competing wins.",
    match: ({ shape }) =>
      SUITS.some(
        (suit) =>
          matchesStandard(shape, isDragon, [
            chowSuit(suit, [1]),
            chowSuit(suit, [4]),
            chowSuit(suit, [7]),
            pungWind,
          ]) ||
          matchesStandard(shape, isWind, [
            chowSuit(suit, [1]),
            chowSuit(suit, [4]),
            chowSuit(suit, [7]),
            pungDragon,
          ]),
      ),
  },
  {
    id: "dragons-gates",
    name: "Dragon's Gates",
    companionPages: [12, 34],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Run 2-8 in one suit with one run tile paired, a pung/kong of 1s or 9s " +
      "in that suit, and a pung/kong of the corresponding dragon.",
    source: "Synopsis p. 56; illustrations pp. 12 and 34.",
    notes:
      "Corresponding dragon: Bamboo-Green, Characters-Red, Circles-White.",
    match: ({ shape }) =>
      SUITS.some((suit) => {
        const prefix = suitTileKey(suit, 1)[0]!;
        const dragon = `d${CORRESPONDING_DRAGON[suit][0]!.toUpperCase()}`;
        return matchesGroups(shape, [
          runWithPairGroup(suit, 2, 7),
          pungGroup((key) => key === `${prefix}1` || key === `${prefix}9`),
          pungGroup((key) => key === dragon),
        ]);
      }),
  },
  {
    id: "dragons-teeth",
    name: "Dragon's Teeth",
    companionPages: [12, 33, 60],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of Red and White Dragons, plus run 1-7 or 2-8 in " +
      "Characters or Circles with one run tile paired.",
    source: "Synopsis pp. 56 and 58; illustration p. 12.",
    notes:
      "The Characters and Circles printings are one hand; the suit is part of " +
      "the match, not a second competing pattern.",
    match: ({ shape }) => {
      for (const suit of ["characters", "circles"] as const) {
        for (const start of [1, 2]) {
          if (
            matchesGroups(shape, [
              runWithPairGroup(suit, start, 7),
              pungGroup((key) => key === "dR"),
              pungGroup((key) => key === "dW"),
            ])
          ) {
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    id: "gretas-garden",
    name: "Greta's Garden",
    companionPages: [13, 38],
    illustratedPages: [43],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-7 in one suit, one of each wind and one of each dragon.",
    source: "Synopsis p. 56; illustration p. 38.",
    notes:
      "Composition is taken from " +
      "the synopsis and p. 38; limit/half is assumed.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          runGroup(suit, 1, 7),
          exactGroup(WIND_KEYS),
          exactGroup(DRAGON_KEYS),
        ]),
      ),
  },
  {
    id: "gretas-dragon",
    name: "Greta's Dragon",
    companionPages: [13, 38],
    illustratedPages: [43],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Run 1-7 in one suit, one of each wind, and a pung of any dragon.",
    source: "Synopsis p. 56; illustration p. 38.",
    notes:
      "The p. 13 hand page prints LIMIT (Concealed); concealed-only.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          runGroup(suit, 1, 7),
          exactGroup(WIND_KEYS),
          pungOnlyGroup(isDragon),
        ]),
      ),
  },
  {
    id: "red-lantern",
    name: "Red Lantern",
    companionPages: [13, 40],
    illustratedPages: [48],
    category: "run",
    tier: "double",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Run 1-7 in one suit with one run tile paired, a pung/kong of the " +
      "player's own wind, and a pung/kong of Red Dragons.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 40.",
    notes:
      "'OWN Wind' uses the hand's " +
      "seat wind; the exposed value is read from the header.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          runWithPairGroup(suit, 1, 7),
          pungGroup((key) => key === ownWindKey(shape)),
          pungGroup((key) => key === "dR"),
        ]),
      ),
  },
  {
    id: "gerties-garter",
    name: "Gertie's Garter",
    companionPages: [14, 20, 50],
    illustratedPages: [37],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description: "Run 1-7 in one suit and run 1-7 in another suit.",
    source: "Short list p. 6; synopsis p. 56; illustrations pp. 14, 20 and 50.",
    notes:
      "The three printings are one shape and are deduped. The exposed value " +
      "is cropped on the hand page; half is assumed.",
    match: ({ shape }) => {
      for (const first of SUITS) {
        for (const second of SUITS) {
          if (first === second) continue;
          if (
            matchesGroups(shape, [
              runGroup(first, 1, 7),
              runGroup(second, 1, 7),
            ])
          ) {
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    id: "yin-yang",
    name: "Yin Yang",
    companionPages: [14, 50],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "11, 234, 55 in one suit and 55, 678, 99 in another suit.",
    source: "Synopsis p. 56; illustrations pp. 14 and 50.",
    notes:
      "The two printings are one shape. The exposed value is cropped on the " +
      "hand page; half is assumed.",
    match: ({ shape }) => {
      for (const first of SUITS) {
        for (const second of SUITS) {
          if (first === second) continue;
          const firstPrefix = suitTileKey(first, 1)[0];
          const secondPrefix = suitTileKey(second, 1)[0];
          const keys = [
            `${firstPrefix}1`, `${firstPrefix}1`,
            `${firstPrefix}2`, `${firstPrefix}3`, `${firstPrefix}4`,
            `${firstPrefix}5`, `${firstPrefix}5`,
            `${secondPrefix}5`, `${secondPrefix}5`,
            `${secondPrefix}6`, `${secondPrefix}7`, `${secondPrefix}8`,
            `${secondPrefix}9`, `${secondPrefix}9`,
          ];
          if (matchesGroups(shape, [exactGroup(keys)])) return true;
        }
      }
      return false;
    },
  },
  {
    id: "big-robert",
    name: "Big Robert",
    companionPages: [14],
    illustratedPages: [],
    category: "run",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "A run of four tiles in each suit, using the same four numbers in all " +
      "three suits, plus a pair of winds or dragons.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 14.",
    notes:
      "The hand page prints 'LIMIT for same numbers (Otherwise) HALF LIMIT'; " +
      "the mixed-numbers version is the separate big-robert-mixed pattern. " +
      "The exposed values are cropped; half is assumed for both.",
    match: ({ shape }) => bigRobert(shape, true),
  },
  {
    id: "big-robert-mixed",
    name: "Big Robert (mixed numbers)",
    companionPages: [14],
    illustratedPages: [],
    category: "run",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    variantOf: "big-robert",
    description:
      "A run of four tiles in each suit, with the three runs not all using " +
      "the same numbers, plus a pair of winds or dragons.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 14.",
    notes:
      "Scoring variant of Big Robert: half limit when the three four-tile runs " +
      "do not share the same numbers. Mutually exclusive with big-robert.",
    match: ({ shape }) => bigRobert(shape, false),
  },
  {
    id: "moon-at-bottom-of-well",
    name: "Moon at Bottom of Well",
    companionPages: [15, 47, 60],
    illustratedPages: [],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Four chows and a pair, all in Circles; three of the chows are 123, 456 " +
      "and 789 in ascending order.",
    source: "Short list p. 6; synopsis pp. 56 and 60.",
    provisional: true,
    notes:
      "'Three in ascending order' " +
      "is read conservatively as the presence of the 123, 456 and 789 chows; " +
      "the fourth chow may be any Circle chow. limit/half is assumed.",
    match: ({ shape }) =>
      decomposeStandard(shape).some((decomposition) => {
        if (
          !decomposition.sets.every(
            (set) => set.kind === "chow" && set.suit === "circles",
          )
        ) {
          return false;
        }
        if (!decomposition.pair.startsWith("o")) return false;
        const starts = decomposition.sets.map((set) =>
          set.kind === "chow" ? set.start : -1,
        );
        return [1, 4, 7].every((start) => starts.includes(start));
      }),
  },
  {
    id: "three-philosophers",
    name: "Three Philosophers",
    companionPages: [15],
    illustratedPages: [],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One chow in each suit, one mixed chow (three consecutive numbers, one " +
      "in each suit), and a suited pair.",
    source: "Synopsis p. 56.",
    notes:
      "'Mixed chow' is read from " +
      "the Crazy Chows illustration (p. 16): three consecutive numbers, one " +
      "tile from each suit. limit/half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        runGroup("bamboo", "any", 3),
        runGroup("characters", "any", 3),
        runGroup("circles", "any", 3),
        mixedChowGroup(),
        pairGroup(isSuitedKey),
      ]),
  },
  {
    id: "crazy-chows",
    name: "Crazy Chows",
    companionPages: [16],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Four mixed chows plus a mixed pair (the same number in two suits).",
    source: "Synopsis p. 56; illustration p. 16.",
    provisional: true,
    notes:
      "The four mixed chows are clear on p. 16; the pair is cropped. Read as " +
      "the book's 'mixed pair': same number, two different suits.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        mixedChowGroup(),
        mixedChowGroup(),
        mixedChowGroup(),
        mixedChowGroup(),
        mixedPairGroup(),
      ]),
  },
  {
    id: "little-robert",
    name: "Little Robert",
    companionPages: [16],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One chow in each suit, one pung/kong in any suit, and a pair in any " +
      "suit.",
    source: "Short list p. 6; synopsis p. 56; illustration p. 16.",
    match: ({ shape }) =>
      matchesStandard(shape, () => true, [
        chowSuit("bamboo"),
        chowSuit("characters"),
        chowSuit("circles"),
        anyPung,
      ]),
  },
  {
    id: "windy-chow",
    name: "Windy Chow",
    companionPages: [18, 26],
    illustratedPages: [41],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One chow in each suit, one of each wind, and one wind paired.",
    source: "Short list p. 6; synopsis p. 56; illustrations pp. 18 and 26.",
    notes:
      "The p. 18 and p. 26 printings are one shape and are deduped.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        runGroup("bamboo", "any", 3),
        runGroup("characters", "any", 3),
        runGroup("circles", "any", 3),
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
      ]),
  },
  {
    id: "chop-suey",
    name: "Chop Suey",
    companionPages: [18, 26],
    illustratedPages: [58],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Chow 123 in each suit, one of each wind, and one wind paired.",
    source: "Short list p. 6; synopsis p. 56; illustrations pp. 18 and 26.",
    notes:
      "The p. 18 and p. 26 printings are one shape. Exposed value is cropped; " +
      "half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        runGroup("bamboo", 1, 3),
        runGroup("characters", 1, 3),
        runGroup("circles", 1, 3),
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
      ]),
  },
  {
    id: "chow-mein",
    name: "Chow Mien",
    companionPages: [18, 26],
    illustratedPages: [58],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Chow 789 in each suit, one of each wind, and one wind paired.",
    source: "Short list p. 6; synopsis p. 56; illustrations pp. 18 and 26.",
    notes:
      "The p. 18 and p. 26 printings are one shape. Exposed value is cropped; " +
      "half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        runGroup("bamboo", 7, 3),
        runGroup("characters", 7, 3),
        runGroup("circles", 7, 3),
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
      ]),
  },
  {
    id: "hovering-angel",
    name: "Hovering Angel",
    companionPages: [17, 41],
    illustratedPages: [],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One chow in each suit, a pung/kong of the player's own wind, and a " +
      "dragon pair.",
    source: "Synopsis p. 56.",
    notes:
      "'OWN Wind' uses the hand's " +
      "seat wind.",
    match: ({ shape }) =>
      matchesStandard(shape, isDragon, [
        chowSuit("bamboo"),
        chowSuit("characters"),
        chowSuit("circles"),
        (set) => isPungSet(set) && set.tile === ownWindKey(shape),
      ]),
  },
  {
    id: "little-brother",
    name: "Little Brother",
    companionPages: [17],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One chow in each suit, a fourth chow in any suit, and a pair of the " +
      "player's own wind.",
    source: "Short list p. 6; synopsis p. 56.",
    notes:
      "'OWN Wind' uses the hand's " +
      "seat wind.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => key === ownWindKey(shape), [
        chowSuit("bamboo"),
        chowSuit("characters"),
        chowSuit("circles"),
        anyChow,
      ]),
  },
  {
    id: "apple-blossom",
    name: "Apple Blossom",
    companionPages: [19, 33],
    illustratedPages: [],
    category: "chow",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Three mixed chows, a pung/kong of White Dragons, and a pair of Green " +
      "Dragons.",
    source: "Synopsis pp. 56 and 58.",
    notes:
      "p. 33 repeats the synopsis.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        mixedChowGroup(),
        mixedChowGroup(),
        mixedChowGroup(),
        pungGroup((key) => key === "dW"),
        pairGroup((key) => key === "dG"),
      ]),
  },
  {
    id: "professors",
    name: "The Professors",
    companionPages: [19],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Three mixed chows, one of each dragon, and a pair of the player's own " +
      "wind.",
    source: "Synopsis p. 56.",
    notes:
      "'OWN Wind' uses the hand's " +
      "seat wind.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        mixedChowGroup(),
        mixedChowGroup(),
        mixedChowGroup(),
        exactGroup(DRAGON_KEYS),
        pairGroup((key) => key === ownWindKey(shape)),
      ]),
  },
  {
    id: "knitting",
    name: "Knitting",
    companionPages: [20, 50],
    illustratedPages: [37],
    category: "pairs",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs using exactly two suits; each pair is the same number in " +
      "the two suits.",
    source: "Short list p. 6; synopsis p. 60; illustrations pp. 20 and 50.",
    notes:
      "The p. 20 and p. 50 printings are one shape. Matching counts per rank " +
      "in the two suits also allows a kong as two knitting pairs.",
    match: ({ shape }) => {
      if (shape.total !== 14 || shape.honoursTotal !== 0) return false;
      const suits = usedSuits(shape);
      if (suits.length !== 2) return false;
      const first = suits[0]!;
      const second = suits[1]!;
      let pairs = 0;
      for (let rank = 1; rank <= 9; rank++) {
        const a = rankCount(shape, first, rank);
        const b = rankCount(shape, second, rank);
        if (a !== b) return false;
        pairs += a;
      }
      return pairs === 7;
    },
  },
  {
    id: "triple-knitting",
    name: "Triple Knitting",
    companionPages: [20, 51],
    illustratedPages: [37],
    category: "pairs",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Four triple sets (one tile of the same number in each of the three " +
      "suits) plus a knitting pair (the same number in two suits).",
    source: "Short list p. 6; synopsis p. 60; illustration p. 20.",
    notes:
      "The p. 20 and p. 60 printings are one shape. The four set ranks are " +
      "distinct; the pair may repeat one of them.",
    match: ({ shape }) => tripleKnitting(shape),
  },
  {
    id: "all-pair-honours",
    name: "All Pair Honours",
    companionPages: [22, 44],
    illustratedPages: [38],
    category: "pairs",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs in which every pair is a terminal (1 or 9) or an honour; " +
      "the two kinds may be combined.",
    source: "Short list p. 6; synopsis p. 58; illustrations pp. 22 and 44.",
    notes:
      "The p. 22 and p. 44 printings are one shape. Terminals may come from " +
      "any suit.",
    match: ({ shape }) =>
      isSevenPairs(shape) &&
      shapeKeys(shape).every(
        (key) => isTerminalKey(key) || isHonourKey(key),
      ),
  },
  {
    id: "seven-twins",
    name: "Seven Twins",
    companionPages: [22],
    illustratedPages: [],
    category: "pairs",
    tier: "half",
    exposedTier: null,
    requiresSelfDrawn: true,
    description:
      "Seven pairs of any tiles; every tile, including the last, comes from " +
      "the wall.",
    source: "Synopsis p. 56; illustration p. 22.",
    notes:
      "Concealed-only: no melds and a self-drawn winning tile. Distinct from " +
      "Heavenly Twins, which is seven pairs in one suit.",
    match: ({ shape, hand }) =>
      hand.melds.length === 0 && isSevenPairs(shape),
  },
  {
    id: "dragons-breath",
    name: "Dragon's Breath",
    companionPages: [24, 31],
    illustratedPages: [53],
    category: "pairs",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Five pairs in one suit, one of each dragon, and one extra dragon that " +
      "pairs with one of them.",
    source: "Short list p. 6; synopsis p. 58; illustration p. 24.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          pairsInSuitGroup(suit, 5),
          exactGroup(DRAGON_KEYS),
          singleGroup(isDragon),
        ]),
      ),
  },
  {
    id: "windfall",
    name: "Windfall",
    companionPages: [24, 27],
    illustratedPages: [53],
    category: "pairs",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description: "Five pairs in one suit and one of each wind.",
    source: "Short list p. 6; illustration p. 24.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          pairsInSuitGroup(suit, 5),
          exactGroup(WIND_KEYS),
        ]),
      ),
  },
  {
    id: "dragonette",
    name: "Dragonette",
    companionPages: [24, 39],
    illustratedPages: [],
    category: "pairs",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Three pairs in one suit (no 1s or 9s), one of each wind, and one of " +
      "each dragon with one dragon paired.",
    source: "Illustration p. 24.",
    notes:
      "The sidebar's tail is cut after 'Three Pairs same suit-no 1s or 9s'; " +
      "the visible tiles show ESWN and a Green Dragon. The most conservative " +
      "14-tile reading pairs one of the three dragons (the cut tiles), not an " +
      "arbitrary tile.",
    match: ({ shape }) => {
      for (const suit of SUITS) {
        const prefix = suitTileKey(suit, 1)[0];
        const suitPair = (key: string) =>
          isSuitedKey(key) &&
          key[0] === prefix &&
          Number(key[1]) >= 2 &&
          Number(key[1]) <= 8;
        if (!shapeKeys(shape).every((key) => suitPair(key) || isWind(key) || isDragon(key))) {
          continue;
        }
        if (
          matchesGroups(shape, [
            distinctPairsGroup(3, suitPair),
            exactGroup(WIND_KEYS),
            exactGroup(DRAGON_KEYS),
            singleGroup(isDragon),
          ])
        ) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "windy-ones",
    name: "Windy Ones",
    companionPages: [28, 45],
    illustratedPages: [42],
    category: "honour",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One of each wind with one wind paired, plus a pung/kong of 1s in each " +
      "suit.",
    source: "Synopsis p. 58; illustration p. 28.",
    notes:
      "The p. 28 and p. 45 printings are one shape. Exposed value is cropped; " +
      "half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
        pungGroup((key) => key === "b1"),
        pungGroup((key) => key === "c1"),
        pungGroup((key) => key === "o1"),
      ]),
  },
  {
    id: "windy-nines",
    name: "Windy Nines",
    companionPages: [28, 45],
    illustratedPages: [42],
    category: "honour",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One of each wind with one wind paired, plus a pung/kong of 9s in each " +
      "suit.",
    source: "Synopsis p. 58; illustration p. 28.",
    notes:
      "The p. 28 and p. 45 printings are one shape. Exposed value is cropped; " +
      "half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
        pungGroup((key) => key === "b9"),
        pungGroup((key) => key === "c9"),
        pungGroup((key) => key === "o9"),
      ]),
  },
  {
    id: "windvane",
    name: "Windvane",
    companionPages: [28],
    illustratedPages: [],
    category: "honour",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One of each wind with one wind paired, plus one pung/kong in each " +
      "suit.",
    source: "Illustration p. 28.",
    notes:
      "The sidebar reads 'One of each Wind' and 'Pung/K in each suit'; the " +
      "14th tile is read as a second copy of a wind, matching Windy Ones and " +
      "Windy Nines. Exposed half is assumed.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
        pungGroup(isBamboo),
        pungGroup(isCharacters),
        pungGroup(isCircles),
      ]),
  },
  {
    id: "civil-war",
    name: "Civil War",
    companionPages: [30],
    illustratedPages: [53],
    category: "honour",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of North and South Winds, plus 1, 1, 6, 8 in one suit and " +
      "1, 5, 6, 8 in another suit (1861 and 1865).",
    source: "Illustration p. 30.",
    notes:
      "MIDDLE LIMIT, exposed allowed (C p. 30). The Illustrated book prints " +
      "DOUBLE LIMIT. The illustration shows NNN, SSS and 1,8,6,1 in one suit " +
      "plus the leading 1 of the second; the synopsis prints 1861 and 1865.",
    match: ({ shape }) => {
      for (const first of SUITS) {
        for (const second of SUITS) {
          if (first === second) continue;
          const a = suitTileKey(first, 1)[0];
          const b = suitTileKey(second, 1)[0];
          if (
            matchesGroups(shape, [
              pungGroup((key) => key === "wN"),
              pungGroup((key) => key === "wS"),
              exactGroup([
                `${a}1`, `${a}1`, `${a}6`, `${a}8`,
                `${b}1`, `${b}5`, `${b}6`, `${b}8`,
              ]),
            ])
          ) {
            return true;
          }
        }
      }
      return false;
    },
  },
  {
    id: "four-blessings",
    name: "The Four Blessings",
    companionPages: [30],
    illustratedPages: [49],
    category: "honour",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description: "Pungs/kongs of all four winds plus any pair.",
    source: "Synopsis p. 56; illustration p. 30.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        pungGroup((key) => key === "wE"),
        pungGroup((key) => key === "wS"),
        pungGroup((key) => key === "wW"),
        pungGroup((key) => key === "wN"),
        pairGroup(() => true),
      ]),
  },
  {
    id: "all-pair-jade",
    name: "All Pair Jade",
    companionPages: [23, 32, 52],
    illustratedPages: [44],
    category: "dragon",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs: one or two pairs of Green Dragons plus five or six pairs " +
      "of green Bamboos (2, 3, 4, 6, 8).",
    source: "Synopsis pp. 58 and 60; illustrations pp. 32 and 52.",
    notes:
      "A four-of-a-kind counts as two pairs, which is how six pairs of green " +
      "Bamboos are possible from five ranks. The Illustrated book prints only " +
      "the one-dragon-pair shape; the Companion's wider reading governs.",
    match: ({ shape }) => {
      if (!isSevenPairs(shape)) return false;
      if (shapeKeys(shape).some((key) => !isBamboo(key) && key !== "dG")) {
        return false;
      }
      const dragonPairs = Math.floor(dragonCount(shape, "green") / 2);
      let bambooPairs = 0;
      for (const rank of GREEN_BAMBOO_RANKS) {
        bambooPairs += Math.floor(rankCount(shape, "bamboo", rank) / 2);
      }
      // GG + six bamboo pairs, or GG/GG + five (C pp. 23 and 32); seven pairs either way.
      return (dragonPairs === 1 && bambooPairs === 6) || (dragonPairs === 2 && bambooPairs === 5);
    },
  },
  {
    id: "all-pair-ruby-jade",
    name: "All Pair Ruby Jade",
    companionPages: [23, 32, 53],
    illustratedPages: [46],
    category: "dragon",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs: a Red Dragon pair, a Green Dragon pair, and five pairs " +
      "of red or green Bamboos.",
    source: "Short list p. 6; synopsis pp. 58 and 60; illustration p. 32.",
    notes:
      "The red and green Bamboo sets together cover every Bamboo rank, so the " +
      "five Bamboo pairs may use any rank.",
    match: ({ shape }) => {
      if (!isSevenPairs(shape)) return false;
      if (
        dragonCount(shape, "red") !== 2 ||
        dragonCount(shape, "green") !== 2 ||
        dragonCount(shape, "white") !== 0
      ) {
        return false;
      }
      if (
        shapeKeys(shape).some((key) =>
          isHonourKey(key) ? key !== "dR" && key !== "dG" : !isBamboo(key),
        )
      ) {
        return false;
      }
      let bambooPairs = 0;
      for (let rank = 1; rank <= 9; rank++) {
        bambooPairs += Math.floor(rankCount(shape, "bamboo", rank) / 2);
      }
      return bambooPairs === 5;
    },
  },
  {
    id: "golden-gates",
    name: "Golden Gates",
    companionPages: [25, 34],
    illustratedPages: [],
    category: "dragon",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of the corresponding dragon, pung/kong of 1s or 9s in one " +
      "suit, and pairs of 2, 4, 6 and 8 in that suit.",
    source: "Synopsis p. 58; illustration p. 34.",
    notes:
      "Corresponding dragon: Bamboo-Green, Characters-Red, Circles-White.",
    match: ({ shape }) =>
      SUITS.some((suit) => {
        const prefix = suitTileKey(suit, 1)[0]!;
        const dragon = `d${CORRESPONDING_DRAGON[suit][0]!.toUpperCase()}`;
        return matchesGroups(shape, [
          pungGroup((key) => key === dragon),
          pungGroup((key) => key === `${prefix}1` || key === `${prefix}9`),
          exactGroup([
            `${prefix}2`, `${prefix}2`,
            `${prefix}4`, `${prefix}4`,
            `${prefix}6`, `${prefix}6`,
            `${prefix}8`, `${prefix}8`,
          ]),
        ]);
      }),
  },
  {
    id: "red-waratah",
    name: "Red Waratah",
    companionPages: [34],
    illustratedPages: [54],
    category: "dragon",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Red Dragons, pair of Green Dragons, and pungs of a red " +
      "Bamboo, Circles and Characters.",
    source: "Synopsis p. 58; illustration p. 34.",
    notes:
      "The p. 34 hand page prints LIMIT (Exposed).",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => key === "dG", [
        pungOf("dR"),
        pungOnlySuit("bamboo", RED_BAMBOO_RANKS),
        pungOnlySuit("circles"),
        pungOnlySuit("characters"),
      ]),
  },
  {
    id: "green-jade",
    name: "Green Jade",
    companionPages: [35, 53],
    illustratedPages: [56],
    category: "dragon",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Green Dragons, three pungs/kongs of Bamboos, and a Bamboo " +
      "pair (red or green).",
    source: "Synopsis pp. 58 and 60.",
    notes:
      "limit/limit is " +
      "assumed from the Pungs of Dragons family.",
    match: ({ shape }) =>
      matchesStandard(shape, isBamboo, [
        pungOf("dG"),
        pungSuit("bamboo"),
        pungSuit("bamboo"),
        pungSuit("bamboo"),
      ]),
  },
  {
    id: "red-coral",
    name: "Red Coral",
    companionPages: [35, 60],
    illustratedPages: [56],
    category: "dragon",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Red Dragons, three pungs/kongs of Characters, and a " +
      "Character pair.",
    source: "Synopsis pp. 58 and 60.",
    notes:
      "limit/limit is assumed " +
      "from the Pungs of Dragons family.",
    match: ({ shape }) =>
      matchesStandard(shape, isCharacters, [
        pungOf("dR"),
        pungSuit("characters"),
        pungSuit("characters"),
        pungSuit("characters"),
      ]),
  },
  {
    id: "white-opal",
    name: "White Opal",
    companionPages: [35, 60],
    illustratedPages: [56],
    category: "dragon",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of White Dragons, three pungs/kongs of Circles, and a Circle " +
      "pair.",
    source: "Synopsis pp. 58 and 60.",
    notes:
      "limit/limit is assumed " +
      "from the Pungs of Dragons family.",
    match: ({ shape }) =>
      matchesStandard(shape, isCircles, [
        pungOf("dW"),
        pungSuit("circles"),
        pungSuit("circles"),
        pungSuit("circles"),
      ]),
  },
  {
    id: "imperial-jade",
    name: "Imperial Jade",
    companionPages: [36, 52],
    illustratedPages: [44],
    category: "dragon",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Green Dragons, three green-Bamboo sets (pungs/kongs, or " +
      "one chow), and a green Bamboo pair.",
    source: "Synopsis pp. 58 and 60; illustrations pp. 36 and 52.",
    provisional: true,
    notes:
      "The synopsis says 'Three P/K (or a Chow)'; p. 36 illustrates three " +
      "pungs of green Bamboos. Read as three green-Bamboo sets with at most " +
      "one chow. A green-Bamboo chow can only be 2-3-4, so 1-2-3 and 5-6-7 " +
      "are excluded.",
    match: ({ shape }) =>
      decomposeStandard(shape).some((decomposition) => {
        if (
          !decomposition.pair.startsWith("b") ||
          !GREEN_BAMBOO_RANKS.includes(Number(decomposition.pair[1]))
        ) {
          return false;
        }
        const greenPungs = decomposition.sets.filter(
          (set) => isPungSet(set) && set.tile === "dG",
        );
        if (greenPungs.length !== 1) return false;
        const others = decomposition.sets.filter(
          (set) => !(isPungSet(set) && set.tile === "dG"),
        );
        if (others.length !== 3) return false;
        let chows = 0;
        for (const set of others) {
          if (set.kind === "chow") {
            if (set.suit !== "bamboo" || set.start !== 2) return false;
            chows++;
          } else if (
            setSuitOf(set) !== "bamboo" ||
            !GREEN_BAMBOO_RANKS.includes(Number(set.tile[1]))
          ) {
            return false;
          }
        }
        return chows <= 1;
      }),
  },
  {
    id: "lily-of-the-valley",
    name: "Lily of the Valley",
    companionPages: [36, 52],
    illustratedPages: [44],
    category: "dragon",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of Green and White Dragons, two green-Bamboo pungs/kongs, " +
      "and a green Bamboo pair.",
    source: "Synopsis pp. 58 and 60; illustrations pp. 36 and 52.",
    match: ({ shape }) =>
      matchesStandard(
        shape,
        (key) => isBamboo(key) && GREEN_BAMBOO_RANKS.includes(Number(key[1])),
        [
          pungOf("dG"),
          pungOf("dW"),
          pungSuit("bamboo", GREEN_BAMBOO_RANKS),
          pungSuit("bamboo", GREEN_BAMBOO_RANKS),
        ],
      ),
  },
  {
    id: "lillypilly",
    name: "Lillypilly",
    companionPages: [36, 60],
    illustratedPages: [54],
    category: "dragon",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Green Dragons, pair of White Dragons, and three " +
      "pungs/kongs of Circles.",
    source: "Synopsis pp. 58 and 60; illustration p. 36.",
    notes:
      "The tier label is cropped on p. 36; double/double is assumed from " +
      "Imperial Jade and Lily of the Valley.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => key === "dW", [
        pungOf("dG"),
        pungSuit("circles"),
        pungSuit("circles"),
        pungSuit("circles"),
      ]),
  },
  {
    id: "sunrise",
    name: "Sunrise",
    companionPages: [42],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of East Winds, a pair of White Dragons, and one pung/kong in " +
      "each suit with no 1s or 9s.",
    source: "Synopsis p. 58; illustration p. 42.",
    notes:
      "The sidebar is cropped after 'Pung/K in each suit-no'; read as no 1s " +
      "or 9s, matching the illustrated middle tiles.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => key === "dW", [
        pungOf("wE"),
        pungSuit("bamboo", [2, 3, 4, 5, 6, 7, 8]),
        pungSuit("characters", [2, 3, 4, 5, 6, 7, 8]),
        pungSuit("circles", [2, 3, 4, 5, 6, 7, 8]),
      ]),
  },
  {
    id: "sunset",
    name: "Sunset",
    companionPages: [42],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of West Winds, a pair of Red Dragons, and one pung/kong in " +
      "each suit with no 1s or 9s.",
    source: "Synopsis p. 58; illustration p. 42.",
    notes:
      "The sidebar is cropped after 'Pung/K in each suit-no'; read as no 1s " +
      "or 9s, matching the illustrated middle tiles.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => key === "dR", [
        pungOf("wW"),
        pungSuit("bamboo", [2, 3, 4, 5, 6, 7, 8]),
        pungSuit("characters", [2, 3, 4, 5, 6, 7, 8]),
        pungSuit("circles", [2, 3, 4, 5, 6, 7, 8]),
      ]),
  },
  {
    id: "unique-wonder",
    name: "Unique Wonder",
    companionPages: [44],
    illustratedPages: [38],
    category: "honour",
    tier: "double",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "One of each wind, one of each dragon, the 1 and 9 of each suit, and " +
      "one extra tile that pairs with any of those thirteen.",
    source: "Synopsis p. 58; illustration p. 44.",
    match: ({ shape }) => {
      const base = [
        ...WIND_KEYS,
        ...DRAGON_KEYS,
        "b1", "b9", "c1", "c9", "o1", "o9",
      ];
      if (!shapeKeys(shape).every((key) => base.includes(key))) return false;
      return matchesGroups(shape, [
        exactGroup(base),
        singleGroup((key) => base.includes(key)),
      ]);
    },
  },
  {
    id: "all-honour-hand",
    name: "All Honour Hand",
    companionPages: [44],
    illustratedPages: [38],
    category: "honour",
    tier: "calculate",
    exposedTier: "calculate",
    requiresSelfDrawn: false,
    description:
      "Four pungs/kongs plus a pair, using only winds, dragons, 1s and 9s " +
      "(the terminals may come from any suit).",
    source: "Short list p. 6; synopsis p. 58; illustration p. 44.",
    notes:
      "The p. 44 illustration uses terminals from more than one suit, so the " +
      "short list and diagram are read literally; no one-suit restriction.",
    match: ({ shape }) =>
      shapeKeys(shape).every(
        (key) => isHonourKey(key) || isTerminalKey(key),
      ) &&
      matchesStandard(shape, () => true, [anyPung, anyPung, anyPung, anyPung]),
  },
  {
    id: "windy-dragons",
    name: "Windy Dragons",
    companionPages: [25, 46],
    illustratedPages: [48],
    category: "honour",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "A pair of each wind plus two pungs of any dragons.",
    source: "Synopsis p. 58; illustration p. 46.",
    notes:
      "The p. 46 hand page prints LIMIT (Exposed).",
    match: ({ shape }) =>
      matchesGroups(shape, [
        pairGroup((key) => key === "wE"),
        pairGroup((key) => key === "wS"),
        pairGroup((key) => key === "wW"),
        pairGroup((key) => key === "wN"),
        pungOnlyGroup(isDragon),
        pungOnlyGroup(isDragon),
      ]),
  },
  {
    id: "all-winds-and-dragons",
    name: "All Winds and Dragons",
    companionPages: [46],
    illustratedPages: [48],
    category: "honour",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Four pungs/kongs plus a pair, using only winds and dragons.",
    source: "Synopsis p. 58; illustration p. 46.",
    notes:
      "Tier label is cropped on p. 46; double/double is assumed from the " +
      "four-honour-pung shape.",
    match: ({ shape }) =>
      shapeKeys(shape).every(isHonourKey) &&
      matchesStandard(shape, () => true, [anyPung, anyPung, anyPung, anyPung]),
  },
  {
    id: "heads-and-tails",
    name: "Heads and Tails",
    companionPages: [45, 51],
    illustratedPages: [40],
    category: "honour",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Four pungs/kongs plus a pair, using only 1s and 9s from any suits.",
    source: "Synopsis pp. 58 and 60.",
    notes:
      "The p. 45 and p. 51 printings are one shape. Tier assumed limit; the " +
      "",
    match: ({ shape }) =>
      shapeKeys(shape).every(isTerminalKey) &&
      matchesStandard(shape, () => true, [anyPung, anyPung, anyPung, anyPung]),
  },
  {
    id: "heavenly-twins",
    name: "Heavenly Twins",
    companionPages: [21, 48],
    illustratedPages: [34],
    category: "pairs",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Seven pairs in one suit, with no winds or dragons.",
    source: "Short list p. 6; illustration p. 48.",
    match: ({ shape }) =>
      isSevenPairs(shape) &&
      usedSuits(shape).length === 1 &&
      shape.honoursTotal === 0,
  },
  {
    id: "purity-hand",
    name: "Purity Hand",
    companionPages: [48],
    illustratedPages: [34],
    category: "suit",
    tier: "calculate",
    exposedTier: "calculate",
    requiresSelfDrawn: false,
    description:
      "All one suit and no honours: four pungs/kongs, or three pungs/kongs " +
      "and one chow, plus a pair.",
    source: "Short list p. 6; illustration p. 48.",
    match: ({ shape }) => {
      if (usedSuits(shape).length !== 1 || shape.honoursTotal !== 0) {
        return false;
      }
      if (shape.suitedTotal === 0) return false;
      return decomposeStandard(shape).some(
        (decomposition) =>
          decomposition.sets.filter((set) => set.kind === "chow").length <= 1,
      );
    },
  },
  {
    id: "ods-evens",
    companionUnillustrated: true,
    name: "Odds & Evens",
    companionPages: [60],
    illustratedPages: [],
    category: "suit",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "Every odd number (1, 3, 5, 7, 9) in two suits, plus every even number " +
      "(2, 4, 6, 8) in the third suit, one tile of each.",
    source: "Synopsis p. 60 (not illustrated).",
    notes:
      "The synopsis line is cut after 'one tile o[f ...]'. Read as one tile of " +
      "each listed rank: 5 + 5 + 4 = 14. This is the only counting that " +
      "reaches a full hand without inventing tiles.",
    match: ({ shape }) => {
      if (shape.total !== 14 || shape.honoursTotal !== 0) return false;
      return SUITS.some((evenSuit) => {
        const oddSuits = SUITS.filter((suit) => suit !== evenSuit);
        return (
          oddSuits.every((suit) => suitIsExactRanks(shape, suit, ODD_RANKS)) &&
          suitIsExactRanks(shape, evenSuit, EVEN_RANKS)
        );
      });
    },
  },
  {
    id: "robin",
    companionUnillustrated: true,
    name: "Robin",
    companionPages: [60],
    illustratedPages: [],
    category: "chow",
    tier: "half",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One chow in the first suit, two chows in the second suit, and a chow " +
      "plus the pair in the third suit.",
    source: "Synopsis p. 60 (not illustrated).",
    notes:
      "The synopsis line is cut after 'Chow and Pr in T[hird ...]'. Read as a " +
      "chow distribution of 1 / 2 / 1 with the pair in the single-chow suit: " +
      "3 + 6 + 5 = 14.",
    match: ({ shape }) =>
      decomposeStandard(shape).some((decomposition) => {
        if (!decomposition.sets.every((set) => set.kind === "chow")) {
          return false;
        }
        const pairTile = parseTile(decomposition.pair);
        if (pairTile.kind !== "suited") return false;
        const pairSuit = pairTile.suit;
        const counts = new Map<Suit, number>(
          SUITS.map((suit) => [suit, 0]),
        );
        for (const set of decomposition.sets) {
          if (set.kind === "chow") {
            counts.set(set.suit, (counts.get(set.suit) ?? 0) + 1);
          }
        }
        if (counts.get(pairSuit) !== 1) return false;
        const others = SUITS.filter((suit) => suit !== pairSuit)
          .map((suit) => counts.get(suit) ?? 0)
          .sort((a, b) => a - b);
        return others[0] === 1 && others[1] === 2;
      }),
  },
  {
    id: "sparrows-sanctuary",
    name: "Sparrow's Sanctuary",
    companionPages: [21, 49, 53],
    illustratedPages: [44],
    category: "suit",
    tier: "middle",
    exposedTier: null,
    requiresSelfDrawn: false,
    description:
      "Two pairs of 1 Bamboo (a kong) plus a pair of each green Bamboo " +
      "(2, 3, 4, 6, 8).",
    source: "Short list p. 6; synopsis p. 60.",
    notes: "MIDDLE LIMIT, concealed (C pp. 21 and 49). The Illustrated book prints LIMIT.",
    match: ({ shape }) => {
      if (!isSevenPairs(shape)) return false;
      if (shapeKeys(shape).some((key) => !isBamboo(key))) return false;
      if (rankCount(shape, "bamboo", 1) !== 4) return false;
      return GREEN_BAMBOO_RANKS.every(
        (rank) => rankCount(shape, "bamboo", rank) === 2,
      );
    },
  },
  {
    id: "ruby-jade",
    name: "Ruby Jade",
    companionPages: [37, 54],
    illustratedPages: [46],
    category: "dragon",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of Red and Green Dragons, one red-Bamboo pung/kong, one " +
      "green-Bamboo pung/kong, and a red or green Bamboo pair.",
    source: "Synopsis pp. 58 and 60; illustration p. 54.",
    match: ({ shape }) =>
      matchesStandard(shape, isBamboo, [
        pungOf("dR"),
        pungOf("dG"),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
        pungSuit("bamboo", GREEN_BAMBOO_RANKS),
      ]),
  },
  {
    id: "red-lily",
    name: "Red Lily",
    companionPages: [37, 54],
    illustratedPages: [46],
    category: "dragon",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "Pungs/kongs of Red and White Dragons, two red-Bamboo pungs/kongs, and " +
      "a red-Bamboo pair.",
    source: "Synopsis pp. 58 and 60; illustration p. 54.",
    match: ({ shape }) =>
      matchesStandard(shape, isRedBamboo, [
        pungOf("dR"),
        pungOf("dW"),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
      ]),
  },
  {
    id: "royal-ruby",
    name: "Royal Ruby",
    companionPages: [37, 54],
    illustratedPages: [46],
    category: "dragon",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Red Dragons, three red-Bamboo pungs/kongs, and a " +
      "red-Bamboo pair; no chow is allowed.",
    source: "Synopsis pp. 58 and 60; illustration p. 54.",
    match: ({ shape }) =>
      matchesStandard(shape, isRedBamboo, [
        pungOf("dR"),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
        pungSuit("bamboo", RED_BAMBOO_RANKS),
      ]),
  },
  {
    id: "blue-mountains",
    companionUnillustrated: true,
    name: "Blue Mountains",
    companionPages: [60],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Green Dragons, three circle pungs/kongs, and a pair of " +
      "blue Circles (2, 3, 4, 5, 8, 9).",
    source: "Synopsis p. 60 (not illustrated).",
    notes:
      "The blue-circle ranks are printed in the synopsis; limit/limit is " +
      "assumed from the White Opal family.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => isCircles(key) && BLUE_CIRCLE_RANKS.includes(Number(key[1])), [
        pungOf("dG"),
        pungSuit("circles"),
        pungSuit("circles"),
        pungSuit("circles"),
      ]),
  },
  {
    id: "white-elephant",
    companionUnillustrated: true,
    name: "White Elephant",
    companionPages: [60],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of White Dragons, three circle pungs/kongs, and a pair of " +
      "even Circles (2, 4, 6, 8).",
    source: "Synopsis p. 60 (not illustrated).",
    provisional: true,
    notes:
      "The synopsis says only 'Three P/K'; the Circle Suit context and the " +
      "even-Circle pair are read conservatively as three Circle pungs, " +
      "matching White Opal.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => isEvenCircle(key), [
        pungOf("dW"),
        pungSuit("circles"),
        pungSuit("circles"),
        pungSuit("circles"),
      ]),
  },
  {
    id: "driven-snow",
    companionUnillustrated: true,
    name: "Driven Snow",
    companionPages: [60],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of White Dragons, three character pungs/kongs, and a pair of " +
      "odd Characters (1, 3, 5, 7, 9).",
    source: "Synopsis p. 60 (not illustrated).",
    provisional: true,
    notes:
      "The synopsis says only 'Three P/K'; the Character Suit context and the " +
      "odd-Character pair are read conservatively as three Character pungs, " +
      "matching Red Coral.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => isOddCharacter(key), [
        pungOf("dW"),
        pungSuit("characters"),
        pungSuit("characters"),
        pungSuit("characters"),
      ]),
  },
  {
    id: "dragons-scales",
    companionUnillustrated: true,
    name: "Dragon's Scales",
    companionPages: [60],
    illustratedPages: [],
    category: "suit",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Pung/kong of Red Dragons, three character pungs/kongs, and a pair of " +
      "even Characters (2, 4, 6, 8).",
    source: "Synopsis p. 60 (not illustrated).",
    provisional: true,
    notes:
      "The synopsis says only 'Three P/K'; the Character Suit context and the " +
      "even-Character pair are read conservatively as three Character pungs, " +
      "matching Red Coral.",
    match: ({ shape }) =>
      matchesStandard(shape, (key) => isEvenCharacter(key), [
        pungOf("dR"),
        pungSuit("characters"),
        pungSuit("characters"),
        pungSuit("characters"),
      ]),
  },
  {
    id: "dragonfly",
    name: "Dragonfly",
    companionPages: [31],
    illustratedPages: [40],
    category: "dragon",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One of each dragon, one pung/kong in each suit, and a suited pair.",
    source: "Synopsis p. 58.",
    notes:
      "limit/limit is assumed " +
      "from the neighbouring dragon hands.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(DRAGON_KEYS),
        pungGroup(isBamboo),
        pungGroup(isCharacters),
        pungGroup(isCircles),
        pairGroup(isSuitedKey),
      ]),
  },
  {
    id: "three-sisters",
    name: "Three Sisters",
    companionPages: [29],
    illustratedPages: [55],
    category: "honour",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One of each wind with one wind paired, plus a pung/kong of 3s in each " +
      "suit.",
    source: "Synopsis p. 57.",
    notes:
      "The synopsis prints 1000/400; exposed half is assumed from the Windy " +
      "Ones pattern.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
        pungGroup((key) => key === "b3"),
        pungGroup((key) => key === "c3"),
        pungGroup((key) => key === "o3"),
      ]),
  },
  {
    id: "seven-brothers",
    name: "Seven Brothers",
    companionPages: [29],
    illustratedPages: [55],
    category: "honour",
    tier: "limit",
    exposedTier: "half",
    requiresSelfDrawn: false,
    description:
      "One of each wind with one wind paired, plus a pung/kong of 7s in each " +
      "suit.",
    source: "Synopsis p. 57.",
    notes:
      "The synopsis prints 1000/400; exposed half is assumed from the Windy " +
      "Ones pattern.",
    match: ({ shape }) =>
      matchesGroups(shape, [
        exactGroup(WIND_KEYS),
        singleGroup(isWind),
        pungGroup((key) => key === "b7"),
        pungGroup((key) => key === "c7"),
        pungGroup((key) => key === "o7"),
      ]),
  },
  {
    id: "up-you-go",
    companionUnillustrated: true,
    name: "Up You Go",
    companionPages: [57],
    illustratedPages: [],
    category: "plain",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "One of each wind plus 2, 44, 666 and 8888 in one suit; the kong is " +
      "concealed.",
    source: "Synopsis p. 57 (not illustrated).",
    notes:
      "The synopsis prints 2000/800. 'Kong concealed' applies to the 8888 " +
      "kong: an exposed kong of that tile is rejected, while other exposed " +
      "melds are allowed.",
    match: ({ shape, hand }) => {
      if (shape.honoursTotal !== 4 || usedSuits(shape).length !== 1) {
        return false;
      }
      if (!WIND_KEYS.every((key) => shape.counts[key] === 1)) return false;
      return SUITS.some((suit) => {
        const kongKey = suitTileKey(suit, 8);
        if (
          hand.melds.some(
            (meld) =>
              meld.exposed &&
              meld.kind === "kong" &&
              tileKey(meld.tiles[0]!) === kongKey,
          )
        ) {
          return false;
        }
        const counts = shape.suits[suit];
        return (
          counts[2] === 1 &&
          counts[4] === 2 &&
          counts[6] === 3 &&
          counts[8] === 4 &&
          counts[1] === 0 &&
          counts[3] === 0 &&
          counts[5] === 0 &&
          counts[7] === 0 &&
          counts[9] === 0
        );
      });
    },
  },
  {
    id: "down-you-go",
    companionUnillustrated: true,
    name: "Down You Go",
    companionPages: [57],
    illustratedPages: [],
    category: "plain",
    tier: "double",
    exposedTier: "double",
    requiresSelfDrawn: false,
    description:
      "One of each wind plus 2222, 444, 66 and 8 in one suit; the kong is " +
      "concealed.",
    source: "Synopsis p. 57 (not illustrated).",
    notes:
      "The synopsis prints 2000/800. 'Kong concealed' applies to the 8888 " +
      "kong: an exposed kong of that tile is rejected, while other exposed " +
      "melds are allowed.",
    match: ({ shape, hand }) => {
      if (shape.honoursTotal !== 4 || usedSuits(shape).length !== 1) {
        return false;
      }
      if (!WIND_KEYS.every((key) => shape.counts[key] === 1)) return false;
      return SUITS.some((suit) => {
        const kongKey = suitTileKey(suit, 2);
        if (
          hand.melds.some(
            (meld) =>
              meld.exposed &&
              meld.kind === "kong" &&
              tileKey(meld.tiles[0]!) === kongKey,
          )
        ) {
          return false;
        }
        const counts = shape.suits[suit];
        return (
          counts[2] === 4 &&
          counts[4] === 3 &&
          counts[6] === 2 &&
          counts[8] === 1 &&
          counts[1] === 0 &&
          counts[3] === 0 &&
          counts[5] === 0 &&
          counts[7] === 0 &&
          counts[9] === 0
        );
      });
    },
  },
  {
    id: "numbers-in-parallel",
    name: "Numbers in Parallel",
    companionPages: [43],
    illustratedPages: [],
    category: "plain",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "A pung/kong and pair of winds or dragons, plus a pung/kong of the same " +
      "number (2-8) in each suit.",
    source: "Synopsis p. 59.",
    match: ({ shape }) => {
      for (const rank of [2, 3, 4, 5, 6, 7, 8]) {
        const pungs = [
          pungGroup((key) => key === `b${rank}`),
          pungGroup((key) => key === `c${rank}`),
          pungGroup((key) => key === `o${rank}`),
        ];
        if (
          matchesGroups(shape, [
            ...pungs,
            pungGroup(isWind),
            pairGroup(isWind),
          ]) ||
          matchesGroups(shape, [
            ...pungs,
            pungGroup(isDragon),
            pairGroup(isDragon),
          ])
        ) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "numbers-doubled",
    name: "Numbers Doubled",
    companionPages: [43],
    illustratedPages: [],
    category: "plain",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "A pair of winds or dragons, plus two pungs/kongs of each of two " +
      "numbers (2-8) in each of two suits.",
    source: "Synopsis p. 59.",
    notes:
      "The p. 43 diagram shows four pungs (two numbers doubled across two " +
      "suits) plus the honour pair: 12 + 2.",
    match: ({ shape }) => {
      for (const first of SUITS) {
        for (const second of SUITS) {
          if (first === second) continue;
          for (let low = 2; low <= 7; low++) {
            for (let high = low + 1; high <= 8; high++) {
              const groups = [
                pungGroup((key) => key === suitTileKey(first, low)),
                pungGroup((key) => key === suitTileKey(first, high)),
                pungGroup((key) => key === suitTileKey(second, low)),
                pungGroup((key) => key === suitTileKey(second, high)),
              ];
              if (
                matchesGroups(shape, [...groups, pairGroup(isWind)]) ||
                matchesGroups(shape, [...groups, pairGroup(isDragon)])
              ) {
                return true;
              }
            }
          }
        }
      }
      return false;
    },
  },
  {
    id: "chinese-odds",
    name: "Chinese Odds",
    companionPages: [49],
    illustratedPages: [40],
    category: "suit",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "Four pungs/kongs of odd numbers plus an odd pair, all in one suit.",
    source: "Synopsis p. 59.",
    match: ({ shape }) =>
      usedSuits(shape).length === 1 &&
      SUITS.some((suit) =>
        matchesStandard(
          shape,
          (key) => isSuitedKey(key) && ODD_RANKS.includes(Number(key[1])),
          [
            pungSuit(suit, ODD_RANKS),
            pungSuit(suit, ODD_RANKS),
            pungSuit(suit, ODD_RANKS),
            pungSuit(suit, ODD_RANKS),
          ],
        ),
      ),
  },
  {
    id: "dragons-run",
    companionUnillustrated: true,
    name: "Dragon's Run",
    companionPages: [59],
    illustratedPages: [],
    category: "run",
    tier: "middle",
    exposedTier: "middle",
    requiresSelfDrawn: false,
    description:
      "Run 1-9 in one suit, one of each dragon, and a wind pair.",
    source: "Synopsis p. 59 (N/I).",
    notes:
      "Distinct printed scoring hand: 1500/600, unlike Wriggly Dragon's " +
      "1000/400. The run is one suit, the three dragons are single tiles, " +
      "and the pair is winds.",
    match: ({ shape }) =>
      SUITS.some((suit) =>
        matchesGroups(shape, [
          runGroup(suit, 1, 9),
          exactGroup(DRAGON_KEYS),
          pairGroup(isWind),
        ]),
      ),
  },
  {
    id: "buried-treasure",
    name: "Buried Treasure (Concealed Mah Jong)",
    companionPages: [],
    illustratedPages: [38],
    category: "plain",
    tier: "calculate",
    exposedTier: null,
    requiresSelfDrawn: true,
    description:
      "Any one suit, as many chows or pungs as desired, winds/dragons may be included, plus a pair; every tile from the wall including the last; no kongs.",
    source: "Illustrated hand 11, p. 38.",
    illustratedOnly: true,
    match: ({ hand, shape }) =>
      hand.selfDrawn &&
      shape.total === 14 &&
      shape.kongCount === 0 &&
      usedSuits(shape).length === 1 &&
      shape.suitedTotal > 0 &&
      decomposeStandard(shape).some((decomposition) =>
        decomposition.sets.every((set) => set.kind !== "kong"),
      ),
  },
  {
    id: "all-kong",
    name: "All Kong",
    companionPages: [],
    illustratedPages: [30],
    category: "plain",
    tier: "limit",
    exposedTier: "limit",
    requiresSelfDrawn: false,
    description:
      "Four kongs and a pair, all in one suit; winds, dragons or both may be included.",
    source: "Illustrated special-hand list, p. 30.",
    illustratedOnly: true,
    match: ({ shape }) =>
      usedSuits(shape).length <= 1 &&
      decomposeStandard(shape).some(
        (decomposition) =>
          decomposition.sets.length === 4 &&
          decomposition.sets.every((set) => set.kind === "kong"),
      ),
  },
  {
    id: "mixed-pung",
    name: "Mixed Pung",
    companionPages: [],
    illustratedPages: [30],
    category: "plain",
    tier: "limit",
    exposedTier: null,
    requiresSelfDrawn: true,
    description:
      "Four pungs and a pair in any of the three suits; winds, dragons or both may be included; every tile including the last from the wall.",
    source: "Illustrated special-hand list, p. 30.",
    illustratedOnly: true,
    match: ({ hand, shape }) =>
      hand.selfDrawn &&
      shape.kongCount === 0 &&
      decomposeStandard(shape).some(
        (decomposition) =>
          decomposition.sets.length === 4 &&
          decomposition.sets.every((set) => set.kind === "pung"),
      ),
  },

  {
    id: "chinese-ordinary",
    name: "Chinese Ordinary Hand",
    companionPages: [],
    illustratedPages: [28, 62],
    category: "plain",
    tier: "calculate",
    exposedTier: "calculate",
    requiresSelfDrawn: false,
    description:
      "Four sets of pungs, kongs or chows in any suits, plus a pair; any number of chows is allowed.",
    source: "Illustrated Chinese game, p. 28; summary p. 62.",
    match: ({ hand, shape }) =>
      hand.variant === "chinese" &&
      shape.total === 14 + shape.kongCount &&
      decomposeStandard(shape).length > 0,
  },

]);

/**
 * The hands only the Illustrated book prints: the Companion's catalogue does
 * not have them.
 */
export const ILLUSTRATED_ONLY_HANDS: readonly string[] = Object.freeze(
  PATTERNS.filter((pattern) => pattern.illustratedOnly === true).map((pattern) => pattern.id),
);

/** The hands the Companion prints without a sample picture (its "N/I" hands). */
export const COMPANION_UNILLUSTRATED_HANDS: readonly string[] = Object.freeze(
  PATTERNS.filter((pattern) => pattern.companionUnillustrated === true).map((pattern) => pattern.id),
);

/**
 * The hand sets a table can play, widest first, as the hands each one leaves
 * out. Each set is the one before it with more left out:
 *   all                 every hand either book prints
 *   companion           the Companion's catalogue: no Illustrated-only hand
 *   companion-pictured  the Companion's hands that have a sample picture
 */
export const HAND_SETS = ["all", "companion", "companion-pictured"] as const;
export type HandSet = (typeof HAND_SETS)[number];

export const HAND_SET_EXCLUDED: Readonly<Record<HandSet, readonly string[]>> = Object.freeze({
  all: Object.freeze([] as string[]),
  companion: ILLUSTRATED_ONLY_HANDS,
  "companion-pictured": Object.freeze([...ILLUSTRATED_ONLY_HANDS, ...COMPANION_UNILLUSTRATED_HANDS]),
});
