/**
 * Every action a seat may take right now.
 *
 * The list is the single source of truth for bots and UIs: `apply` accepts
 * exactly the actions this module offers, and each chow variant is listed
 * separately because the two other tiles identify which chow is meant.
 *
 * Phases (see state.ts):
 *   draw     the turn seat must draw from the front
 *   discard  the turn seat discards, or declares a kong/win
 *   announce the discarder may fix a fishing wait (or pass)
 *   claim    each eligible seat answers once; precedence resolves after all
 */

import { wallRemaining, type GameState, type Seat } from "./state.ts";
import type { Action } from "./actions.ts";
import {
  claimOptions,
  fishingDeclarationFor,
  handIsComplete,
  sortKeys,
  waitsOf,
} from "./reduce.ts";

function distinct(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

export function legalActions(state: GameState, seat: Seat): Action[] {
  if (state.phase === "finished") return [];

  if (state.phase === "draw") {
    return state.turn === seat ? [{ type: "Draw", seat }] : [];
  }

  if (state.phase === "discard") {
    if (state.turn !== seat) return [];
    const player = state.players.find((candidate) => candidate.seat === seat)!;
    const actions: Action[] = distinct(player.hand).map((tile) => ({
      type: "Discard",
      seat,
      tile,
    }));

    if (wallRemaining(state) > 0 || state.wall.loose.length > 0) {
      for (const tile of distinct(player.hand)) {
        const copies = player.hand.filter((key) => key === tile).length;
        if (copies === 4) actions.push({ type: "ConcealedKong", seat, tile });
      }
      for (const meld of player.melds) {
        if (meld.kind !== "pung") continue;
        const tile = meld.tiles[0]!;
        if (player.hand.includes(tile)) actions.push({ type: "AddedKong", seat, tile });
      }
    }

    if (
      state.lastDraw !== null &&
      state.lastDraw.seat === seat &&
      handIsComplete(state, seat, state.lastDraw.tile) !== null
    ) {
      actions.push({ type: "Win", seat, kind: "self-drawn" });
    }
    return actions;
  }

  if (state.phase === "announce") {
    if (state.turn !== seat) return [];
    const declaration = fishingDeclarationFor(state, seat);
    const actions: Action[] = [];
    if (declaration !== null) {
      actions.push({
        type: "DeclareFishing",
        seat,
        wait: sortKeys(declaration.wait),
      });
    }
    actions.push({ type: "Pass", seat });
    return actions;
  }

  if (state.phase === "claim") {
    const window = state.claimWindow;
    if (window === null || state.turn !== seat || window.pending[0] !== seat) return [];
    const options = claimOptions(state, seat, window.tile, window.discarder, window.kind);
    const actions: Action[] = options.map((option) => ({
      type: "Claim",
      seat,
      kind: option.kind,
      tiles: option.tiles,
    }));
    if (options.some((option) => option.kind === "mahjong")) {
      actions.push({ type: "Win", seat, kind: "on-discard" });
    }
    actions.push({ type: "Pass", seat });
    return actions;
  }

  return [];
}

/** True when the seat has any legal action, used by tests and simple UIs. */
export function hasLegalAction(state: GameState, seat: Seat): boolean {
  return legalActions(state, seat).length > 0;
}

/** Waits for the turn seat, exposed for a table-side hint. */
export function waitsFor(state: GameState, seat: Seat): string[] {
  return waitsOf(state, seat);
}
