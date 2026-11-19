/**
 * Practice: questions that train the eye for the catalogue's hands, away from
 * a game.
 *
 *   name  fourteen tiles, loose: which hand do they make? One of four names.
 *   wait  the same hand less one tile: which tile completes it? One of four.
 *   aim   thirteen tiles as dealt: which hand should you aim for? One of four.
 *
 * `name` and `wait` are built from a hand's complete example (`handIndex`),
 * often with its suits swapped so the picture cannot be learnt by heart, and
 * graded by the engine itself (`checkHand`), never by a list kept here: an
 * answer is right exactly when the rules say so. A hand is asked only if its
 * tiles check as that hand under the table's hand set; the choices that are
 * not the answer are checked not to be one. `aim` deals a real hand and asks
 * the hint panel's own ranking (`closestHands`): the answer is its first
 * hand, and every other choice is rated at most half as likely. The same
 * seed gives the same question.
 */

import { arrangeConcealed } from "../core/arrange.ts";
import { checkHand, type CheckWin } from "../core/check.ts";
import { closestHands, handIndex, type HandDetail } from "../core/game/closest.ts";
import { newGame } from "../core/game/deal.ts";
import { viewFor } from "../core/game/view.ts";
import { createHand } from "../core/hand.ts";
import type { PatternMatch } from "../core/match.ts";
import { PATTERNS } from "../core/patterns/table.ts";
import { createRng, type Rng } from "../core/rng.ts";
import { parseTile, tileKey, type PlayTile } from "../core/tiles.ts";

export const PRACTICE_KINDS = ["name", "wait", "aim"] as const;
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

/** `aim`: how a choice stands for the hand dealt. `away` is null when the hand is out of reach. */
export interface PracticeAim {
  readonly id: string;
  readonly name: string;
  readonly away: number | null;
  readonly need: readonly string[];
  readonly chance: number;
}

