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
 * Wall layout (p. 34): `tiles` is the shuffled wall. Ordinary draws take
 * `tiles[front++]`; kong and flower replacements take `tiles[back--]`. The
 * wall is exhausted when `front > back`.
 *
 * Every field encodes a rule from rules/archive/PLAY.md:
 *   dealer / prevailingWind  East round, dealer repeats only on a win (#9)
 *   wall.front / wall.back   loose tiles for kongs (#4)
 *   fishing                  announced, fixed wait (fishing DECIDED)
 *   ledger                   payments that sum to zero (#8)
 *   eventSeq                 next event number for replay ordering
 */

import type { MeldKind } from "../hand.ts";
import type { Tier } from "../patterns/types.ts";
import { WINDS, type Wind } from "../tiles.ts";
import type { ClaimKind } from "./actions.ts";

export const SEATS = ["E", "S", "W", "N"] as const;
export type Seat = (typeof SEATS)[number];

/** Whose decision the table is waiting for. */
export type Phase = "draw" | "discard" | "announce" | "claim" | "finished";

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

export interface LedgerEntry {
  readonly from: Seat;
  readonly to: Seat;
  /** null means a Calculate figure the caller must supply. */
  readonly points: number | null;
  readonly reason: string;
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
    readonly rolls: Readonly<Record<Seat, number>>;
    readonly dealer: Seat;
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
