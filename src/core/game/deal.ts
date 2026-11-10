/**
 * Dealing: the first hand of a game, the next hand after a finished one, and
 * when a round and the game end.
 *
 *   - the 144-tile Western deal or 136-tile Chinese deal; East starts at 14
 *     and discards first
 *   - the Wind of the Round advances when East passes; a drawn Western hand
 *     repeats East once and makes the next hand a Goulash with three chosen
 *     three-tile exchanges (R100-R104)
 */

import { DEFAULT_LIMIT } from "../score.ts";
import { isBonus, parseTile, WINDS, tileKey, type Wind } from "../tiles.ts";
import { createRng } from "../rng.ts";
import { createTileSet } from "../tiles.ts";
import type { Event } from "./events.ts";
import { SEATS, type SettlementLevel, type GameState, type Seat } from "./state.ts";
import { type ApplyOk, type Draft, type Emit, draftOf, draftPlayer, sortKeys } from "./draft.ts";
import { drawFrom, refillLoose, replaceBonus } from "./draws.ts";

/**
 * Deal one hand into `draft`. Shared by `newGame` and `nextHand` so the
 * deal, the flower replacements and the RNG bookkeeping cannot drift apart.
 */
export function dealHand(
  draft: Draft,
  seed: string | number,
  rngSteps: number,
  dealer: Seat,
  handNumber: number,
  events: Event[],
  emit: Emit,
): void {
  const rng = createRng(seed);
  for (let step = 0; step < rngSteps; step++) rng.next();
  const set =
    draft.variant === "chinese" || draft.tournament === true
      ? createTileSet().filter((tile) => !isBonus(tile))
      : createTileSet();
  const tiles = rng.shuffle(set).map(tileKey);
  const stepsAfter = rngSteps + (tiles.length - 1);

  draft.seed = seed;
  draft.rngSteps = stepsAfter;
  draft.handNumber = handNumber;
  draft.dealer = dealer;
  draft.players = SEATS.map((seat) => ({
    seat,
    hand: [],
    melds: [],
    flowers: [],
    seasons: [],
    discards: [],
  }));
  if (draft.variant === "chinese") {
    const dead = tiles.slice(tiles.length - 14);
    draft.wall = {
      tiles,
      front: 0,
      back: tiles.length - 14 - 1,
      loose: [],
      dead,
    };
  } else {
    draft.wall = { tiles, front: 0, back: tiles.length - 1, loose: [] };
    refillLoose(draft);
  }
  draft.turn = dealer;
  draft.phase = "discard";
  draft.lastDiscard = null;
  draft.claimWindow = null;
  draft.fishing = [];
  draft.ledger = [];
  draft.lastDraw = null;
  draft.result = null;

  // Four tiles at a time for three rounds (12 each), then one each, then
  // East's extra tile: East starts at 14 and discards first (I p. 18).
  for (let round = 0; round < 3; round++) {
    for (const seat of SEATS) {
      const player = draftPlayer(draft, seat);
      for (let index = 0; index < 4; index++) {
        player.hand.push(drawFrom(draft, "front")!);
      }
    }
  }
  for (const seat of SEATS) {
    draftPlayer(draft, seat).hand.push(drawFrom(draft, "front")!);
  }
  draftPlayer(draft, dealer).hand.push(drawFrom(draft, "front")!);
  for (const seat of SEATS) {
    const player = draftPlayer(draft, seat);
    player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
    emit({ type: "Dealt", seat, count: player.hand.length });
  }

  // Flowers and seasons dealt in the opening hand are replaced immediately.
  for (const seat of SEATS) {
    const player = draftPlayer(draft, seat);
    let index = 0;
    while (index < player.hand.length) {
      const key = player.hand[index]!;
      if (!isBonus(parseTile(key))) {
        index += 1;
        continue;
      }
      player.hand.splice(index, 1);
      const replacement = replaceBonus(draft, seat, key, events, emit);
      if (replacement === null) return;
      player.hand.push(replacement);
      player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
      // Do not advance: the replacement itself may be another bonus.
    }
  }

  if (draft.goulash === true) {
    draft.phase = "exchange";
    draft.turn = dealer;
    draft.goulashStage = 0;
    draft.goulashPicks = {};
    draft.lastDraw = null;
  }
}

export interface NewGameOptions {
  readonly dealer?: Seat;
  readonly variant?: "western" | "chinese";
  readonly limit?: number;
  readonly settlement?: SettlementLevel;
  readonly tournament?: boolean;
  readonly specialHands?: readonly string[];
  readonly goulash?: boolean;
  readonly goulashJokers?: "blank" | "two-bamboo";
  readonly goulashPool?: number;
}

