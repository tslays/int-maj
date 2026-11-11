/**
 * The bots' hand planner: how much is a set of tiles worth, in expectation?
 *
 * A plan is a list of concrete winning hands ("targets") the seat could still
 * build, each with a value in points. For a hand of tiles the planner counts,
 * for every target, which tiles are still missing, and estimates the chance of
 * collecting them from the tiles this seat has not seen:
 *
 *   - every unseen copy of a tile is drawn by this seat with probability
 *     q = (own draws left) / (tiles unseen), so P(get m of the u unseen
 *     copies) is a binomial tail;
 *   - the last tile can also be claimed off any discard for Mah Jong, so it
 *     comes about three times as easily, except for hands that must be
 *     completed from the wall.
 *
 * The expected value of a hand combines its best few targets as alternatives:
 * EV = sum w_i p_i v_i * prod_{j<i} (1 - p_j), best p*v first, where w = 1 for
 * the best target and 0.4 for the overlapping back-ups.
 *
 * Targets come from three generic sources, never from hand-specific code:
 *   1. the generated table of special hands (targets.ts), each tagged with
 *      the catalogue pattern it makes and valued at its printed tier;
 *   2. standard hands (four sets and a pair) assembled around the seat's own
 *      tiles, valued by the real scorer (`scoreHand`), so ordinary hands and
 *      every special hand of that shape are priced exactly;
 *   3. seven-pair hands assembled the same way, also priced by `scoreHand`.
 *
 * Everything here is pure and deterministic: the inputs are one seat's view.
 */

import { createHand, type MeldInput } from "../../hand.ts";
import { TIER_POINTS, type Tier } from "../../patterns/types.ts";
import { PATTERNS } from "../../patterns/table.ts";
import { scoreHand } from "../../score.ts";
import { PLAY_TILE_KEYS, type Wind } from "../../tiles.ts";
import { SPECIAL_TARGETS } from "./targets.ts";

export const KEYS = PLAY_TILE_KEYS;
export const KINDS = KEYS.length;
const INDEX: ReadonlyMap<string, number> = new Map(KEYS.map((key, index) => [key, index]));

export function indexOf(key: string): number {
  const index = INDEX.get(key);
  if (index === undefined) throw new Error(`not a play tile: ${key}`);
  return index;
}

/** Tile counts by PLAY_TILE_KEYS index. */
export type Counts = Int8Array;

export function countsOf(keys: readonly string[]): Counts {
  const counts = new Int8Array(KINDS);
  for (const key of keys) {
    const index = INDEX.get(key);
    if (index !== undefined) counts[index]! += 1;
  }
  return counts;
}

export interface PlanMeld {
  readonly kind: "chow" | "pung" | "kong";
  readonly tiles: readonly string[];
  readonly exposed: boolean;
}

/** Everything the planner needs to know, all of it visible to the seat. */
export interface Situation {
  /** Concealed tiles in hand. */
  readonly hand: Counts;
  readonly melds: readonly PlanMeld[];
  /** Copies of each tile this seat has not seen (0..4). */
  readonly unseen: Counts;
  /** Tiles this seat still expects to draw from the wall. */
  readonly draws: number;
  readonly seatWind: Wind;
  readonly prevailingWind: Wind;
  readonly flowers: readonly string[];
  readonly seasons: readonly string[];
  /** Multiplier on fixed-tier (special) hand values: a bot's ambition. */
  readonly ambition: number;
}

interface Target {
  /** The full fourteen tiles, kongs counted as three. */
  readonly counts: Counts;
  readonly pattern: string;
  readonly tier: Tier;
  readonly exposedTier: Tier | null;
  readonly selfDrawnOnly: boolean;
}

/** One hand the seat could still build, already fitted to its melds. */
export interface Goal {
  /** Concealed tiles the goal still wants (target minus declared melds). */
  readonly need: Counts;
  /** Indices where `need` is non-zero, for sparse loops. */
  readonly keys: readonly number[];
  readonly value: number;
  readonly selfDrawnOnly: boolean;
  readonly pattern: string;
}

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

