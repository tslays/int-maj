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
  GameState,
} from "./state.ts";
import type { Action } from "./actions.ts";
import { seatIndex, wallRemaining } from "./state.ts";
import { legalActions } from "./legal.ts";
import { goulashPartner } from "./reduce.ts";
import { drawOnlyWaits, exclusionsOf, fishingDeclarationFor, hasRule, WIN_NEEDS_FISH } from "./hands.ts";

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

/**
 * A fishing declaration as one seat sees it. The table sees only that a seat
 * is fishing (the Companion's displayed fish, C p. 55); the wait and the
 * hand's tier stay with the fishing player.
 */
export interface FishingView {
  readonly seat: Seat;
  /** The viewer's own wait; empty for another seat. */
  readonly wait: readonly string[];
  /** The viewer's own fishing tier; null for another seat. */
  readonly tier: Tier | null;
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
    readonly end: "front" | "loose";
  } | null;
  readonly claimWindow: ClaimWindowView | null;
  readonly fishing: readonly FishingView[];
  readonly ledger: readonly LedgerEntry[];
  readonly result: HandResult | null;
  readonly legalActions: readonly Action[];
  readonly fishingTier: Tier | null;
  /**
   * While you may announce fishing: the tiles of your wait that win only when
   * you draw them yourself (a self-drawn-only hand such as Buried Treasure), so
   * the same tile discarded by another player is no win. Empty otherwise.
   */
  readonly fishingDrawOnly: readonly string[];
  /** During a Goulash: which of the three exchanges, and your partner in it. */
  readonly goulash: { readonly stage: 0 | 1 | 2; readonly partner: Seat } | null;
  /**
   * House rules: hands this hand is played without (public, the same for
   * every seat), by id or as a tier (`tierExclusion`, e.g. half limit in a
   * Goulash). Pass it to the matcher as `excluded`.
   */
  readonly excludedHands: readonly string[];
  /** House rule `WIN_NEEDS_FISH`: a player offered the fishing announcement goes out only after showing the fish. */
  readonly winNeedsFish: boolean;
}

/** The draw-only tiles of the wait this seat may announce now, else none. */
function drawOnlyOffer(state: GameState, seat: Seat): string[] {
  if (state.phase !== "announce" || state.turn !== seat) return [];
  const declaration = fishingDeclarationFor(state, seat);
  return declaration === null ? [] : drawOnlyWaits(state, seat, declaration.wait);
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
    // Only your own draw: another seat's drawn tile is concealed.
    lastDraw:
      state.lastDraw === null || state.lastDraw.seat !== seat ? null : { ...state.lastDraw },
    claimWindow:
      state.claimWindow === null
        ? null
        : {
            discarder: state.claimWindow.discarder,
            tile: state.claimWindow.tile,
            pending: [...state.claimWindow.pending],
          },
    fishing: state.fishing.map((entry) =>
      entry.seat === seat
        ? { seat: entry.seat, wait: [...entry.wait], tier: entry.tier }
        : { seat: entry.seat, wait: [], tier: null },
    ),
    ledger: state.ledger.map((entry) => ({ ...entry })),
    result: state.result === null ? null : { ...state.result },
    legalActions: legalActions(state, seat),
    fishingTier: state.fishing.find((entry) => entry.seat === seat)?.tier ?? null,
    fishingDrawOnly: drawOnlyOffer(state, seat),
    goulash:
      state.phase === "exchange"
        ? { stage: state.goulashStage ?? 0, partner: goulashPartner(state.goulashStage ?? 0, seat) }
        : null,
    excludedHands: [...exclusionsOf(state)],
    winNeedsFish: hasRule(state, WIN_NEEDS_FISH),
  };
}