export interface PracticeQuestion {
  readonly kind: PracticeKind;
  /** The tiles shown (the app sorts them). */
  readonly tiles: readonly string[];
  /** Four choices: hand ids for `name` and `aim`, tile keys for `wait`. */
  readonly options: readonly { readonly id: string; readonly label: string }[];
  /** The choices that are right; exactly one of the four. */
  readonly correct: readonly string[];
  /** The hand the fourteen tiles make; for `aim`, the hand to aim for. */
  readonly hand: PracticeHand;
  /** The fourteen tiles grouped as the hand reads (sets, then the pair); null when it is no partition into groups. */
  readonly groups: readonly (readonly string[])[] | null;
  /** Other hands the same fourteen tiles also make. */
  readonly also: readonly PracticeHand[];
  /**
   * `wait`: every tile that would complete the thirteen, the hand it makes,
   * and whether it wins only when drawn from the wall.
   */
  readonly wins: readonly { readonly tile: string; readonly hand: PracticeHand; readonly selfDrawnOnly: boolean }[];
  /** `aim`: each choice, as the hint panel rates it for these tiles. */
  readonly aims: readonly PracticeAim[];
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

/** The suits in another order: "bco" leaves them as they are. */
const SUIT_ORDERS = ["bco", "boc", "cbo", "cob", "obc", "ocb"];

export function swapSuits(tiles: readonly string[], order: string): string[] {
  return tiles.map((key) => {
    const at = "bco".indexOf(key[0]!);
    return at < 0 ? key : `${order[at]}${key.slice(1)}`;
  });
}

/**
 * The hand's tiles for this question: its example with the suits swapped when
 * the swapped tiles still check as the hand (a one-suit hand such as Red
 * Lantern keeps its bamboo), else the example as printed.
 */
function tilesFor(entry: Entry, excluded: readonly string[], rng: Rng): { tiles: string[]; win: CheckWin } {
  const example = entry.detail.example.map((key) => tileKey(parseTile(key)));
  const order = SUIT_ORDERS[rng.int(SUIT_ORDERS.length)]!;
  if (order !== "bco") {
    const tiles = swapSuits(example, order);
    const result = checkHand(tiles, excluded);
    if (result.size === 14 && result.matches.some((match) => cardOf(match) === entry.detail.pattern)) {
      return { tiles, win: result };
    }
  }
  return { tiles: example, win: entry.win };
}

/** The fourteen grouped as the hand's match reads them. */
function groupsOf(tiles: readonly string[], match: PatternMatch): string[][] | null {
  const hand = createHand({ concealed: tiles.map((key) => parseTile(key) as PlayTile) });
  return arrangeConcealed(hand, match.pattern);
}

/**
 * A question of `kind`, the same for the same seed and hand set. `focus`
 * names hands the player has missed: about half the time the hand asked is
 * one of them.
 */
export function practiceQuestion(
  seed: string,
  kind: PracticeKind,
  excluded: readonly string[] = [],
  focus: readonly string[] = [],
): PracticeQuestion {
  const { entries, hands } = poolFor(excluded);
  const names = new Map(hands.map((hand) => [hand.pattern, hand.name]));
  const rng = createRng(`practice/${kind}/${seed}`);
  if (kind === "aim") return aimQuestion(seed, excluded, hands, rng);
  const missed = entries.filter((entry) => focus.includes(entry.detail.pattern));
  const from = missed.length > 0 && rng.next() < 0.5 ? missed : entries;
  const entry = from[rng.int(from.length)]!;
  const { tiles, win } = tilesFor(entry, excluded, rng);
  const found = handsOf(win.matches, names);
  const hand = found.find((item) => item.id === entry.detail.pattern)!;
  const also = found.filter((item) => item.id !== hand.id);
  const groups = groupsOf(tiles, win.matches.find((match) => cardOf(match) === hand.id)!);
  const base = { hand, groups, also, wins: [], aims: [] };
  return kind === "name"
    ? { ...base, ...nameChoices(entry, found, hands, rng), kind, tiles }
    : { ...base, ...waitChoices(tiles, excluded, names, rng), kind };
}

function nameChoices(entry: Entry, found: readonly PracticeHand[], hands: readonly HandDetail[], rng: Rng) {
  const hand = found.find((item) => item.id === entry.detail.pattern)!;
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
  return { options, correct: [hand.id] };
}

const ALL_KEYS = [
  ..."bco".split("").flatMap((suit) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
];

function waitChoices(whole: readonly string[], excluded: readonly string[], names: ReadonlyMap<string, string>, rng: Rng) {
  const at = rng.int(whole.length);
  const removed = whole[at]!;
  const tiles = whole.filter((_, index) => index !== at);
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
  return { tiles, options, correct: [removed], wins };
}

/** How many hands the aim drill ranks: the shortlist the panel rates in full, and some. */
const AIM_RANKED = 12;

/**
 * Thirteen tiles from a real deal (a seat that is not East). The hint panel's
 * ranking picks the answer; the other choices are rated at most half as
 * likely, or not ranked at all when the last ranked hand is itself below
 * half. A deal with no clear answer is dealt again.
 */
function aimQuestion(seed: string, excluded: readonly string[], hands: readonly HandDetail[], rng: Rng): PracticeQuestion {
  for (let attempt = 0; ; attempt += 1) {
    const { state } = newGame(`practice-aim/${seed}/${attempt}`, { excludedHands: excluded });
    const seat = state.players.find((player) => player.seat !== state.dealer)!.seat;
    const view = viewFor(state, seat);
    const ranked = closestHands(view, AIM_RANKED);
    const top = ranked[0];
    if (top === undefined || top.chance < 0.02) continue;
    const half = top.chance / 2;
    const weaker = rng.shuffle(ranked.filter((entry) => entry.chance <= half));
    const listed = new Set(ranked.map((entry) => entry.pattern));
    const lastBelow = ranked.length === AIM_RANKED && ranked[ranked.length - 1]!.chance <= half;
    const unranked = lastBelow || ranked.length < AIM_RANKED ? rng.shuffle(hands.filter((detail) => !listed.has(detail.pattern))) : [];
    const decoys = [
      ...weaker.slice(0, 2).map((entry) => entry.pattern),
      ...unranked.slice(0, 3).map((detail) => detail.pattern),
      ...weaker.slice(2).map((entry) => entry.pattern),
    ].slice(0, 3);
    if (decoys.length < 3 && attempt < 20) continue;
    const name = (id: string) => hands.find((detail) => detail.pattern === id)?.name ?? id;
    const aims: PracticeAim[] = [top.pattern, ...decoys].map((id) => {
      const entry = ranked.find((item) => item.pattern === id);
      return entry === undefined
        ? { id, name: name(id), away: null, need: [], chance: 0 }
        : { id, name: entry.name, away: entry.away, need: entry.need, chance: entry.chance };
    });
    return {
      kind: "aim",
      tiles: view.player.hand,
      options: rng.shuffle(aims.map((aim) => ({ id: aim.id, label: aim.name }))),
      correct: [top.pattern],
      hand: { id: top.pattern, name: top.name, tier: top.tier, points: top.points },
      groups: null,
      also: [],
      wins: [],
      aims,
    };
  }
}
