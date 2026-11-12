/**
 * The complete, JSON-serialisable state of one hand.
 *
 * Design rule: the state is the whole game. There are no closures, no live
 * objects, no clock and no ambient RNG. `deserialize(serialize(state))` is
 * the identity, and the next `apply` can run in a fresh process.
 *
 * Seats are fixed table positions E, S, W, N. The dealer is East for the
 * hand; the other seat winds rotate with the deal, which is why `seatWindOf`
 * is derived from the dealer rather than stored on each player.
 *
 * Wall layout (rules/RULES.md): `tiles` is the shuffled set. Ordinary draws
 * take `tiles[front++]`; Western replacements take `loose` (refilled from
 * `back`), Chinese kong replacements take `dead`. The live wall is exhausted
 * when `front > back`.
 *
 * Every field encodes a rule from rules/RULES.md:
 *   dealer / prevailingWind  round wind and dealer rotation
 *   wall.front / wall.back   live wall; loose pairs and the Chinese dead wall
 *   fishing                  announced state of needing one tile
 *   ledger                   payments that sum to zero
 *   variant                  Western (default) or Chinese
 *   eventSeq                 next event number for replay ordering
 */

import type { MeldKind } from "../hand.ts";
import type { Tier } from "../patterns/types.ts";
import { WINDS, type Wind } from "../tiles.ts";
import type { ClaimKind } from "./actions.ts";

export const SEATS = ["E", "S", "W", "N"] as const;
export type Seat = (typeof SEATS)[number];

/** Whose decision the table is waiting for. */
export type Phase = "draw" | "discard" | "announce" | "claim" | "exchange" | "finished";

/** Settlement level agreed before play (I p. 24, R94). */
export type SettlementLevel = "beginner" | "intermediate" | "advanced";

export interface MeldState {
  readonly kind: MeldKind;
  /** Canonical tile keys, in the order the meld was formed. */
  readonly tiles: readonly string[];
  readonly exposed: boolean;
}

export interface PlayerState {
  readonly seat: Seat;
  /** Concealed play tiles, canonical order. */
  readonly hand: readonly string[];
  readonly melds: readonly MeldState[];
  readonly flowers: readonly string[];
  readonly seasons: readonly string[];
  readonly discards: readonly string[];
}

export interface ClaimRecord {
  readonly seat: Seat;
  readonly kind: ClaimKind;
  readonly tiles: readonly string[];
}

/**
 * An open claim window. Every eligible seat answers once; `claims` keeps the
 * answers so precedence can be resolved after the last response.
 */
export interface ClaimWindow {
  readonly discarder: Seat;
  readonly tile: string;
  readonly pending: readonly Seat[];
  readonly claims: readonly ClaimRecord[];
  /** A discard window by default; "kong" is a rob-the-kong window. */
  readonly kind?: "discard" | "kong";
  /** Present on a rob window: the added kong that may be robbed. */
  readonly kong?: {
    readonly seat: Seat;
    readonly tile: string;
    readonly meldIndex: number;
  };
}

export interface FishingState {
  readonly seat: Seat;
  readonly wait: readonly string[];
  /** Tier of the hand the player announced for. */
  readonly tier: Tier;
  /** Printed fishing figure, or null when unknown. */
  readonly value?: number | null;
}

/** Why one seat pays another; the table shows each kind in plain words. */
export type LedgerKind =
  | "win" /* a loser pays the winner (I p. 21 #24) */
  | "careless" /* a careless discarder pays another loser's debt (I p. 22) */
  | "fishing" /* a fishing hand is paid by the other losers (I p. 21, 24, 32) */
  | "difference" /* advanced: the losers settle their losing hands (I p. 24) */
  | "goulash" /* the Goulash pool goes to the winner (I p. 21) */
  | "too-many-tiles" /* a player with too many tiles pays everyone (I p. 22) */
  | "false-mahjong"; /* a false Mah Jong pays a half limit to each other player */

