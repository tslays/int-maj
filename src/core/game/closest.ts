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
import { isExcluded } from "../match.ts";
import { situationFor } from "./bot.ts";
import { completion, KEYS, MAX_MISSING, oddsFor, planGoals, type Goal, type Situation } from "./bot/plan.ts";
import type { GameView } from "./view.ts";
import { handChance, tableOf, type ClaimRule, type OddsTarget, type Table } from "./odds.ts";
import { createRng } from "../rng.ts";

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

/**
 * The card a pattern belongs to. A scoring variant (`HandPattern.variantOf`)
 * is another reading of its canonical hand, so it shares that hand's card.
 */
function cardOf(pattern: HandPattern): HandPattern {
  return pattern.variantOf === undefined ? pattern : (PATTERN_BY_ID.get(pattern.variantOf) ?? pattern);
}

/** The id of the card a pattern id belongs to (the id itself when unknown). */
function cardIdOf(id: string): string {
  const pattern = PATTERN_BY_ID.get(id);
  return pattern === undefined ? id : cardOf(pattern).id;
}

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
  /** True when every tile, the winning one included, must come from the wall. */
  readonly requiresSelfDrawn: boolean;
  /** Tiles still to collect; 0 means the hand in front of you is complete. */
  readonly away: number;
  /** The missing tiles, one key per copy, in canonical order. */
  readonly need: readonly string[];
  /**
   * The keys in `need` of which the seat already holds a copy: the hand wants
   * one more, as in a pair or a pung beside a run that uses the held one.
   */
  readonly another: readonly string[];
  /**
   * Tiles that would do in place of a needed one, as far from the hand: a 4
   * where the 1 is needed because either completes the pair. One entry per
   * needed key that has a stand-in.
   */
  readonly instead: readonly { readonly need: string; readonly or: readonly string[] }[];
  /**
   * The chance (0..1) of completing the hand before the wall runs out,
   * playing only for it from here, judged from what this seat can see
   * (`odds.ts`). 1 for a complete hand.
   */
  readonly chance: number;
  /** Copies of each needed key, and of each stand-in, the seat has not seen (in the wall or an opponent's hand). */
  readonly unseen: Readonly<Record<string, number>>;
  /**
   * Why the panel shows the hand: "likely" for one of the likeliest hands (and
   * every pinned hand), "discover" for one picked to be new to the player
   * (`HintStyle`). The chance is the same honest figure either way.
   */
  readonly pick: "likely" | "discover";
  /**
   * For a card with more than one scoring (Big Robert), when the version
   * found scores (`HandPattern.scoringWhen`); null for a hand with one scoring.
   */
  readonly scoringWhen: string | null;
  /**
   * A version of this card nearer than `away` that the seat cannot play, so
   * the panel never passes the hand shown off as that one: null when the
   * hand shown is the nearest there is.
   */
  readonly nearer: Nearer | null;
}

/**
 * A nearer version of a card that is not open to the seat: every copy of a
 * tile it needs is already in sight (`dead`), or it scores at a tier a house
 * rule bars (`barred`: the Goulash half-limit bar, C p. 55).
 */
export interface Nearer {
  /** Tiles that version still lacks; fewer than the hand shown. */
  readonly away: number;
  /** Its missing tiles, one key per copy, in canonical order. */
  readonly need: readonly string[];
  /** The keys in `need` of which no copy is left unseen; empty for a barred version. */
  readonly dead: readonly string[];
  /** The tier the bar leaves out, or null when the version is only out of tiles. */
  readonly barred: Tier | null;
  /** When that version scores, for a card with more than one scoring. */
  readonly scoringWhen: string | null;
}

/** Hands shown by default: enough to compare, few enough for a phone. */
export const CLOSEST_SHOWN = 3;

/** Versions of one hand kept when several are equally near: the likeliest is shown. */
const VERSIONS_KEPT = 64;

/**
 * Hands whose chance is simulated, besides the pinned ones: the nearest by the
 * quick estimate. A hand further down that list is not shown: it is further
 * than all of them and seldom likelier.
 */
const SHORTLIST = 8;