let specialTargets: Target[] | null = null;

function specials(): Target[] {
  if (specialTargets !== null) return specialTargets;
  const targets: Target[] = [];
  for (const [id, hands] of SPECIAL_TARGETS) {
    const pattern = PATTERN_BY_ID.get(id);
    if (pattern === undefined) continue;
    for (const hand of hands.split(" ")) {
      targets.push({
        counts: countsOf(hand.match(/../g) ?? []),
        pattern: id,
        tier: pattern.tier,
        exposedTier: pattern.exposedTier,
        selfDrawnOnly: pattern.requiresSelfDrawn,
      });
    }
  }
  specialTargets = targets;
  return targets;
}

/** The three tiles a declared meld fixes in a target (a kong counts as a pung). */
function meldCounts(melds: readonly PlanMeld[]): Counts {
  const counts = new Int8Array(KINDS);
  for (const meld of melds) {
    for (const key of meld.tiles.slice(0, 3)) counts[indexOf(key)]! += 1;
  }
  return counts;
}

function isConcealedHand(melds: readonly PlanMeld[]): boolean {
  return melds.every((meld) => !meld.exposed);
}

/** Missing tiles: how many of `need` the hand does not hold. */
function missing(need: Counts, keys: readonly number[], hand: Counts): number {
  let total = 0;
  for (const key of keys) {
    const short = need[key]! - hand[key]!;
    if (short > 0) total += short;
  }
  return total;
}

/** Hands further than this from completion are not worth tracking. */
export const MAX_MISSING = 6;

function goalFrom(
  counts: Counts,
  fixed: Counts,
  value: number,
  selfDrawnOnly: boolean,
  pattern: string,
): Goal | null {
  const need = new Int8Array(KINDS);
  const keys: number[] = [];
  for (let index = 0; index < KINDS; index++) {
    const rest = counts[index]! - fixed[index]!;
    if (rest < 0) return null;
    need[index] = rest;
    if (rest > 0) keys.push(index);
  }
  return { need, keys, value, selfDrawnOnly, pattern };
}

// ---------------------------------------------------------------------------
// Standard and seven-pair hands, assembled around the seat's tiles.

const SUIT_OF = (index: number): number => (index < 27 ? Math.floor(index / 9) : -1);

interface SetChoice {
  readonly tiles: readonly number[];
  readonly chow: boolean;
}

const SETS: readonly SetChoice[] = (() => {
  const sets: SetChoice[] = [];
  for (let index = 0; index < KINDS; index++) sets.push({ tiles: [index, index, index], chow: false });
  for (let suit = 0; suit < 3; suit++) {
    for (let rank = 0; rank < 7; rank++) {
      const base = suit * 9 + rank;
      sets.push({ tiles: [base, base + 1, base + 2], chow: true });
    }
  }
  return sets;
})();

interface Assembled {
  readonly counts: Counts;
  readonly short: number;
}

/**
 * Four sets and a pair (less the declared melds) within MAX_MISSING of the
 * hand. Only shapes some catalogue hand can take are assembled: one suit with
 * any chows, or pungs in any suits (Mixed Pung and its relatives); the scorer
 * decides what each one is worth.
 */