export interface LedgerEntry {
  readonly from: Seat;
  readonly to: Seat;
  /** null means a Calculate figure the caller must supply. */
  readonly points: number | null;
  readonly reason: string;
  readonly kind: LedgerKind;
  /** East paid or received double on this payment (I p. 21 #24). */
  readonly doubled?: boolean;
  /** "careless": the loser whose debt `from` is also paying. */
  readonly covers?: Seat;
  /** "fishing": the tier of the hand `to` was fishing for. */
  readonly tier?: Tier;
}

export interface HandResult {
  readonly kind: "win" | "drawn";
  readonly winner: Seat | null;
  /** Discarder for an on-discard win, null otherwise. */
  readonly from: Seat | null;
  readonly selfDrawn: boolean;
  readonly patternId: string | null;
  readonly patternName: string | null;
  readonly tier: Tier | null;
  readonly points: number | null;
  /** Calculated hand: ground score before doubling; null for a printed tier. */
  readonly ground: number | null;
  /** Calculated hand: number of doubles; null for a printed tier. */
  readonly doubles: number | null;
  /** Calculated hand: ground x 2^doubles before the limit cap. */
  readonly raw: number | null;
  /** The limit used for this hand. */
  readonly limit: number;
  /** Dealer of the next hand: repeats on a dealer win or a drawn hand. */
  readonly nextDealer: Seat;
  readonly reason: string;
  /** A drawn Western hand is followed by a Goulash. */
  readonly goulash?: boolean;
}

export interface GameState {
  readonly version: 1;
  readonly seed: string | number;
  /** Number of RNG `next()` calls consumed by the shuffle. */
  readonly rngSteps: number;
  readonly handNumber: number;
  readonly dealer: Seat;
  readonly prevailingWind: Wind;
  /** The game ends after the North round; no further hand may be dealt. */
  readonly gameOver?: boolean;
  /**
   * The seat that dealt the first hand of the current round. R-032: "A round
   * is finished when each player has completed a turn as East Wind", so the
   * Wind of the Round advances when the deal passes back to this seat.
   * Absent on states saved before it existed; those read it as "E".
   */
  readonly roundDealer?: Seat;
  /** Agreed limit for ordinary-hand scoring (I p. 24, R93). */
  readonly limit?: number;
  /** R94: beginner pays the winner, intermediate also fishing, advanced all. */
  readonly settlement?: SettlementLevel;
  /** R105: tournament profile. */
  readonly tournament?: boolean;
  /** R105(7): selected special hands, at most fourteen. */
  readonly specialHands?: readonly string[];
  /**
   * House rule: hands this table plays without. They are no win, no wait and
   * no fishing hand for anyone; a hand that also makes another pattern scores
   * as that one. Set at the deal, so it never changes inside a hand.
   */
  readonly excludedHands?: readonly string[];
  /** R105(8): recent winning pattern ids, newest last. */
  readonly recentSpecialHands?: readonly string[];
  /** R103: four blank jokers or four 2 Bamboos. */
  readonly goulashJokers?: "blank" | "two-bamboo";
  /** R104: each player's pool counter for the Goulash. */
  readonly goulashPool?: number;
  /** R100: 0 opposite, 1 East/South and West/North, 2 East/North and West/South. */
  readonly goulashStage?: 0 | 1 | 2;
  /** Picks already submitted in the current Goulash exchange. */
  readonly goulashPicks?: Partial<Record<Seat, readonly string[]>>;
  /** A drawn Western hand repeats the dealer only once. */
  readonly drawRepeatUsed?: boolean;
  /** Western by default; the Chinese drawn hand keeps East and adds a kitty. */
  readonly variant?: "western" | "chinese";
  /** Stakes accumulated in the Chinese kitty. */
  readonly kitty?: number;
  /** The next hand is a Goulash: no chow claims, no no-chow double. */
  readonly goulash?: boolean;
  /** Dice roll and East's chosen seat for the game, when the deal selected it. */
  readonly seatSelection?: {
    /** The throw that decided it: each seat's two-dice total. */
    readonly rolls: Readonly<Record<Seat, number>>;
    readonly dealer: Seat;
    /**
     * Every throw, oldest first, each seat's two dice. A tie for the highest
     * total is thrown again by all four (an assumption: the book is silent),
     * so the last entry is the throw that decided it. Absent in states saved
     * before the dice were shown.
     */
    readonly throws?: readonly Readonly<Record<Seat, readonly [number, number]>>[];
  };
  readonly players: readonly PlayerState[];
  readonly wall: {
    readonly tiles: readonly string[];
    /** First live tile at the open (dealing) end. */
    readonly front: number;
    /** Last live tile at the replacement end. */
    readonly back: number;
    /** The loose tiles lifted at the break; replacements come from here. */
    readonly loose: readonly string[];
    /** Chinese game: the last 14 tiles, used only for kong replacements. */
    readonly dead?: readonly string[];
  };
  readonly turn: Seat;
  readonly phase: Phase;
  readonly lastDiscard: { readonly seat: Seat; readonly tile: string } | null;
  readonly claimWindow: ClaimWindow | null;
  readonly fishing: readonly FishingState[];
  readonly ledger: readonly LedgerEntry[];
  readonly eventSeq: number;
  /** The tile most recently drawn by `seat`, for a self-drawn win. */
  readonly lastDraw: {
    readonly seat: Seat;
    readonly tile: string;
    readonly end: "front" | "loose";
  } | null;
  readonly result: HandResult | null;
}

