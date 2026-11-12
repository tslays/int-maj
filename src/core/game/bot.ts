/**
 * A pure, deterministic table opponent.
 *
 * `chooseAction(view, seat)` takes only a `GameView` (the projection
 * `viewFor` builds for one seat) and returns one action from that view's
 * `legalActions`, or null when the seat has no decision. It never sees the
 * other three concealed hands: opponents arrive as counts, melds and
 * discards, exactly like a human at the table.
 *
 * Every decision is priced by the hand planner (bot/plan.ts): the expected
 * value of a hand is the chance of completing each hand it could still become
 * (special hands from the catalogue, ordinary hands, pair hands), from the
 * tiles this seat has not seen, times what that hand pays. The policy:
 *
 *   1. Win when a win is legal. Show the fish (announce fishing) for a
 *      special hand, whose fishing figure is worth claiming; with an ordinary
 *      hand stay quiet while the wall is long, so the table keeps feeding it.
 *   2. Claim a pung, kong or chow only when the hand is worth clearly more
 *      after the call than before it. Exposing a set forfeits every
 *      concealed-only hand and the concealed bonuses, so a bot with a good
 *      concealed hand lets the discard go, as a careful player would.
 *   3. Declare a kong when the extra tile is worth more than discarding.
 *   4. Discard the tile whose loss costs least, with a defensive penalty for
 *      tiles an opponent's exposed sets show it needs (a careless discard
 *      pays the other losers' debts too), more so when it shows the fish.
 *
 * Each seat has a temperament (ambition for special hands, appetite for
 * calls, caution), so the three opponents do not play like copies of one
 * another. On top of it the table sets a skill level (`BotLevel`): Hard plays
 * the policy above as it stands; Medium defends less and misjudges its
 * discards by a margin; Easy never defends, chases special hands less, calls
 * almost any discard and misjudges its discards widely. The misjudgement comes from a hash of the view, never
 * from a random source, so everything stays deterministic: the same view at
 * the same level gives the same action.
 */

import type { Action } from "./actions.ts";
import { seatIndex, SEATS, type Seat } from "./state.ts";
import type { GameView } from "./view.ts";
import { PATTERNS } from "../patterns/table.ts";
import { WINDS } from "../tiles.ts";
import { exposureIndicates } from "./settle.ts";
import {
  completedPattern,
  countsOf,
  expectedValue,
  indexOf,
  KEYS,
  KINDS,
  oddsFor,
  planGoals,
  type Counts,
  type PlanMeld,
  type Situation,
} from "./bot/plan.ts";

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

/** A seat's playing style. */
export interface Temperament {
  readonly name: string;
  /** Multiplier on special-hand values. */
  readonly ambition: number;
  /** A call must raise the hand's value by this fraction to be made. */
  readonly callMargin: number;
  /** Weight of the defensive penalties. */
  readonly caution: number;
  /** An ordinary hand shows the fish once the wall is this short. */
  readonly quietUntil: number;
}

const TEMPERAMENTS: readonly Temperament[] = [
  { name: "steady", ambition: 1.0, callMargin: 0.15, caution: 1.0, quietUntil: 50 },
  { name: "ambitious", ambition: 1.3, callMargin: 0.3, caution: 0.8, quietUntil: 35 },
  { name: "quick", ambition: 0.85, callMargin: 0.05, caution: 0.9, quietUntil: 30 },
  { name: "careful", ambition: 1.1, callMargin: 0.2, caution: 1.4, quietUntil: 70 },
];

/** The temperament a seat plays with; fixed per seat so styles stay recognisable. */
export function temperamentOf(seat: Seat): Temperament {
  return TEMPERAMENTS[seatIndex(seat)]!;
}

/** How well the bots play. A table preference, never a rule. */
export const BOT_LEVELS = ["easy", "medium", "hard"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
export const DEFAULT_BOT_LEVEL: BotLevel = "hard";

export function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === "string" && (BOT_LEVELS as readonly string[]).includes(value);
}