function standardShapes(hand: Counts, melds: readonly PlanMeld[], fixed: Counts): Assembled[] {
  const setsWanted = 4 - melds.length;
  if (setsWanted < 0) return [];
  const meldChow = melds.some((meld) => meld.kind === "chow");
  let meldSuits = 0;
  for (let index = 0; index < 27; index++) if (fixed[index]! > 0) meldSuits |= 1 << SUIT_OF(index);

  const out: Assembled[] = [];
  const counts = new Int8Array(fixed);
  const limit = MAX_MISSING - 1;
  // A declared kong holds a fourth copy that `fixed` does not count.
  const ceiling = new Int8Array(KINDS).fill(4);
  for (const meld of melds) if (meld.kind === "kong") ceiling[indexOf(meld.tiles[0]!)] = 3;

  const suitCount = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);

  const add = (tiles: readonly number[]): number => {
    let cost = 0;
    for (const tile of tiles) {
      counts[tile]! += 1;
      if (counts[tile]! - fixed[tile]! > hand[tile]!) cost += 1;
    }
    return cost;
  };
  const remove = (tiles: readonly number[]): void => {
    for (const tile of tiles) counts[tile]! -= 1;
  };
  const overfull = (tiles: readonly number[]): boolean =>
    tiles.some((tile) => counts[tile]! > ceiling[tile]!);

  const visit = (from: number, left: number, short: number, suits: number, chow: boolean): void => {
    if (left === 0) {
      for (let pair = 0; pair < KINDS; pair++) {
        const pairSuits = pair < 27 ? suits | (1 << SUIT_OF(pair)) : suits;
        if (suitCount(pairSuits) > 1 && chow) continue;
        const cost = add([pair, pair]);
        if (!overfull([pair]) && short + cost <= limit) {
          out.push({ counts: new Int8Array(counts), short: short + cost });
        }
        remove([pair, pair]);
      }
      return;
    }
    for (let choice = from; choice < SETS.length; choice++) {
      const set = SETS[choice]!;
      const setSuits = set.tiles[0]! < 27 ? suits | (1 << SUIT_OF(set.tiles[0]!)) : suits;
      const withChow = chow || set.chow;
      if (withChow && suitCount(setSuits) > 1) continue;
      const cost = add(set.tiles);
      if (!overfull(set.tiles) && short + cost <= limit) {
        visit(set.chow ? choice : choice + 1, left - 1, short + cost, setSuits, withChow);
      }
      remove(set.tiles);
    }
  };

  visit(0, setsWanted, 0, meldSuits, meldChow);
  return out;
}

/** Seven distinct pairs, one suit at most, built from tiles already held. */
function pairShapes(hand: Counts): Assembled[] {
  const held: number[] = [];
  for (let index = 0; index < KINDS; index++) if (hand[index]! > 0) held.push(index);
  const out: Assembled[] = [];
  const chosen: number[] = [];
  const visit = (from: number, short: number, suit: number): void => {
    if (chosen.length === 7) {
      const counts = new Int8Array(KINDS);
      for (const index of chosen) counts[index] = 2;
      out.push({ counts, short });
      return;
    }
    for (let position = from; position < held.length; position++) {
      const index = held[position]!;
      const tileSuit = SUIT_OF(index);
      if (tileSuit >= 0 && suit >= 0 && tileSuit !== suit) continue;
      const cost = hand[index]! >= 2 ? 0 : 1;
      if (short + cost > MAX_MISSING - 1) continue;
      chosen.push(index);
      visit(position + 1, short + cost, tileSuit >= 0 ? tileSuit : suit);
      chosen.pop();
    }
  };
  visit(0, 0, -1);
  return out;
}

/** Bounded memo of scorer results; pure, so caching is invisible. */
const VALUE_CACHE = new Map<string, { value: number; selfDrawnOnly: boolean; pattern: string }>();

function keysFrom(counts: Counts): string[] {
  const keys: string[] = [];
  for (let index = 0; index < KINDS; index++) {
    for (let copy = 0; copy < counts[index]!; copy++) keys.push(KEYS[index]!);
  }
  return keys;
}

/**
 * The scorer's value for a completed hand, blending a self-drawn finish with
 * a win on a discard. Returns null when no catalogue hand is made.
 */