/**
 * Trials for a hand past the shortlist, wanted only by the hand index
 * (`limit` above the panel's few): a standard error of about three points,
 * quick enough for a list of a hundred hands on a phone.
 */
const QUICK_TRIALS = 300;

/**
 * Versions of a hand the simulation plays, at the nearest distance and again
 * one tile further. A flexible hand (Crazy Chows has thousands of versions)
 * is finished by re-planning as tiles arrive; with only the 64 nearest
 * versions the calibration run (`scripts/calibrate-odds.ts`) showed the
 * chance some 15 points too low, with 200 it was within a few points, and
 * 600 did no better.
 */
const SIMULATED_VERSIONS = 200;

/** Which discards a hand may be built from (`OddsTarget.claims`). */
function claimRule(pattern: HandPattern): ClaimRule {
  if (pattern.requiresSelfDrawn) return "none";
  return pattern.exposedTier === null ? "win" : "any";
}

/** Unseen copies of each needed key. */
function unseenOf(need: readonly string[], unseen: ArrayLike<number>): Record<string, number> {
  const index = new Map(KEYS.map((key, at) => [key, at]));
  return Object.fromEntries([...new Set(need)].map((key) => [key, unseen[index.get(key)!]!]));
}

/** The needed keys that the seat already holds a copy of, in canonical order. */
function anotherOf(need: readonly string[], held: ArrayLike<number>): string[] {
  const index = new Map(KEYS.map((key, at) => [key, at]));
  return [...new Set(need)].filter((key) => held[index.get(key)!]! > 0);
}

/**
 * The tiles that stand in for one needed tile. Of the equally near versions
 * of a hand, those that differ from the shown one by a single tile name a
 * tile that completes it just as well (the 1 or the 4 of a pair).
 */
function insteadOf(
  need: readonly string[],
  wants: readonly Int8Array[],
  held: ArrayLike<number>,
): { need: string; or: string[] }[] {
  const lacking = (want: Int8Array): Map<string, number> => {
    const missing = new Map<string, number>();
    want.forEach((count, at) => {
      const short = count - held[at]!;
      if (short > 0) missing.set(KEYS[at]!, short);
    });
    return missing;
  };
  const shown = new Map<string, number>();
  for (const key of need) shown.set(key, (shown.get(key) ?? 0) + 1);
  const swaps = new Map<string, Set<string>>();
  for (const want of wants) {
    const other = lacking(want);
    const out: string[] = [];
    const into: string[] = [];
    for (const [key, count] of shown) if ((other.get(key) ?? 0) < count) out.push(key);
    for (const [key, count] of other) if ((shown.get(key) ?? 0) < count) into.push(key);
    if (out.length !== 1 || into.length !== 1) continue;
    if ((shown.get(out[0]!) ?? 0) - (other.get(out[0]!) ?? 0) !== 1) continue;
    if ((other.get(into[0]!) ?? 0) - (shown.get(into[0]!) ?? 0) !== 1) continue;
    const set = swaps.get(out[0]!) ?? new Set<string>();
    set.add(into[0]!);
    swaps.set(out[0]!, set);
  }
  const order = new Map(KEYS.map((key, at) => [key, at]));
  return [...swaps]
    .sort((a, b) => order.get(a[0])! - order.get(b[0])!)
    .map(([key, set]) => ({ need: key, or: [...set].sort((a, b) => order.get(a)! - order.get(b)!) }));
}

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
): Found | null {
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
  const instead = insteadOf(need, reach.wants, situation.hand);
  const widen = (): readonly ArrayLike<number>[] => {
    const wider = nearest({
      alternatives: pattern.groups!(`w${situation.seatWind}`),
      held: situation.hand,
      spare: situation.unseen,
      melds: situation.melds.map((meld) => meld.tiles),
      budget: reach.missing,
      keep: SIMULATED_VERSIONS,
      slack: 1,
      cache,
    });
    return wider === null ? reach.wants : [...wider.wants, ...wider.further];
  };
  return {
    rank: chance * value,
    versions: reach.wants,
    flex: reach.wants.length,
    widen,
    claims: claimRule(pattern),
    hand: {
      pattern: pattern.id,
      name: pattern.name,
      tier,
      points: TIER_POINTS[tier],
      pages: pattern.pages,
      concealedOnly: pattern.exposedTier === null,
      requiresSelfDrawn: pattern.requiresSelfDrawn,
      away: reach.missing,
      need,
      another: anotherOf(need, situation.hand),
      instead,
      chance: Math.round(chance * 1000) / 1000,
      unseen: unseenOf([...need, ...instead.flatMap((entry) => entry.or)], situation.unseen),
      pick: "likely",
      scoringWhen: pattern.scoringWhen ?? null,
      nearer: null,
    },
  };
}