export function seatIndex(seat: Seat): number {
  const index = SEATS.indexOf(seat);
  if (index < 0) throw new Error(`Unknown seat: ${String(seat)}`);
  return index;
}

export function nextSeat(seat: Seat): Seat {
  return SEATS[(seatIndex(seat) + 1) % SEATS.length]!;
}

/** Seat wind: the dealer is East, the next seat South, and so on. */
export function seatWindOf(state: GameState, seat: Seat): Wind {
  const offset = (seatIndex(seat) - seatIndex(state.dealer) + SEATS.length) % SEATS.length;
  return WINDS[offset]!;
}

export function playerOf(state: GameState, seat: Seat): PlayerState {
  return state.players[seatIndex(seat)]!;
}

/** Live tiles between the two ends, inclusive of both. */
export function wallRemaining(state: GameState): number {
  return Math.max(0, state.wall.back - state.wall.front + 1);
}

/**
 * Tiles still to be drawn by anyone. In the Western game the loose pair is
 * part of the wall ("all tiles have been drawn", I p. 21), so it counts and is
 * drawn last; the Chinese game never uses its dead wall for ordinary draws.
 */
export function tilesLeft(state: GameState): number {
  const loose = state.variant === "chinese" ? 0 : state.wall.loose.length;
  return wallRemaining(state) + loose;
}

/** Effective tile count: physical tiles minus one per declared kong. */
export function effectiveCount(player: PlayerState): number {
  const physical =
    player.hand.length + player.melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
  const kongs = player.melds.filter((meld) => meld.kind === "kong").length;
  return physical - kongs;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse a serialised state. Throws only for a shape that is not a game. */
export function deserialize(json: string): GameState {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null) {
    throw new Error("Not a serialised game state");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error("Unsupported game state version");
  if (!Array.isArray(record.players) || record.players.length !== SEATS.length) {
    throw new Error("Game state must have four players");
  }
  if (typeof record.wall !== "object" || record.wall === null) {
    throw new Error("Game state is missing the wall");
  }
  if (typeof record.phase !== "string") throw new Error("Game state is missing a phase");
  if (typeof record.turn !== "string") throw new Error("Game state is missing a turn");
  return value as GameState;
}
