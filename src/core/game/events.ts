/**
 * The public event log of a hand.
 *
 * Every event is a fact a spectator at the table could have written down:
 * the seat, the tile keys that were shown, and the printed reason. Events
 * never contain another player's concealed hand. A replay reads the log from
 * the top and rebuilds the same state from the seed alone.
 *
 * `seq` is the state's `eventSeq` value before the event was emitted, so a
 * log is strictly ordered and gaps are visible.
 *
 * The rule each event records:
 *   Dealt                 four 13-tile hands (p. 34 deal)
 *   Drew                  an ordinary front draw (p. 34 deal)
 *   FlowerReplaced        bonus tile, immediate replacement (PLAY.md #2)
 *   Discarded             a tile leaves the hand face up
 *   Promoted              a claim moves the turn to the claimant
 *   Claimed               pung/kong/chow, precedence p. 34
 *   KongDeclared          concealed or added kong, replacement from the back
 *   KongReplacementDrawn  the loose tile taken after a kong (p. 34)
 *   FishingDeclared       fixed wait announcement (PLAY.md, fishing)
 *   WinDeclared           mah jong, self-drawn or on the discard
 *   HandScored            highest tier only, never summed
 *   Payments              ledger entries; each names both sides and a reason
 *   DrawnHand             wall exhausted, dealer keeps the deal (p. 34)
 *   NextDeal              the next hand's dealer and hand number
 */

import type { MeldKind } from "../hand.ts";
import type { Tier } from "../patterns/types.ts";
import type { ClaimKind } from "./actions.ts";
import type { LedgerEntry, Seat } from "./state.ts";

export interface EventBase {
  readonly seq: number;
}

export interface DealtEvent extends EventBase {
  readonly type: "Dealt";
  readonly seat: Seat;
  readonly count: number;
}

export interface DrewEvent extends EventBase {
  readonly type: "Drew";
  readonly seat: Seat;
  readonly tile: string;
  /** Front = ordinary draw; back = replacement (p. 34 loose tiles). */
  readonly end: "front" | "loose";
  readonly replacement: boolean;
}

export interface FlowerReplacedEvent extends EventBase {
  readonly type: "FlowerReplaced";
  readonly seat: Seat;
  /** The flower or season just turned over. */
  readonly tile: string;
  /** The loose tile drawn to replace it. */
  readonly replacement: string;
}

export interface DiscardedEvent extends EventBase {
  readonly type: "Discarded";
  readonly seat: Seat;
  readonly tile: string;
}

export interface PromotedEvent extends EventBase {
  readonly type: "Promoted";
  readonly seat: Seat;
  readonly from: Seat;
  readonly kind: ClaimKind;
}

export interface ClaimedEvent extends EventBase {
  readonly type: "Claimed";
  readonly seat: Seat;
  readonly from: Seat;
  readonly kind: MeldKind;
  readonly tiles: readonly string[];
}

export interface KongDeclaredEvent extends EventBase {
  readonly type: "KongDeclared";
  readonly seat: Seat;
  readonly kind: "concealed" | "added";
  readonly tile: string;
}

export interface KongReplacementDrawnEvent extends EventBase {
  readonly type: "KongReplacementDrawn";
  readonly seat: Seat;
  readonly tile: string;
}

export interface FishingDeclaredEvent extends EventBase {
  readonly type: "FishingDeclared";
  readonly seat: Seat;
  readonly wait: readonly string[];
  readonly tier: Tier;
}

export interface WinDeclaredEvent extends EventBase {
  readonly type: "WinDeclared";
  readonly seat: Seat;
  /** Discarder, or null for a self-drawn win. */
  readonly from: Seat | null;
  readonly selfDrawn: boolean;
  readonly tile: string;
  readonly patternId: string;
  readonly tier: Tier;
  readonly points: number | null;
}

export interface HandScoredEvent extends EventBase {
  readonly type: "HandScored";
  readonly seat: Seat;
  readonly patternId: string;
  readonly patternName: string;
  readonly tier: Tier;
  /** Highest matching tier only; null for a Calculate hand. */
  readonly points: number | null;
  readonly matches: readonly string[];
}

export interface PaymentsEvent extends EventBase {
  readonly type: "Payments";
  readonly entries: readonly LedgerEntry[];
}

export interface DrawnHandEvent extends EventBase {
  readonly type: "DrawnHand";
  readonly reason: string;
  /** The dealer keeps the deal after a drawn hand (p. 34). */
  readonly dealer: Seat;
}

export interface NextDealEvent extends EventBase {
  readonly type: "NextDeal";
  readonly dealer: Seat;
  readonly hand: number;
}

export type Event =
  | DealtEvent
  | DrewEvent
  | FlowerReplacedEvent
  | DiscardedEvent
  | PromotedEvent
  | ClaimedEvent
  | KongDeclaredEvent
  | KongReplacementDrawnEvent
  | FishingDeclaredEvent
  | WinDeclaredEvent
  | HandScoredEvent
  | PaymentsEvent
  | DrawnHandEvent
  | NextDealEvent;

export type EventType = Event["type"];