/** True when `excluded` bars this pattern only by its tier: a hand set that leaves it out names its id. */
function barredByTier(excluded: readonly string[], id: string): boolean {
  return !excluded.includes(id);
}

/** A version's missing tiles, one key per copy, in canonical order. */
function needOf(want: ArrayLike<number>, held: ArrayLike<number>): string[] {
  const need: string[] = [];
  for (let key = 0; key < KEYS.length; key++) {
    for (let copy = want[key]! - held[key]!; copy > 0; copy--) need.push(KEYS[key]!);
  }
  return need;
}

/**
 * The nearest version of a group-declared card closer than `away` that the
 * seat cannot play: a reading the tier bar leaves out (`barred`), or one of
 * the readings in play that lacks a tile whose every copy is in sight
 * (searched as if no tile were in sight). Null when none is nearer.
 */
function nearerByGroups(
  situation: Situation,
  readings: readonly HandPattern[],
  barred: readonly { pattern: HandPattern; tier: Tier }[],
  away: number,
  cache: ReachCache,
): Nearer | null {
  const melds = situation.melds.map((meld) => meld.tiles);
  const wind = `w${situation.seatWind}`;
  let found: Nearer | null = null;
  for (const { pattern, tier } of barred) {
    const budget = (found?.away ?? away) - 1;
    if (budget < 0) break;
    const reach = nearest({ alternatives: pattern.groups!(wind), held: situation.hand, spare: situation.unseen, melds, budget, keep: 1, cache });
    if (reach === null) continue;
    found = { away: reach.missing, need: needOf(reach.wants[0]!, situation.hand), dead: [], barred: tier, scoringWhen: pattern.scoringWhen ?? null };
  }
  // Every copy not in the seat's own hand or melds, as if nothing were in sight.
  const ownMelds = new Int8Array(KEYS.length);
  for (const meld of melds) for (const key of meld) {
    const at = KEYS.indexOf(key);
    if (at >= 0) ownMelds[at]! += 1;
  }
  const blind = Int8Array.from(KEYS, (_, at) => Math.max(0, 4 - situation.hand[at]! - ownMelds[at]!));
  for (const pattern of readings) {
    const budget = (found?.away ?? away) - 1;
    if (budget < 0) break;
    const reach = nearest({ alternatives: pattern.groups!(wind), held: situation.hand, spare: blind, melds, budget, keep: VERSIONS_KEPT, cache });
    if (reach === null) continue;
    for (const want of reach.wants) {
      const dead = KEYS.filter((_, at) => want[at]! - situation.hand[at]! > situation.unseen[at]!);
      if (dead.length === 0) continue; // open after all: the search found it, so it is not nearer
      found = { away: reach.missing, need: needOf(want, situation.hand), dead, barred: null, scoringWhen: pattern.scoringWhen ?? null };
      break;
    }
  }
  return found;
}

/** Hands a player can pin so they stay in the panel: the panel shows `CLOSEST_SHOWN` in all. */
export const MAX_PINS = CLOSEST_SHOWN;

/** One entry of the search: the hand and how likely, times how much, it is to be completed. */
interface Found {
  readonly hand: ClosestHand;
  /** The quick estimate of chance times value, which shortlists hands for the simulation. */
  readonly rank: number;
  /** The versions of the hand the seat can still play for, as concealed tile counts. */
  readonly versions: readonly ArrayLike<number>[];
  /**
   * The versions to simulate, when wider than `versions`: a player who draws
   * well switches to a version that was a tile further, so the simulation
   * plays those too. Worked out only for the hands that are simulated.
   */
  readonly widen?: () => readonly ArrayLike<number>[];
  readonly claims: ClaimRule;
  /** How many versions of the hand are open to the seat: a measure of how flexible it is. */
  readonly flex: number;
  /** The nearer version the seat cannot play (`ClosestHand.nearer`), worked out only for the hands shown. */
  readonly nearer?: () => Nearer | null;
}

