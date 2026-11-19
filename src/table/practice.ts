/**
 * Practice: questions that train the eye for the catalogue's hands, away from
 * a game.
 *
 *   name  fourteen tiles, loose: which hand do they make? One of four names.
 *   wait  the same hand less one tile: which tile completes it? One of four.
 *
 * Every question is built from a hand's complete example (`handIndex`) and
 * graded by the engine itself (`checkHand`), never by a list kept here, so
 * an answer is right exactly when the rules say so. A hand is asked only if
 * its example checks as that hand under the table's hand set; the choices
 * that are not the answer are checked not to be one. The same seed gives the
 * same question.
 */

import { checkHand, type CheckWin } from "../core/check.ts";
import { handIndex, type HandDetail } from "../core/game/closest.ts";
import type { PatternMatch } from "../core/match.ts";
import { PATTERNS } from "../core/patterns/table.ts";
import { createRng, type Rng } from "../core/rng.ts";
import { parseTile, tileKey } from "../core/tiles.ts";

export const PRACTICE_KINDS = ["name", "wait"] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

export function isPracticeKind(value: unknown): value is PracticeKind {
  return (PRACTICE_KINDS as readonly unknown[]).includes(value);
}

export interface PracticeHand {
  readonly id: string;
  readonly name: string;
  readonly tier: PatternMatch["tier"];
  readonly points: number | null;
}

export interface PracticeQuestion {
  readonly kind: PracticeKind;
  /** The tiles shown, as dealt from the example (the app sorts them). */
  readonly tiles: readonly string[];
  /** Four choices: hand ids for `name`, tile keys for `wait`. */
  readonly options: readonly { readonly id: string; readonly label: string }[];
  /** The choices that are right; exactly one of the four. */
  readonly correct: readonly string[];
  /** The hand the fourteen tiles make. */
  readonly hand: PracticeHand;
  /** Other hands the same fourteen tiles also make. */
  readonly also: readonly PracticeHand[];
  /**
   * `wait`: every tile that would complete the thirteen, the hand it makes,
   * and whether it wins only when drawn from the wall.
   */
  readonly wins: readonly { readonly tile: string; readonly hand: PracticeHand; readonly selfDrawnOnly: boolean }[];
}

/** A scoring variant counts as the hand (card) it belongs to. */
const CARD_OF = new Map(PATTERNS.map((pattern) => [pattern.id, pattern.variantOf ?? pattern.id]));
const cardOf = (match: PatternMatch): string => CARD_OF.get(match.pattern.id) ?? match.pattern.id;

function handOf(match: PatternMatch, names: ReadonlyMap<string, string>): PracticeHand {
  const id = cardOf(match);
  return { id, name: names.get(id) ?? match.pattern.name, tier: match.tier, points: match.points };
}

/** The distinct hands of a list of matches, best first. */
function handsOf(matches: readonly PatternMatch[], names: ReadonlyMap<string, string>): PracticeHand[] {
  const seen = new Set<string>();
  const hands: PracticeHand[] = [];
  for (const match of matches) {
    const hand = handOf(match, names);
    if (seen.has(hand.id)) continue;
    seen.add(hand.id);
    hands.push(hand);
  }
  return hands;
}

interface Entry {
  readonly detail: HandDetail;
  readonly win: CheckWin;
}

const pools = new Map<string, { readonly entries: readonly Entry[]; readonly hands: readonly HandDetail[] }>();

/** The hands whose example checks as that hand under the table's hand set; built once per set. */
export function practicePool(excluded: readonly string[] = []): readonly Entry[] {
  return poolFor(excluded).entries;
}

function poolFor(excluded: readonly string[]) {
  const key = [...excluded].sort().join(",");
  const cached = pools.get(key);
  if (cached !== undefined) return cached;
  const { hands } = handIndex(excluded);
  const entries: Entry[] = [];
  for (const detail of hands) {
    if (detail.example.length !== 14) continue;
    const result = checkHand(detail.example, excluded);
    if (result.size !== 14 || !result.matches.some((match) => cardOf(match) === detail.pattern)) continue;
    entries.push({ detail, win: result });
  }
  const pool = { entries, hands };
  pools.set(key, pool);
  return pool;
}