function scoredValue(
  concealed: Counts,
  situation: Situation,
): { value: number; selfDrawnOnly: boolean; pattern: string } | null {
  const tiles = keysFrom(concealed);
  const key = [
    tiles.join(""),
    situation.melds.map((meld) => `${meld.kind}${meld.exposed ? "+" : "-"}${meld.tiles.join("")}`).join(","),
    situation.seatWind,
    situation.prevailingWind,
    situation.flowers.join(""),
    situation.seasons.join(""),
  ].join("|");
  const cached = VALUE_CACHE.get(key);
  if (cached !== undefined) return cached.value > 0 ? cached : null;

  const melds: MeldInput[] = situation.melds.map((meld) => ({
    kind: meld.kind,
    tiles: meld.tiles.join(" "),
    exposed: meld.exposed,
  }));
  const score = (selfDrawn: boolean) => {
    const result = scoreHand(
      createHand({
        concealed: tiles.join(" "),
        melds,
        flowers: situation.flowers.join(" "),
        seasons: situation.seasons.join(" "),
        selfDrawn,
        seatWind: situation.seatWind,
        prevailingWind: situation.prevailingWind,
      }),
    );
    return result.winning === null ? null : { points: result.points ?? 0, pattern: result.winning.pattern.id };
  };
  let drawn: ReturnType<typeof score> = null;
  let claimed: ReturnType<typeof score> = null;
  try {
    drawn = score(true);
    claimed = score(false);
  } catch {
    // An impossible tile count (a fifth copy beside a kong): not a hand.
  }
  let entry = { value: 0, selfDrawnOnly: false, pattern: "" };
  if (drawn !== null && claimed !== null) {
    // A concealed hand is finished from the wall about a third of the time.
    entry = { value: 0.35 * drawn.points + 0.65 * claimed.points, selfDrawnOnly: false, pattern: claimed.pattern };
  } else if (drawn !== null) {
    entry = { value: drawn.points, selfDrawnOnly: true, pattern: drawn.pattern };
  }
  if (VALUE_CACHE.size > 20000) VALUE_CACHE.clear();
  VALUE_CACHE.set(key, entry);
  return entry.value > 0 ? entry : null;
}

/** How many assembled hands get priced by the scorer per plan. */
const PRICED_STANDARD = 24;
const PRICED_PAIRS = 8;

/**
 * Every goal worth tracking from this seat's current tiles. `hand` may hold
 * any number of tiles (13, 14, or fewer after a kong); targets further than
 * MAX_MISSING from it are dropped.
 */
export function planGoals(situation: Situation): Goal[] {
  const { hand, melds } = situation;
  const fixed = meldCounts(melds);
  const concealed = isConcealedHand(melds);
  const goals: Goal[] = [];

  for (const target of specials()) {
    const tier = concealed ? target.tier : target.exposedTier;
    if (tier === null) continue;
    const goal = goalFrom(
      target.counts,
      fixed,
      (TIER_POINTS[tier] ?? 0) * situation.ambition,
      target.selfDrawnOnly,
      target.pattern,
    );
    if (goal === null) continue;
    if (missing(goal.need, goal.keys, hand) > MAX_MISSING) continue;
    goals.push(goal);
  }

  const price = (shapes: Assembled[], count: number): void => {
    shapes.sort((a, b) => a.short - b.short);
    let priced = 0;
    for (const shape of shapes) {
      if (priced >= count) break;
      const rest = new Int8Array(KINDS);
      for (let index = 0; index < KINDS; index++) rest[index] = shape.counts[index]! - fixed[index]!;
      const scored = scoredValue(rest, situation);
      priced += 1;
      if (scored === null) continue;
      const fixedTier = scored.pattern !== "" && PATTERN_BY_ID.get(scored.pattern)?.tier !== "calculate";
      const goal = goalFrom(
        shape.counts,
        fixed,
        scored.value * (fixedTier ? situation.ambition : 1),
        scored.selfDrawnOnly,
        scored.pattern,
      );
      if (goal !== null) goals.push(goal);
    }
  };

  price(standardShapes(hand, melds, fixed), PRICED_STANDARD);
  if (melds.length === 0) price(pairShapes(hand), PRICED_PAIRS);
  return goals;
}

// ---------------------------------------------------------------------------
// Probabilities and expected value.

/** P(Binomial(n, q) >= m). */
function tail(n: number, m: number, q: number): number {
  if (m <= 0) return 1;
  if (m > n) return 0;
  let below = 0;
  let term = (1 - q) ** n;
  for (let k = 0; k < m; k++) {
    below += term;
    term = (term * (n - k) * q) / ((k + 1) * (1 - q || 1e-9));
  }
  return Math.max(0, 1 - below);
}