/** Roll two dice per seat; the unique highest total becomes East (I p. 18). */
function rollForSeats(seed: string | number): {
  rolls: Record<Seat, number>;
  dealer: Seat;
} {
  const rng = createRng(`${seed}:seats`);
  for (;;) {
    const rolls = Object.fromEntries(
      SEATS.map((seat) => [seat, rng.int(6) + 1 + rng.int(6) + 1]),
    ) as Record<Seat, number>;
    const best = Math.max(...SEATS.map((seat) => rolls[seat]));
    const winners = SEATS.filter((seat) => rolls[seat] === best);
    if (winners.length === 1) return { rolls, dealer: winners[0]! };
  }
}

/** Start hand 1 from a seed. East starts at 14 and discards first. */
export function newGame(seed: string | number, options: NewGameOptions = {}): ApplyOk {
  if (options.specialHands !== undefined && options.specialHands.length > 14) {
    throw new Error("at most fourteen special hands may be selected");
  }
  const selected = options.dealer === undefined ? rollForSeats(seed) : null;
  const dealer = options.dealer ?? selected!.dealer;
  const events: Event[] = [];
  let seq = 0;
  const emit: Emit = (event) => {
    events.push({ ...event, seq } as Event);
    seq += 1;
  };
  const draft = {
    version: 1,
    seed,
    rngSteps: 0,
    handNumber: 1,
    dealer,
    prevailingWind: "E" as Wind,
    roundDealer: dealer,
    gameOver: false,
    limit: options.tournament === true ? 1000 : (options.limit ?? DEFAULT_LIMIT),
    settlement: options.settlement ?? "intermediate",
    tournament: options.tournament === true,
    recentSpecialHands: [],
    goulash: options.goulash === true,
    goulashPool: options.goulashPool ?? 0,
    drawRepeatUsed: false,
    variant: options.variant ?? "western",
    kitty: 0,
    players: [],
    wall: { tiles: [], front: 0, back: -1 },
    turn: dealer,
    phase: "draw" as const,
    lastDiscard: null,
    claimWindow: null,
    fishing: [],
    ledger: [],
    eventSeq: 0,
    lastDraw: null,
    result: null,
  } as unknown as Draft;
  if (selected !== null) draft.seatSelection = selected;
  if (options.specialHands !== undefined) draft.specialHands = [...options.specialHands];
  if (options.goulashJokers !== undefined) draft.goulashJokers = options.goulashJokers;
  dealHand(draft, seed, 0, dealer, 1, events, emit);
  draft.eventSeq = seq;
  return { state: draft as GameState, events };
}

/**
 * Deal the next hand after a finished one. The dealer repeats only when the
 * dealer won or the hand was drawn (PLAY.md #9, p. 34). Not an Action: the
 * engine exposes it separately so `apply` never invents a deal.
 */
export function nextHand(state: GameState): ApplyOk {
  if (state.phase !== "finished" || state.result === null) {
    throw new Error("nextHand requires a finished hand");
  }
  if (endsGame(state)) throw new Error("the game is over");
  const dealer = state.result.nextDealer;
  const draft = draftOf(state);
  if (endsRound(state)) {
    draft.prevailingWind = WINDS[WINDS.indexOf(state.prevailingWind) + 1]!;
    draft.roundDealer = dealer;
  }
  draft.drawRepeatUsed = state.result.kind === "drawn" && dealer === state.dealer;
  draft.goulash = state.result.goulash === true;
  const events: Event[] = [];
  let seq = state.eventSeq;
  const emit: Emit = (event) => {
    events.push({ ...event, seq } as Event);
    seq += 1;
  };
  emit({ type: "NextDeal", dealer, hand: state.handNumber + 1 });
  dealHand(draft, state.seed, state.rngSteps, dealer, state.handNumber + 1, events, emit);
  draft.eventSeq = seq;
  return { state: draft as GameState, events };
}

/**
 * R-032: a round is finished when each player has completed a turn as East
 * Wind. The deal passes one seat at a time (R-030), so the round ends with the
 * finished hand whose next dealer is the seat that opened the round.
 */
export function endsRound(state: GameState): boolean {
  if (state.phase !== "finished" || state.result === null) return false;
  const next = state.result.nextDealer;
  return next !== state.dealer && next === (state.roundDealer ?? "E");
}

/**
 * R-032: "A game ends ... when East, South, West and North have all been the
 * Wind of the Round" - the hand that finishes the North round finishes the
 * game, and no further hand is dealt.
 */
export function endsGame(state: GameState): boolean {
  if (state.gameOver === true) return true;
  return endsRound(state) && state.prevailingWind === WINDS[WINDS.length - 1];
}