/**
 * Every catalogue hand the seat can still reach, nearest first. The search
 * widens a tile at a time and stops once `limit` hands outside `pinned` are
 * within reach; a pinned hand is always searched for, however far it is.
 */
function search(view: GameView, limit: number, pinned: ReadonlySet<string>): { found: Found[]; excluded: readonly string[] } {
  // The player's own planner, without any bot's taste for special hands.
  // No bot's race discount either: the player's own figure ignores the bots' temperaments.
  const situation = { ...situationFor(view, view.seat), ambition: 1, haste: 1 };
  const odds = oddsFor(situation);
  const concealed = situation.melds.every((meld) => !meld.exposed);

  // Hands with a fixed value that are declared as groups: searched exactly below.
  const exact: { pattern: HandPattern; tier: Tier }[] = [];
  /** Group-declared readings a tier bar leaves out, by card: only to say so when one is nearer (`Nearer`). */
  const barredExact = new Map<string, { pattern: HandPattern; tier: Tier }[]>();
  for (const pattern of PATTERNS) {
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier !== null && isExcluded(situation.excluded ?? [], pattern.id, tier)) {
      // A house rule: never hinted. A tier bar (not a hand set leaving the hand out) is told when nearer.
      if (pattern.groups !== undefined && barredByTier(situation.excluded ?? [], pattern.id)) {
        const card = cardOf(pattern).id;
        barredExact.set(card, [...(barredExact.get(card) ?? []), { pattern, tier }]);
      }
      continue;
    }
    if (pattern.groups !== undefined && tier !== null && tier !== "calculate") exact.push({ pattern, tier });
  }
  const exactIds = new Set(exact.map((entry) => entry.pattern.id));

  const best = new Map<string, Found>();
  /** Every version of a hand the planner offers, with how far it is: a hand's versions are those near its best. */
  const offered = new Map<string, { need: ArrayLike<number>; away: number }[]>();
  /** Per card, the nearest planner version the seat cannot play: out of tiles, or barred by tier. */
  const lost = new Map<string, Nearer>();
  const keepLost = (pattern: HandPattern, nearer: Nearer): void => {
    const card = cardOf(pattern).id;
    const previous = lost.get(card);
    if (previous === undefined || nearer.away < previous.away) lost.set(card, nearer);
  };
  for (const goal of planGoals(situation)) {
    if (exactIds.has(goal.pattern)) continue;
    const pattern = PATTERN_BY_ID.get(goal.pattern);
    if (pattern === undefined) continue;
    const tier = concealed ? pattern.tier : pattern.exposedTier;
    if (tier === null) continue;
    const barred = isExcluded(situation.excluded ?? [], pattern.id, tier);
    if (barred && !barredByTier(situation.excluded ?? [], pattern.id)) continue; // left out of the table's hands

    const need: string[] = [];
    const dead: string[] = [];
    for (const key of goal.keys) {
      const want = goal.need[key]! - situation.hand[key]!;
      if (want <= 0) continue;
      if (situation.unseen[key]! < want) dead.push(KEYS[key]!);
      for (let copy = 0; copy < want; copy++) need.push(KEYS[key]!);
    }
    if (barred || dead.length > 0) {
      keepLost(pattern, {
        away: need.length,
        need,
        dead: barred ? [] : dead,
        barred: barred ? tier : null,
        scoringWhen: pattern.scoringWhen ?? null,
      });
      continue;
    }
    const list = offered.get(goal.pattern) ?? [];
    list.push({ need: goal.need, away: need.length });
    offered.set(goal.pattern, list);

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
      versions: [],
      flex: 1,
      claims: claimRule(pattern),
      hand: {
        pattern: pattern.id,
        name: pattern.name,
        tier,
        points: TIER_POINTS[tier],
        pages: pattern.pages,
        concealedOnly: pattern.exposedTier === null,
        requiresSelfDrawn: pattern.requiresSelfDrawn,
        away: need.length,
        need,
        another: anotherOf(need, situation.hand),
        instead: [],
        chance: Math.round(chance * 1000) / 1000,
        unseen: unseenOf(need, situation.unseen),
        pick: "likely",
        scoringWhen: pattern.scoringWhen ?? null,
        nearer: null,
      },
    });
  }
  // A planner hand's versions: those as near as its best, and those one tile further.
  for (const [id, entry] of best) {
    const versions = (offered.get(id) ?? [])
      .filter((version) => version.away <= entry.hand.away + 1)
      .sort((a, b) => a.away - b.away)
      .slice(0, VERSIONS_KEPT)
      .map((version) => version.need);
    best.set(id, { ...entry, versions, flex: Math.max(1, versions.length) });
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

  // Each hand learns, when shown, of a nearer version the seat cannot play.
  const inPlay = new Map<string, HandPattern[]>();
  for (const { pattern } of exact) {
    const card = cardOf(pattern).id;
    inPlay.set(card, [...(inPlay.get(card) ?? []), pattern]);
  }
  for (const [id, entry] of best) {
    const card = cardIdOf(id);
    best.set(id, {
      ...entry,
      nearer: () => {
        const fromPlan = lost.get(card);
        const fromGroups = nearerByGroups(
          situation,
          inPlay.get(card) ?? [],
          barredExact.get(card) ?? [],
          entry.hand.away,
          cache,
        );
        const nearest = [fromPlan, fromGroups]
          .filter((candidate): candidate is Nearer => candidate !== undefined && candidate !== null)
          .filter((candidate) => candidate.away < entry.hand.away)
          .sort((a, b) => a.away - b.away || (a.barred === null ? 1 : 0) - (b.barred === null ? 1 : 0));
        return nearest[0] ?? null;
      },
    });
  }

  const found = [...best.values()].sort(
    (a, b) => a.hand.away - b.hand.away || b.rank - a.rank || a.hand.pattern.localeCompare(b.hand.pattern),
  );
  return { found, excluded: situation.excluded ?? [] };
}