/** What a level changes on top of a seat's temperament. */
interface Skill {
  /** Multiplier on the temperament's ambition for special hands. */
  readonly ambition: number;
  /** Multiplier on the temperament's caution (defensive penalties). */
  readonly caution: number;
  /** Added to the temperament's call margin; below zero calls hurt hands. */
  readonly callShift: number;
  /** Discard misjudgement, as a fraction of the best discard's value. */
  readonly noise: number;
}

const SKILLS: Readonly<Record<BotLevel, Skill>> = {
  easy: { ambition: 0.6, caution: 0, callShift: -0.35, noise: 0.8 },
  medium: { ambition: 1, caution: 0.5, callShift: 0, noise: 0.3 },
  hard: { ambition: 1, caution: 1, callShift: 0, noise: 0 },
};

/** A seat's temperament at a level: the style stays, the skill changes. */
function playing(seat: Seat, level: BotLevel): Temperament & { readonly noise: number } {
  const base = temperamentOf(seat);
  const skill = SKILLS[level];
  return {
    ...base,
    ambition: base.ambition * skill.ambition,
    caution: base.caution * skill.caution,
    callMargin: base.callMargin + skill.callShift,
    noise: skill.noise,
  };
}

/** A number in [0, 1) fixed by the view and the tile: a misjudgement without a random source. */
function slip(view: GameView, tile: string): number {
  const text = `${view.seat}|${view.wallRemaining}|${view.player.hand.join("")}|${view.player.discards.length}|${tile}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

function seatWindOf(view: GameView, seat: Seat): (typeof WINDS)[number] {
  const offset = (seatIndex(seat) - seatIndex(view.dealer) + SEATS.length) % SEATS.length;
  return WINDS[offset]!;
}

function unseenFor(view: GameView): Counts {
  const seen = countsOf([
    ...view.player.hand,
    ...view.player.melds.flatMap((meld) => meld.tiles),
    ...view.player.discards,
    ...view.opponents.flatMap((opponent) => [
      ...opponent.discards,
      ...opponent.melds.flatMap((meld) => meld.tiles),
    ]),
  ]);
  const unseen = new Int8Array(KINDS);
  for (let index = 0; index < KINDS; index++) unseen[index] = Math.max(0, 4 - seen[index]!);
  return unseen;
}

/** Everything the planner needs from one seat's view, with that seat's ambition. */
export function situationFor(view: GameView, seat: Seat, level: BotLevel = DEFAULT_BOT_LEVEL): Situation {
  return {
    hand: countsOf(view.player.hand),
    melds: view.player.melds.map((meld) => ({
      kind: meld.kind as PlanMeld["kind"],
      tiles: meld.tiles,
      exposed: meld.exposed,
    })),
    unseen: unseenFor(view),
    draws: Math.max(0, Math.floor(view.wallRemaining / 4)),
    seatWind: seatWindOf(view, seat),
    prevailingWind: view.prevailingWind,
    flowers: view.player.flowers,
    seasons: view.player.seasons,
    ambition: playing(seat, level).ambition,
    excluded: view.excludedHands,
  };
}

function minus(hand: Counts, keys: readonly string[]): Counts | null {
  const next = new Int8Array(hand);
  for (const key of keys) {
    const index = indexOf(key);
    if (next[index]! <= 0) return null;
    next[index]! -= 1;
  }
  return next;
}

/** Value of a 13-effective hand, re-planned from scratch for its melds. */
function holdValue(situation: Situation): number {
  const goals = planGoals(situation);
  return expectedValue(goals, situation.hand, oddsFor(situation));
}

/** Best value over discards for a 14-effective hand, and the tile to throw. */
function discardValues(situation: Situation): Map<string, number> {
  const goals = planGoals(situation);
  const odds = oddsFor(situation);
  const values = new Map<string, number>();
  for (let index = 0; index < KINDS; index++) {
    if (situation.hand[index]! === 0) continue;
    const after = new Int8Array(situation.hand);
    after[index]! -= 1;
    values.set(KEYS[index]!, expectedValue(goals, after, odds));
  }
  return values;
}

/**
 * Points this seat risks by throwing `tile`, from public information only:
 * who is fishing (the table sees the fish, not the wait) and what each
 * opponent has exposed. When exposed sets indicate the tile needed, a
 * discard that lets that player win makes the discarder pay the other
 * losers' debts too, unless the discarder is fishing (I p. 22, R79).
 */
function danger(view: GameView, tile: string, level: BotLevel): number {
  const caution = playing(view.seat, level).caution;
  if (caution === 0) return 0;
  const fishingSelf = view.fishing.some((entry) => entry.seat === view.seat);
  const late = Math.max(0, 1 - view.wallRemaining / 70);
  const suit = /^[bco]/.test(tile) ? tile[0] : null;
  let risk = 0;
  for (const opponent of view.opponents) {
    const fishing = view.fishing.some((entry) => entry.seat === opponent.seat);
    const exposed = opponent.melds.filter((meld) => meld.exposed);
    const suits = new Set(
      exposed.flatMap((meld) => meld.tiles).filter((key) => /^[bco]/.test(key)).map((key) => key[0]),
    );
    const oneSuit = exposed.length > 0 && suits.size <= 1;
    const feeds = oneSuit && (suit === null ? true : suits.has(suit));

    if (exposureIndicates(opponent.melds, tile)) {
      // A careless discard pays two other debts besides one's own.
      const penalty = fishingSelf ? 150 : 600;
      risk += penalty * (fishing ? 1 : 0.25 + 0.5 * late);
    } else if (fishing) {
      risk += feeds ? 80 : 15;
    } else if (feeds && exposed.length >= 2) {
      risk += 25 * (exposed.length - 1) * late;
    }
  }
  return risk * caution;
}

/**
 * Whether to show the fish. Showing it earns the fishing figure if another
 * player wins (C p. 55: it must be shown for a fishing score to be claimed),
 * but tells the table this hand is one tile away, so careful players stop
 * feeding it. A special hand's fishing figure (200 or more) is always worth
 * claiming; an ordinary hand's small figure is kept quiet while the wall is
 * long, the moment depending on the seat's temperament.
 */
function showsFish(
  view: GameView,
  action: Extract<Action, { type: "DeclareFishing" }>,
  level: BotLevel,
): boolean {
  const situation = situationFor(view, view.seat, level);
  const special = action.wait.some((tile) => {
    const pattern = completedPattern(situation, tile);
    return pattern !== null && PATTERN_BY_ID.get(pattern)?.tier !== "calculate";
  });
  if (special) return true;
  return view.wallRemaining <= temperamentOf(view.seat).quietUntil;
}

function chooseDiscard(view: GameView, situation: Situation, level: BotLevel): Action | null {
  const discards = view.legalActions.filter(
    (action): action is Extract<Action, { type: "Discard" }> => action.type === "Discard",
  );
  if (discards.length === 0) return null;

  const fishing = view.fishing.find((entry) => entry.seat === view.seat);
  const fixedWait = new Set(fishing?.wait ?? []);
  const values = discardValues(situation);
  const noise = playing(view.seat, level).noise;
  const spread = noise === 0 ? 0 : noise * Math.max(1, ...values.values());

  let best: Action | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of discards) {
    let score = (values.get(action.tile) ?? 0) - danger(view, action.tile, level);
    if (spread > 0) score += spread * slip(view, action.tile);
    if (fixedWait.has(action.tile)) score -= 1e6;
    // Tie-break: throw the tile with fewer live copies (safer, less useful).
    score -= situation.unseen[indexOf(action.tile)]! * 1e-3;
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }

  // Kongs: the replacement tile is an extra draw.
  const discardBest = bestScore;
  for (const action of view.legalActions) {
    if (action.type !== "ConcealedKong" && action.type !== "AddedKong") continue;
    let next: Situation | null = null;
    if (action.type === "ConcealedKong") {
      const hand = minus(situation.hand, [action.tile, action.tile, action.tile, action.tile]);
      if (hand !== null) {
        next = {
          ...situation,
          hand,
          melds: [...situation.melds, { kind: "kong", tiles: Array(4).fill(action.tile), exposed: false }],
          draws: situation.draws + 1,
        };
      }
    } else {
      const hand = minus(situation.hand, [action.tile]);
      if (hand !== null) {
        next = {
          ...situation,
          hand,
          melds: situation.melds.map((meld) =>
            meld.kind === "pung" && meld.tiles[0] === action.tile
              ? { ...meld, kind: "kong", tiles: [...meld.tiles, action.tile] }
              : meld,
          ),
          draws: situation.draws + 1,
        };
      }
    }
    if (next === null) continue;
    const value = holdValue(next);
    if (value >= discardBest) {
      best = action;
      bestScore = value;
    }
  }
  return best;
}

function chooseClaim(view: GameView, situation: Situation, level: BotLevel): Action | null {
  const claims = view.legalActions.filter(
    (action): action is Extract<Action, { type: "Claim" }> =>
      action.type === "Claim" && action.kind !== "mahjong",
  );
  const pass = view.legalActions.find((action) => action.type === "Pass") ?? null;
  if (claims.length === 0) return pass;
  const tile = view.claimWindow?.tile;
  if (tile === undefined) return pass;

  const stay = holdValue(situation);
  const margin = playing(view.seat, level).callMargin;
  let best: Action | null = pass;
  let bestValue = stay * (1 + margin) + 2;

  for (const claim of claims) {
    const own = [...claim.tiles];
    own.splice(own.indexOf(tile), 1);
    const hand = minus(situation.hand, own);
    if (hand === null) continue;
    const melds: PlanMeld[] = [
      ...situation.melds,
      { kind: claim.kind as PlanMeld["kind"], tiles: claim.tiles, exposed: true },
    ];
    let value: number;
    if (claim.kind === "kong") {
      value = holdValue({ ...situation, hand, melds, draws: situation.draws + 1 });
    } else {
      const after = discardValues({ ...situation, hand, melds });
      value = Math.max(0, ...after.values());
    }
    if (value > bestValue) {
      best = claim;
      bestValue = value;
    }
  }
  return best;
}

/** Goulash: give away the three tiles the hand misses least. */
function chooseExchange(view: GameView, situation: Situation): Action | null {
  const exchanges = view.legalActions.filter(
    (action): action is Extract<Action, { type: "GoulashExchange" }> =>
      action.type === "GoulashExchange",
  );
  if (exchanges.length === 0) return null;
  let hand = situation.hand;
  const given: string[] = [];
  for (let step = 0; step < 3; step++) {
    const goals = planGoals({ ...situation, hand });
    const odds = oddsFor(situation);
    let pick = -1;
    let pickValue = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < KINDS; index++) {
      if (hand[index]! === 0) continue;
      const after = new Int8Array(hand);
      after[index]! -= 1;
      const value = expectedValue(goals, after, odds) - situation.unseen[index]! * 1e-3;
      if (value > pickValue) {
        pick = index;
        pickValue = value;
      }
    }
    if (pick < 0) break;
    given.push(KEYS[pick]!);
    hand = new Int8Array(hand);
    hand[pick]! -= 1;
  }
  const wanted = [...given].sort().join(",");
  return (
    exchanges.find((action) => [...action.tiles].sort().join(",") === wanted) ?? exchanges[0]!
  );
}

export function chooseAction(view: GameView, seat: Seat, level: BotLevel = DEFAULT_BOT_LEVEL): Action | null {
  if (view.seat !== seat) {
    throw new Error(`chooseAction got a view for ${view.seat}, not ${seat}`);
  }
  const legal = view.legalActions;
  if (legal.length === 0) return null;

  const win = legal.find((action) => action.type === "Win");
  if (win !== undefined) return win;
  const mahjong = legal.find((action) => action.type === "Claim" && action.kind === "mahjong");
  if (mahjong !== undefined) return mahjong;

  const fishing = legal.find(
    (action): action is Extract<Action, { type: "DeclareFishing" }> =>
      action.type === "DeclareFishing",
  );
  if (fishing !== undefined && showsFish(view, fishing, level)) return fishing;

  if (view.phase === "announce") {
    return legal.find((action) => action.type === "Pass") ?? legal[0]!;
  }

  const draw = legal.find((action) => action.type === "Draw");
  if (draw !== undefined) return draw;

  const situation = situationFor(view, seat, level);
  if (view.phase === "claim") return chooseClaim(view, situation, level) ?? legal[0]!;
  if (view.phase === "exchange") return chooseExchange(view, situation) ?? legal[0]!;
  return chooseDiscard(view, situation, level) ?? legal[0]!;
}
