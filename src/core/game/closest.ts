/**
 * The "closest hands" helper: which catalogue hands one seat is nearest to.
 *
 * Two sources, one answer per catalogue pattern: its closest version - fewest
 * tiles still missing, then the best chance of collecting them times what the
 * hand pays - leaving out versions the seat can no longer finish because the
 * copies it needs are already in sight (discarded or exposed).
 *
 *   - A hand declared as groups (`HandPattern.groups`: most chow, dragon and
 *     one-suit hands) is searched exactly: reach.ts finds the partition of
 *     the seat's tiles nearest to it, however many versions the hand has.
 *     A sample of its versions would overstate the distance whenever the
 *     seat's own version is not in the sample.
 *   - The other hands come from the plan the bots use (bot/plan.ts): the
 *     generated table of special hands, and every ordinary or pair hand
 *     assembled around the seat's own tiles and priced by the real scorer.
 *
 * Only the seat's own `GameView` goes in, so nothing here can reveal another
 * player's concealed tiles. Pure and deterministic.
 */

import { BOOK_TITLE, samplesFor, type SampleTile } from "../patterns/samples.ts";
import { nearest, reachCache, type ReachCache } from "../patterns/reach.ts";
import { PATTERNS } from "../patterns/table.ts";
import { EDITORIAL_ROWS, EXAMPLES, SYNOPSIS } from "../patterns/reference.ts";
import { TIER_POINTS, type HandPattern, type PageRefs, type Tier } from "../patterns/types.ts";
import { situationFor } from "./bot.ts";
import { completion, KEYS, MAX_MISSING, oddsFor, planGoals, type Goal, type Situation } from "./bot/plan.ts";
import type { GameView } from "./view.ts";

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

export interface ClosestHand {
  readonly pattern: string;
  readonly name: string;
  /** The tier the hand would score at with the seat's current melds. */
  readonly tier: Tier;
  /** The printed value, or null for a hand whose score is calculated. */
  readonly points: number | null;
  /** Book pages the hand is printed on, by book. */
  readonly pages: PageRefs;
  /**
   * True when the hand exists only concealed: any exposed meld (a called
   * pung, kong or chow) rules it out. Most special hands are like this.
   */
  readonly concealedOnly: boolean;
  /** Tiles still to collect; 0 means the hand in front of you is complete. */
  readonly away: number;
  /** The missing tiles, one key per copy, in canonical order. */
  readonly need: readonly string[];
  /** Rough chance of completing it from here (0..1). */
  readonly chance: number;
}

/** Hands shown by default: enough to compare, few enough for a phone. */
export const CLOSEST_SHOWN = 3;

/** Versions of one hand kept when several are equally near: the likeliest is shown. */
const VERSIONS_KEPT = 64;

/**
 * The nearest version of a group-declared hand to the seat's tiles, within
 * `budget` missing tiles, or null.
 */
function exactVersion(
  pattern: HandPattern,
  tier: Tier,
  situation: Situation,
  odds: ReturnType<typeof oddsFor>,
  budget: number,
  cache: ReachCache,
): { hand: ClosestHand; rank: number } | null {
  const reach = nearest({
    alternatives: pattern.groups!(`w${situation.seatWind}`),
    held: situation.hand,
    spare: situation.unseen,
    melds: situation.melds.map((meld) => meld.tiles),
    budget,
    keep: VERSIONS_KEPT,
    cache,
  });
  if (reach === null) return null;
  const value = TIER_POINTS[tier] ?? 0;
  let chosen: { goal: Goal; chance: number } | null = null;
  for (const wants of reach.wants) {
    const keys: number[] = [];
    wants.forEach((count, index) => {
      if (count > 0) keys.push(index);
    });
    const goal: Goal = { need: wants, keys, value, selfDrawnOnly: pattern.requiresSelfDrawn, pattern: pattern.id };
    const chance = completion(goal, situation.hand, odds);
    if (chosen === null || chance > chosen.chance) chosen = { goal, chance };
  }
  const { goal, chance } = chosen!;
  const need: string[] = [];
  for (const key of goal.keys) {
    for (let copy = goal.need[key]! - situation.hand[key]!; copy > 0; copy--) need.push(KEYS[key]!);
  }
  return {
    rank: chance * value,
    hand: {
      pattern: pattern.id,
      name: pattern.name,
      tier,
      points: TIER_POINTS[tier],
      pages: pattern.pages,
      concealedOnly: pattern.exposedTier === null,
      away: reach.missing,
      need,
      chance: Math.round(chance * 1000) / 1000,
    },
  };
}

/** Hands a player can pin so they stay in the panel: the panel shows `CLOSEST_SHOWN` in all. */
export const MAX_PINS = CLOSEST_SHOWN;

/** One entry of the search: the hand and how likely, times how much, it is to be completed. */
interface Found {
  readonly hand: ClosestHand;
  readonly rank: number;
}

/**
 * Every catalogue hand the seat can still reach, nearest first. The search
 * widens a tile at a time and stops once `limit` hands outside `pinned` are
 * within reach; a pinned hand is always searched for, however far it is.
 */