/**
 * The hands worth showing, with their simulated chance, likeliest first:
 * the `SHORTLIST` nearest cards and every pinned one in full, and further
 * cards up to `limit` with fewer trials. Ties go to the hand that pays more,
 * then the nearer, then by id.
 */
function rated(view: GameView, cards: readonly Found[], pinned: ReadonlySet<string>, limit: number): Found[] {
  const table: Table = tableOf(view);
  let others = 0;
  const out = cards.flatMap((entry): Found[] => {
    const isPinned = pinned.has(entry.hand.pattern);
    if (!isPinned) others += 1;
    const full = isPinned || others <= SHORTLIST;
    if (!full && others > limit) return [];
    const target = { versions: entry.widen?.() ?? entry.versions, claims: entry.claims };
    const options = full ? { salt: entry.hand.pattern } : { salt: entry.hand.pattern, trials: QUICK_TRIALS };
    const chance = entry.hand.away === 0 ? 1 : handChance(table, target, options);
    // The versions the simulation plays are the truest count of how flexible the hand is.
    const flexed = { ...entry, flex: Math.max(entry.flex, target.versions.length) };
    return [chance === null ? flexed : { ...flexed, hand: { ...entry.hand, chance: Math.round(chance * 1000) / 1000 } }];
  });
  return out.sort(
    (a, b) =>
      b.hand.chance - a.hand.chance ||
      (b.hand.points ?? 0) - (a.hand.points ?? 0) ||
      a.hand.away - b.hand.away ||
      a.hand.pattern.localeCompare(b.hand.pattern),
  );
}

/**
 * One entry per card, the nearest reading of it: a scoring variant and its
 * canonical hand are one hand in the panel. `found` is already nearest first.
 */