export interface Odds {
  /** Chance per unseen copy that this seat draws it. */
  readonly draw: number;
  /** Chance per unseen copy that it arrives by draw or a claimable discard. */
  readonly last: number;
  readonly draws: number;
  readonly unseen: Counts;
}

export function oddsFor(situation: Situation): Odds {
  let pool = 0;
  for (let index = 0; index < KINDS; index++) pool += situation.unseen[index]!;
  const draw = pool > 0 ? Math.min(0.95, situation.draws / pool) : 0;
  return { draw, last: Math.min(0.95, draw * 3), draws: situation.draws, unseen: situation.unseen };
}

/**
 * Chance of completing `goal` from `hand`. Every missing tile but the last
 * must be drawn; the last may also be claimed off a discard, so the key that
 * is easiest to finish on is taken as the last one.
 */
export function completion(goal: Goal, hand: Counts, odds: Odds): number {
  const lastRate = goal.selfDrawnOnly ? odds.draw : odds.last;
  let short = 0;
  let zeros = 0;
  let product = 1;
  const plains: number[] = [];
  const lasts: number[] = [];
  for (const key of goal.keys) {
    const want = goal.need[key]! - hand[key]!;
    if (want <= 0) continue;
    const copies = odds.unseen[key]!;
    if (copies < want) return 0;
    short += want;
    const plain = tail(copies, want, odds.draw);
    plains.push(plain);
    lasts.push(tail(copies, want - 1, odds.draw) * (1 - (1 - lastRate) ** (copies - want + 1)));
    if (plain === 0) zeros += 1;
    else product *= plain;
  }
  if (short === 0) return 1;
  if (short - 1 > odds.draws) return 0;
  let best = 0;
  for (let i = 0; i < plains.length; i++) {
    const plain = plains[i]!;
    const others = plain > 0 ? (zeros > 0 ? 0 : product / plain) : zeros === 1 ? product : 0;
    const chance = others * lasts[i]!;
    if (chance > best) best = chance;
  }
  return Math.min(1, best);
}

const COMBINED = 6;
const ALTERNATIVE_WEIGHT = 0.4;

/** Expected value of holding `hand` against the goals: best few as alternatives. */
export function expectedValue(goals: readonly Goal[], hand: Counts, odds: Odds): number {
  const best: { ev: number; p: number }[] = [];
  for (const goal of goals) {
    const p = completion(goal, hand, odds);
    if (p <= 0) continue;
    const ev = p * goal.value;
    if (best.length === COMBINED && ev <= best[COMBINED - 1]!.ev) continue;
    let at = best.length;
    while (at > 0 && best[at - 1]!.ev < ev) at -= 1;
    best.splice(at, 0, { ev, p });
    if (best.length > COMBINED) best.pop();
  }
  // Alternatives mostly share their tiles, so they are far from independent:
  // the best target counts in full, the others only as a partial back-up.
  let total = 0;
  let miss = 1;
  for (const [rank, entry] of best.entries()) {
    total += entry.ev * miss * (rank === 0 ? 1 : ALTERNATIVE_WEIGHT);
    miss *= 1 - entry.p;
  }
  return total;
}

/** The single most valuable goal, for explanations and tests. */
export function leadingGoal(goals: readonly Goal[], hand: Counts, odds: Odds): Goal | null {
  let lead: Goal | null = null;
  let leadEv = 0;
  for (const goal of goals) {
    const ev = completion(goal, hand, odds) * goal.value;
    if (ev > leadEv) {
      lead = goal;
      leadEv = ev;
    }
  }
  return lead;
}

/** The catalogue pattern this seat's hand makes with `tile` added, if any. */
export function completedPattern(situation: Situation, tile: string): string | null {
  const concealed = new Int8Array(situation.hand);
  concealed[indexOf(tile)]! += 1;
  const scored = scoredValue(concealed, situation);
  return scored === null ? null : scored.pattern;
}