function search(view: GameView, limit: number, pinned: ReadonlySet<string>): { found: Found[]; excluded: readonly string[] } {
  // The player's own planner, without any bot's taste for special hands.
  const situation = { ...situationFor(view, view.seat), ambition: 1 };
  const odds = oddsFor(situation);
  const concealed = situation.melds.every((meld) => !meld.exposed);

  // Hands with a fixed value that are declared as groups: searched exactly below.
  const exact: { pattern: HandPattern; tier: Tier }[] = [];
  for (const pattern of PATTERNS) {
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (situation.excluded?.includes(pattern.id) === true) continue; // a house rule: never hinted
    if (pattern.groups !== undefined && tier !== null && tier !== "calculate") exact.push({ pattern, tier });
  }
  const exactIds = new Set(exact.map((entry) => entry.pattern.id));

  const best = new Map<string, Found>();
  for (const goal of planGoals(situation)) {
    if (exactIds.has(goal.pattern)) continue;
    const pattern = PATTERN_BY_ID.get(goal.pattern);
    if (pattern === undefined) continue;
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier === null) continue;

    const need: string[] = [];
    let live = true;
    for (const key of goal.keys) {
      const want = goal.need[key]! - situation.hand[key]!;
      if (want <= 0) continue;
      if (situation.unseen[key]! < want) live = false;
      for (let copy = 0; copy < want; copy++) need.push(KEYS[key]!);
    }
    if (!live) continue;

    const chance = completion(goal, situation.hand, odds);
    const rank = chance * goal.value;
    const previous = best.get(goal.pattern);
    if (
      previous !== undefined &&
      (previous.hand.away < need.length || (previous.hand.away === need.length && previous.rank >= rank))
    ) {
      continue;
    }
    best.set(goal.pattern, {
      rank,
      hand: {
        pattern: pattern.id,
        name: pattern.name,
        tier,
        points: TIER_POINTS[tier],
        pages: pattern.pages,
        concealedOnly: pattern.exposedTier === null,
        away: need.length,
        need,
        chance: Math.round(chance * 1000) / 1000,
      },
    });
  }

  // Nearest first, widening the search a tile at a time, and stopping once
  // enough hands are within reach: a hand not found by then is further than
  // all of them and cannot be among those shown.
  let pending = exact;
  const cache = reachCache();
  const within = (tiles: number): number =>
    [...best.values()].filter((entry) => entry.hand.away <= tiles && !pinned.has(entry.hand.pattern)).length;
  const wanted = (budget: number): boolean => within(budget - 1) < limit || pending.some((entry) => pinned.has(entry.pattern.id));
  for (let budget = 0; budget <= MAX_MISSING && pending.length > 0 && wanted(budget); budget++) {
    pending = pending.filter(({ pattern, tier }) => {
      const found = exactVersion(pattern, tier, situation, odds, budget, cache);
      if (found === null) return true;
      best.set(pattern.id, found);
      return false;
    });
  }

  const found = [...best.values()].sort(
    (a, b) => a.hand.away - b.hand.away || b.rank - a.rank || a.hand.pattern.localeCompare(b.hand.pattern),
  );
  return { found, excluded: situation.excluded ?? [] };
}

export function closestHands(view: GameView, limit = CLOSEST_SHOWN): ClosestHand[] {
  return search(view, limit, new Set())
    .found.slice(0, limit)
    .map((entry) => entry.hand);
}

/** A hand the player pinned, with how near their tiles are to it; `hand` is null when it is out of reach. */
export interface PinnedHand {
  readonly pattern: string;
  readonly name: string;
  /**
   * Null when the hand cannot be finished from here: too far, the copies it
   * needs are in sight, or an exposed meld rules out a concealed-only hand.
   */
  readonly hand: ClosestHand | null;
}

/**
 * The panel's contents: the player's pinned hands first, in the order they
 * were pinned, then the nearest other hands (at most `limit`, never one that
 * is pinned). Pins naming no hand, or a hand this table plays without, are
 * left out; so are repeats and every pin beyond `MAX_PINS`.
 */
export function closestWithPins(
  view: GameView,
  pins: readonly string[],
  limit = CLOSEST_SHOWN,
): { hands: ClosestHand[]; pinned: PinnedHand[] } {
  const ids = [...new Set(pins)].slice(0, MAX_PINS);
  const chosen = new Set(ids);
  const { found, excluded } = search(view, limit, chosen);
  const byId = new Map(found.map((entry) => [entry.hand.pattern, entry.hand]));
  const pinned: PinnedHand[] = [];
  for (const id of ids) {
    const pattern = PATTERN_BY_ID.get(id);
    if (pattern === undefined || excluded.includes(id)) continue;
    pinned.push({ pattern: id, name: pattern.name, hand: byId.get(id) ?? null });
  }
  const hands = found
    .filter((entry) => !chosen.has(entry.hand.pattern))
    .slice(0, limit)
    .map((entry) => entry.hand);
  return { hands, pinned };
}

