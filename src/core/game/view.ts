/**
 * Hidden-information projection for one seat.
 *
 * A UI must never receive another player's concealed hand. The view gives the
 * viewer their own hand, every exposed meld, all discards, wall counts, whose
 * turn it is and the viewer's legal actions. Opponents are reduced to a hand
 * count. The claim window is shown without the claims already made, because a
 * pending claim is information the table has not been given yet.
 */

import type { Tier } from "../patterns/types.ts";
import type { Wind } from "../tiles.ts";
import type {
  MeldState,
  Phase,
  Seat,
  LedgerEntry,
  HandResult,
  FishingState,
  GameState,
} from "./state.ts";
import type { Action } from "./actions.ts";
import { seatIndex, wallRemaining } from "./state.ts";
import { legalActions } from "./legal.ts";

export interface PlayerView {
  readonly seat: Seat;
  readonly hand: readonly string[];
  readonly melds: readonly MeldState[];
  readonly flowers: readonly string[];
  readonly seasons: readonly string[];
  readonly discards: readonly string[];
}

export interface OpponentView {
  readonly seat: Seat;
  readonly handCount: number;
  readonly melds: readonly MeldState[];
  readonly flowers: readonly string[];
  readonly seasons: readonly string[];
  readonly discards: readonly string[];
}

export interface ClaimWindowView {
  readonly discarder: Seat;
  readonly tile: string;
  readonly pending: readonly Seat[];
}

export interface GameView {
  readonly seat: Seat;
  readonly handNumber: number;
  readonly dealer: Seat;
  readonly prevailingWind: Wind;
  readonly turn: Seat;
  readonly phase: Phase;
  readonly player: PlayerView;
  readonly opponents: readonly OpponentView[];
  readonly wallRemaining: number;
  readonly lastDiscard: { readonly seat: Seat; readonly tile: string } | null;
  /** The viewer's own last drawn tile, for the just-drawn marker. */
  readonly lastDraw: {
    readonly seat: Seat;
    readonly tile: string;
    readonly end: "front" | "back";
  } | null;
  readonly claimWindow: ClaimWindowView | null;
  readonly fishing: readonly FishingState[];
  readonly ledger: readonly LedgerEntry[];
  readonly result: HandResult | null;
  readonly legalActions: readonly Action[];
  readonly fishingTier: Tier | null;
}

function copyMelds(melds: readonly MeldState[]): MeldState[] {
  return melds.map((meld) => ({
    kind: meld.kind,
    tiles: [...meld.tiles],
    exposed: meld.exposed,
  }));
}

export function viewFor(state: GameState, seat: Seat): GameView {
  seatIndex(seat);
  const own = state.players[seatIndex(seat)]!;
  const opponents: OpponentView[] = [];
  for (const player of state.players) {
    if (player.seat === seat) continue;
    opponents.push({
      seat: player.seat,
      handCount: player.hand.length,
      melds: copyMelds(player.melds),
      flowers: [...player.flowers],
      seasons: [...player.seasons],
      discards: [...player.discards],
    });
  }

  return {
    seat,
    handNumber: state.handNumber,
    dealer: state.dealer,
    prevailingWind: state.prevailingWind,
    turn: state.turn,
    phase: state.phase,
    player: {
      seat,
      hand: [...own.hand],
      melds: copyMelds(own.melds),
      flowers: [...own.flowers],
      seasons: [...own.seasons],
      discards: [...own.discards],
    },
    opponents,
    wallRemaining: wallRemaining(state),
    lastDiscard: state.lastDiscard === null ? null : { ...state.lastDiscard },
    lastDraw:
      state.lastDraw === null ? null : { ...state.lastDraw },
    claimWindow:
      state.claimWindow === null
        ? null
        : {
            discarder: state.claimWindow.discarder,
            tile: state.claimWindow.tile,
            pending: [...state.claimWindow.pending],
          },
    fishing: state.fishing.map((entry) => ({
      seat: entry.seat,
      wait: [...entry.wait],
      tier: entry.tier,
    })),
    ledger: state.ledger.map((entry) => ({ ...entry })),
    result: state.result === null ? null : { ...state.result },
    legalActions: legalActions(state, seat),
    fishingTier: state.fishing.find((entry) => entry.seat === seat)?.tier ?? null,
  };
}