/** A question of `kind`, the same for the same seed and hand set. */
export function practiceQuestion(seed: string, kind: PracticeKind, excluded: readonly string[] = []): PracticeQuestion {
  const { entries, hands } = poolFor(excluded);
  const names = new Map(hands.map((hand) => [hand.pattern, hand.name]));
  const rng = createRng(`practice/${kind}/${seed}`);
  const entry = entries[rng.int(entries.length)]!;
  const found = handsOf(entry.win.matches, names);
  const hand = found.find((item) => item.id === entry.detail.pattern)!;
  const also = found.filter((item) => item.id !== hand.id);
  return kind === "name"
    ? nameQuestion(entry, hand, also, found, hands, rng)
    : waitQuestion(entry, hand, also, excluded, names, rng);
}

function nameQuestion(
  entry: Entry,
  hand: PracticeHand,
  also: readonly PracticeHand[],
  found: readonly PracticeHand[],
  hands: readonly HandDetail[],
  rng: Rng,
): PracticeQuestion {
  const made = new Set(found.map((item) => item.id));
  const others = hands.filter((detail) => !made.has(detail.pattern));
  // Hands filed under one of the same book headings first: close enough to make you look.
  const near = rng.shuffle(others.filter((detail) => detail.groups.some((group) => entry.detail.groups.includes(group))));
  const far = rng.shuffle(others.filter((detail) => !near.includes(detail)));
  const decoys = [...near.slice(0, 2), ...far].slice(0, 3);
  const options = rng.shuffle([
    { id: hand.id, label: hand.name },
    ...decoys.map((detail) => ({ id: detail.pattern, label: detail.name })),
  ]);
  return { kind: "name", tiles: entry.detail.example, options, correct: [hand.id], hand, also, wins: [] };
}

const ALL_KEYS = [
  ..."bco".split("").flatMap((suit) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
];

function waitQuestion(
  entry: Entry,
  hand: PracticeHand,
  also: readonly PracticeHand[],
  excluded: readonly string[],
  names: ReadonlyMap<string, string>,
  rng: Rng,
): PracticeQuestion {
  const example = entry.detail.example.map((key) => tileKey(parseTile(key)));
  const at = rng.int(example.length);
  const removed = example[at]!;
  const tiles = example.filter((_, index) => index !== at);
  const result = checkHand(tiles, excluded);
  const waits = result.size === 13 ? result.waits.filter((wait) => wait.matches.length > 0) : [];
  const wins = waits.map((wait) => ({
    tile: tileKey(wait.tile),
    hand: handOf(wait.matches[0]!, names),
    selfDrawnOnly: wait.selfDrawnOnly,
  }));
  const winning = new Set(wins.map((win) => win.tile));
  const held = (key: string) => tiles.filter((tile) => tile === key).length;
  const usable = (key: string) => !winning.has(key) && held(key) < 4;
  // Decoys a rank or two from the tiles held, in their suits, or honours already in the hand.
  const near = new Set<string>();
  for (const key of tiles) {
    if ("bco".includes(key[0]!)) {
      const rank = Number(key[1]);
      for (const step of [-2, -1, 1, 2]) if (rank + step >= 1 && rank + step <= 9) near.add(`${key[0]}${rank + step}`);
    } else near.add(key);
  }
  const close = rng.shuffle([...near].filter(usable));
  const rest = rng.shuffle(ALL_KEYS.filter((key) => usable(key) && !near.has(key)));
  const decoys = [...close, ...rest].slice(0, 3);
  const options = rng.shuffle([removed, ...decoys]).map((key) => ({ id: key, label: key }));
  return { kind: "wait", tiles, options, correct: [removed], hand, also, wins };
}