/** Everything the table can tell a player about one catalogue hand. */
export interface HandDetail {
  readonly pattern: string;
  readonly name: string;
  /** Book pages the hand is printed on, by book (the same references as the hand's sheet). */
  readonly pages: PageRefs;
  /** The book headings the hand is filed under (`HandGroup.id`), in book order. */
  readonly groups: readonly string[];
  /** One complete example, as tile keys in reading order. */
  readonly example: readonly string[];
  /** What the hand is made of, in plain words. */
  readonly description: string;
  /** Concealed-only: no exposed meld is allowed at any point. */
  readonly concealedOnly: boolean;
  /** Every tile must come from the wall, the winning tile included. */
  readonly requiresSelfDrawn: boolean;
  readonly concealedTier: Tier;
  readonly concealedPoints: number | null;
  /** Null when the hand does not exist with exposed melds. */
  readonly exposedTier: Tier | null;
  readonly exposedPoints: number | null;
  /** The sample hand each book pictures, primary book first; empty if neither does. */
  readonly samples: readonly HandSample[];
}

/**
 * One printed picture of a hand: the tiles as the page groups them. A picture
 * both books print identically is one entry with both sources.
 */
export interface HandSample {
  /** Where it is printed: a book's title and page, primary book first. */
  readonly sources: readonly { readonly book: string; readonly page: number }[];
  /** Printed sub-heading when the book pictures several versions. */
  readonly label: string | null;
  /** A tile key, or `{ any }` for a card the book prints in place of a tile. */
  readonly groups: readonly (readonly SampleTile[])[];
  readonly notes: readonly string[];
}

function mergedSamples(id: string): HandSample[] {
  const merged: { -readonly [K in keyof HandSample]: HandSample[K] }[] = [];
  for (const sample of samplesFor(id)) {
    const source = { book: BOOK_TITLE[sample.book], page: sample.page };
    const twin = merged.find((entry) => JSON.stringify(entry.groups) === JSON.stringify(sample.groups));
    if (twin === undefined) {
      merged.push({
        sources: [source],
        label: sample.label ?? null,
        groups: sample.groups,
        notes: sample.note === undefined ? [] : [sample.note],
      });
      continue;
    }
    twin.sources = [...twin.sources, source];
    if (sample.note !== undefined && !twin.notes.includes(sample.note)) twin.notes = [...twin.notes, sample.note];
  }
  return merged;
}

/** A heading of the Companion's synopsis, or "Other" for hands it does not file. */
export interface HandGroup {
  readonly id: string;
  readonly name: string;
  /** The hands under the heading, in the book's order. */
  readonly hands: readonly string[];
}

const OTHER_GROUP = "other";

/** The book's headings with their hands; a last "Other" holds hands no heading lists. */
function buildGroups(): HandGroup[] {
  const groups: HandGroup[] = SYNOPSIS.map((heading) => ({
    id: heading.id,
    name: heading.name,
    hands: [...new Set([...heading.rows.map(([, id]) => id), ...(EDITORIAL_ROWS[heading.id] ?? [])])],
  }));
  const filed = new Set(groups.flatMap((group) => group.hands));
  const rest = PATTERNS.filter((pattern) => !filed.has(pattern.id)).map((pattern) => pattern.id);
  if (rest.length > 0) groups.push({ id: OTHER_GROUP, name: "Other", hands: rest });
  return groups;
}

const GROUPS: readonly HandGroup[] = buildGroups();

function detailOf(pattern: HandPattern): HandDetail {
  return {
    pattern: pattern.id,
    name: pattern.name,
    pages: pattern.pages,
    groups: GROUPS.filter((group) => group.hands.includes(pattern.id)).map((group) => group.id),
    example: (EXAMPLES[pattern.id] ?? "").split(" ").filter((key) => key.length > 0),
    description: pattern.description,
    concealedOnly: pattern.exposedTier === null,
    requiresSelfDrawn: pattern.requiresSelfDrawn,
    concealedTier: pattern.tier,
    concealedPoints: TIER_POINTS[pattern.tier],
    exposedTier: pattern.exposedTier,
    exposedPoints: pattern.exposedTier === null ? null : TIER_POINTS[pattern.exposedTier],
    samples: mergedSamples(pattern.id),
  };
}

/** One hand by id, for the "explore this hand" view; null for an unknown id. */
export function handDetail(id: string): HandDetail | null {
  const pattern = PATTERN_BY_ID.get(id);
  return pattern === undefined ? null : detailOf(pattern);
}

/**
 * The catalogue for the hand index: every hand in play, and the book's
 * headings to filter by. `excluded` names the hands the table plays without
 * (a house rule); they and their place under a heading are left out.
 */
export function handIndex(
  excluded: readonly string[] = [],
): { readonly groups: readonly HandGroup[]; readonly hands: readonly HandDetail[] } {
  if (excluded.length === 0) return { groups: GROUPS, hands: PATTERNS.map(detailOf) };
  return {
    groups: GROUPS.map((group) => ({ ...group, hands: group.hands.filter((id) => !excluded.includes(id)) })).filter(
      (group) => group.hands.length > 0,
    ),
    hands: PATTERNS.filter((pattern) => !excluded.includes(pattern.id)).map(detailOf),
  };
}