function asCards(found: readonly Found[]): Found[] {
  const seen = new Set<string>();
  const cards: Found[] = [];
  for (const entry of found) {
    const pattern = PATTERN_BY_ID.get(entry.hand.pattern);
    if (pattern === undefined) continue;
    const card = cardOf(pattern);
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card.id === entry.hand.pattern ? entry : { ...entry, hand: { ...entry.hand, pattern: card.id, name: card.name } });
  }
  return cards;
}

export function closestHands(view: GameView, limit = CLOSEST_SHOWN): ClosestHand[] {
  const none = new Set<string>();
  return rated(view, asCards(search(view, Math.max(limit, SHORTLIST), none).found), none, limit)
    .slice(0, limit)
    .map(shown);
}

/**
 * What one catalogue hand asks of the seat now: its open versions and the
 * claims it allows (the simulation's target), with the quick estimate the
 * search ranks by. Null when the hand is out of reach. For the calibration
 * run (`scripts/calibrate-odds.ts`), which plays a seat for one hand.
 */
export function handTarget(
  view: GameView,
  id: string,
): { readonly target: OddsTarget; readonly quick: number; readonly away: number } | null {
  const card = cardIdOf(id);
  const entry = asCards(search(view, 0, new Set([card])).found).find((found) => found.hand.pattern === card);
  if (entry === undefined) return null;
  return { target: { versions: entry.widen?.() ?? entry.versions, claims: entry.claims }, quick: entry.hand.chance, away: entry.hand.away };
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
 * How the panel picks its hands. "likeliest": the hands most likely to be
 * built, as ever. "mixed": the two likeliest and one discovery. "discovery":
 * every free place is a discovery. The chance shown is the same honest figure
 * in all three; only the choice of hands differs.
 */
export type HintStyle = "likeliest" | "mixed" | "discovery";

export const HINT_STYLES: readonly HintStyle[] = ["likeliest", "mixed", "discovery"];

export const DEFAULT_HINT_STYLE: HintStyle = "mixed";

export interface HintOptions {
  readonly style?: HintStyle;
  /**
   * How familiar each hand already is to the player (hands shown as a
   * discovery, hands built), by pattern id: zero or absent for a new hand.
   * Only the discovery places read it; the likeliest never do.
   */
  readonly familiarity?: Readonly<Record<string, number>>;
}

/**
 * The least chance a hand needs to be offered as a discovery: 5 %, inside the
 * "Long shot" band (2-10 %), so a discovery is never "Remote". A discovery is a
 * possibility the tiles really hold, not a fantasy; a higher floor (the
 * census, `docs/HINT-ODDS.md` §13, put 20 % at under 2 % of decisions with the
 * Rare hand set) would leave the discovery places empty.
 */
export const DISCOVERY_FLOOR = 0.05;

/** Hands simulated for a discovery pick: the likeliest few and the nearest further ones, the latter with fewer trials. */
const DISCOVERY_POOL = 16;

/** Places the likeliest hands keep in the mixed style (when the panel has room for a discovery too). */
const MIXED_LIKELY = 2;

/** What a hand's score is multiplied by when its family already has a place in the panel. */
const SAME_FAMILY = 0.25;

/** How strongly many open versions count against a hand: a flexible hand wins everywhere, so it is no surprise. */
const FLEXIBILITY_WEIGHT = 0.15;

/** A hand's family: the first book heading it is filed under. */
function familyOf(id: string): string {
  return GROUPS.find((group) => group.hands.includes(id))?.id ?? id;
}

/**
 * Fills the panel's `places` from `cards` (likeliest first, none pinned).
 *
 * A discovery is a hand the likeliest style would not have shown (ranked below
 * the panel's places), eligible when its chance is at least `DISCOVERY_FLOOR`,
 * with the best score: the square root of its chance, less for a hand the
 * player has seen or built before, for one with very many versions, and for
 * one whose family already has a place; plus a small spread seeded from the
 * view, so the same position always gives the same panel and a new position
 * can give a different one.
 *
 * Places no eligible discovery fills go, in the mixed style, to the likeliest
 * hands left; in the discovery style they are scored the same way among all
 * the hands left (the likeliest included), so the panel still rotates and
 * varies when the tiles offer little that is new.
 */
function choose(
  cards: readonly Found[],
  places: number,
  style: HintStyle,
  familiarity: Readonly<Record<string, number>>,
  seed: string,
): ClosestHand[] {
  if (places <= 0) return [];
  if (style === "likeliest") return cards.slice(0, places).map(shown);
  const discoveries = style === "discovery" ? places : places >= 2 ? places - Math.min(MIXED_LIKELY, places - 1) : 0;
  const likely = cards.slice(0, places - discoveries);
  const families = new Map<string, number>();
  for (const entry of likely) families.set(familyOf(entry.hand.pattern), 1);

  const score = (entry: Found): number => {
    const id = entry.hand.pattern;
    return (
      Math.sqrt(entry.hand.chance) *
      (1 / (1 + Math.max(0, familiarity[id] ?? 0))) *
      (1 / (1 + FLEXIBILITY_WEIGHT * Math.log2(1 + entry.flex))) *
      (families.has(familyOf(id)) ? SAME_FAMILY : 1) *
      (1 + 0.1 * createRng(`${seed}#${id}`).next())
    );
  };
  /** The best-scoring hand of `pool`, taken out of it. */
  const take = (pool: Found[]): Found => {
    let best = 0;
    let bestScore = -1;
    pool.forEach((entry, at) => {
      const value = score(entry);
      if (value > bestScore) {
        best = at;
        bestScore = value;
      }
    });
    const [entry] = pool.splice(best, 1);
    families.set(familyOf(entry!.hand.pattern), 1);
    return entry!;
  };

  // A discovery is a hand the likeliest style would not have shown: one ranked below its places.
  const eligible = cards.slice(places).filter((entry) => entry.hand.chance >= DISCOVERY_FLOOR);
  const picked: Found[] = [];
  while (picked.length < discoveries && eligible.length > 0) picked.push(take(eligible));
  const chosen = [...likely, ...picked];
  const rest = cards.filter((entry) => !chosen.includes(entry));
  if (style === "discovery") {
    // Nothing more that is new: the same scoring over what is left, never a hand with no chance.
    const left = rest.filter((entry) => entry.hand.chance > 0);
    while (chosen.length < places && left.length > 0) chosen.push(take(left));
  } else {
    for (const entry of rest) {
      if (chosen.length >= places) break;
      chosen.push(entry);
    }
  }
  return chosen.map((entry) => (picked.includes(entry) ? { ...shown(entry), pick: "discover" as const } : shown(entry)));
}

/** A hand as the panel shows it, with its nearer version worked out now that it is shown. */
function shown(entry: Found): ClosestHand {
  return { ...entry.hand, nearer: entry.nearer?.() ?? null };
}

/**
 * The panel's contents: the player's pinned hands first, in the order they
 * were pinned, then the other hands (at most `limit`, never one that is
 * pinned) chosen by the hint style: the likeliest by default, or with
 * discoveries (`HintStyle`). Pins naming no hand, or a hand this table plays
 * without, are left out; so are repeats and every pin beyond `MAX_PINS`.
 */
export function closestWithPins(
  view: GameView,
  pins: readonly string[],
  limit = CLOSEST_SHOWN,
  options: HintOptions = {},
): { hands: ClosestHand[]; pinned: PinnedHand[] } {
  // A pin on a scoring variant pins its card.
  const ids = [...new Set(pins.map((id) => cardIdOf(id)))].slice(0, MAX_PINS);
  const chosen = new Set(ids);
  const style = options.style ?? "likeliest";
  const pool = style === "likeliest" ? limit : Math.max(limit, DISCOVERY_POOL);
  const { found, excluded } = search(view, Math.max(pool, SHORTLIST), chosen);
  const cards = rated(view, asCards(found), chosen, pool);
  const byId = new Map(cards.map((entry) => [entry.hand.pattern, entry]));
  const pinned: PinnedHand[] = [];
  for (const id of ids) {
    const pattern = PATTERN_BY_ID.get(id);
    if (pattern === undefined || excluded.includes(id)) continue;
    const entry = byId.get(id);
    pinned.push({ pattern: id, name: pattern.name, hand: entry === undefined ? null : shown(entry) });
  }
  const others = cards.filter((entry) => !chosen.has(entry.hand.pattern));
  const seed = `${view.seat}/${view.handNumber}/${view.phase}/${view.turn}/${view.wallRemaining}/${view.player.hand.join("")}`;
  const hands = choose(others, limit, style, options.familiarity ?? {}, seed);
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
  /**
   * The scoring readings this card covers, the hand's own first. A hand with
   * one scoring has a single reading; Big Robert has two (limit when the runs
   * use the same numbers, half limit otherwise).
   */
  readonly readings: readonly HandReading[];
  /** The sample hand each book pictures, primary book first; empty if neither does. */
  readonly samples: readonly HandSample[];
}

/** One scoring of a card: the tier it pays, and when (`HandPattern.scoringWhen`). */
export interface HandReading {
  /** The catalogue pattern that scores this reading. */
  readonly pattern: string;
  /** The condition under which this reading applies; null for a hand with one scoring. */
  readonly scoringWhen: string | null;
  readonly concealedTier: Tier;
  readonly concealedPoints: number | null;
  readonly exposedTier: Tier | null;
  readonly exposedPoints: number | null;
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

/**
 * The card's detail. `excluded` drops the scoring readings a house rule
 * leaves out; the card itself is the canonical hand's, always.
 */
function detailOf(card: HandPattern, excluded: ReadonlySet<string> = new Set()): HandDetail {
  const readings = [card, ...PATTERNS.filter((pattern) => pattern.variantOf === card.id)]
    .filter((pattern) => !excluded.has(pattern.id))
    .map(
      (pattern): HandReading => ({
        pattern: pattern.id,
        scoringWhen: pattern.scoringWhen ?? null,
        concealedTier: pattern.tier,
        concealedPoints: TIER_POINTS[pattern.tier],
        exposedTier: pattern.exposedTier,
        exposedPoints: pattern.exposedTier === null ? null : TIER_POINTS[pattern.exposedTier],
      }),
    );
  return {
    pattern: card.id,
    name: card.name,
    pages: card.pages,
    groups: GROUPS.filter((group) => group.hands.includes(card.id)).map((group) => group.id),
    example: (EXAMPLES[card.id] ?? "").split(" ").filter((key) => key.length > 0),
    description: card.description,
    concealedOnly: card.exposedTier === null,
    requiresSelfDrawn: card.requiresSelfDrawn,
    concealedTier: card.tier,
    concealedPoints: TIER_POINTS[card.tier],
    exposedTier: card.exposedTier,
    exposedPoints: card.exposedTier === null ? null : TIER_POINTS[card.exposedTier],
    readings,
    samples: mergedSamples(card.id),
  };
}

/**
 * One hand by id, for the "explore this hand" view; null for an unknown id.
 * A scoring variant's id gives its card, the hand it belongs to.
 */
export function handDetail(id: string): HandDetail | null {
  const pattern = PATTERN_BY_ID.get(id);
  return pattern === undefined ? null : detailOf(cardOf(pattern));
}

/**
 * The catalogue for the hand index: every hand in play, one card each, and the
 * book's headings to filter by. `excluded` names the hands the table plays
 * without (a house rule); they and their place under a heading are left out.
 */
export function handIndex(
  excluded: readonly string[] = [],
): { readonly groups: readonly HandGroup[]; readonly hands: readonly HandDetail[] } {
  const gone = new Set(excluded);
  const cards = PATTERNS.filter((pattern) => pattern.variantOf === undefined);
  const hands = cards
    .filter((pattern) => !gone.has(pattern.id))
    .map((pattern) => detailOf(pattern, gone));
  if (excluded.length === 0) return { groups: GROUPS.map(cardGroup), hands };
  return {
    groups: GROUPS.map((group) => cardGroup({ ...group, hands: group.hands.filter((id) => !gone.has(id)) })).filter(
      (group) => group.hands.length > 0,
    ),
    hands,
  };
}

/** A heading with each card once: a scoring variant is filed under its canonical hand. */
function cardGroup(group: HandGroup): HandGroup {
  const hands = group.hands.filter((id) => {
    const pattern = PATTERN_BY_ID.get(id);
    return pattern === undefined || pattern.variantOf === undefined;
  });
  return { ...group, hands };
}
