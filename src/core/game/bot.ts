/**
 * A pure, deterministic console opponent.
 *
 * `chooseAction(view, seat)` takes only a `GameView` (the projection
 * `viewFor` builds for one seat) and returns one action from that view's
 * `legalActions`, or null when the seat has no decision. It never sees the
 * other three concealed hands: opponents arrive as counts, melds and
 * discards, exactly like a human at the table.
 *
 * The policy, in order:
 *   1. Win when a win is legal.
 *   2. Declare fishing when the engine offers it. Fishing is a free mini-win
 *      at settlement and does not restrict later pung/kong claims.
 *   3. Claim a pung or kong only when the call completes a set without
 *      spending the hand's last pair: at least one pair must remain in the
 *      concealed hand. Four sets plus a pair is the skeleton most catalogue
 *      patterns are built on, so this keeps the pair requirement alive while
 *      advancing a set. A kong is preferred when both calls are offered: its
 *      replacement tile is free, and the hand keeps the same skeleton.
 *   4. Draw when the turn calls for it.
 *   5. Discard the least useful tile: keep pairs, triplets and same-suit
 *      neighbours, throw the isolated tile. Ties break in canonical tile
 *      order. A fixed fishing wait is never discarded.
 *
 * This is deliberately shallow. It counts pairs, not shanten or expected
 * value, and it never chows: the policy asked for pung/kong claims, and
 * leaving chow material concealed keeps the run patterns available.
 */

import type { Action } from "./actions.ts";
import type { Seat } from "./state.ts";
import type { GameView } from "./view.ts";
import { PLAY_TILE_KEYS } from "../tiles.ts";

const KEY_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  PLAY_TILE_KEYS.map((key, index) => [key, index]),
);

function keepScore(hand: readonly string[], tile: string): number {
  const copies = hand.filter((key) => key === tile).length;
  let score = (copies - 1) * 6;
  const ranked = /^[bco](\d)$/.exec(tile);
  if (ranked !== null) {
    const suit = tile[0]!;
    const rank = Number(ranked[1]);
    for (const distance of [-2, -1, 1, 2]) {
      const neighbour = rank + distance;
      if (neighbour < 1 || neighbour > 9) continue;
      if (hand.includes(`${suit}${neighbour}`)) score += Math.abs(distance) === 1 ? 3 : 1;
    }
  }
  return score;
}

function chooseDiscard(view: GameView): Action | null {
  const discards = view.legalActions.filter((action) => action.type === "Discard");
  if (discards.length === 0) return null;

  const fishing = view.fishing.find((entry) => entry.seat === view.seat);
  const fixedWait = new Set(fishing?.wait ?? []);
  const keepable = view.player.hand.filter((tile) => !fixedWait.has(tile));
  const candidates = keepable.length > 0 ? keepable : view.player.hand;

  let tile = candidates[0]!;
  let score = Number.POSITIVE_INFINITY;
  for (const candidate of new Set(candidates)) {
    const next = keepScore(candidates, candidate);
    if (next < score || (next === score && (KEY_ORDER[candidate] ?? 99) < (KEY_ORDER[tile] ?? 99))) {
      tile = candidate;
      score = next;
    }
  }
  return discards.find((action) => action.type === "Discard" && action.tile === tile) ?? discards[0]!;
}

export function chooseAction(view: GameView, seat: Seat): Action | null {
  if (view.seat !== seat) {
    throw new Error(`chooseAction got a view for ${view.seat}, not ${seat}`);
  }
  const legal = view.legalActions;
  if (legal.length === 0) return null;

  const win = legal.find((action) => action.type === "Win");
  if (win !== undefined) return win;

  const fishing = legal.find((action) => action.type === "DeclareFishing");
  if (fishing !== undefined) return fishing;

  const claims = legal.filter(
    (action) => action.type === "Claim" && (action.kind === "pung" || action.kind === "kong"),
  );
  if (claims.length > 0) {
    const firstClaim = claims[0]!;
    const tile = firstClaim.type === "Claim" ? firstClaim.tiles[0] : undefined;
    const counts = new Map<string, number>();
    for (const key of view.player.hand) counts.set(key, (counts.get(key) ?? 0) + 1);
    const keepsPair = [...counts].some(([key, count]) => key !== tile && count >= 2);
    if (keepsPair) {
      return (
        claims.find((action) => action.type === "Claim" && action.kind === "kong") ?? claims[0]!
      );
    }
  }

  if (view.phase === "claim" || view.phase === "announce") {
    return legal.find((action) => action.type === "Pass") ?? legal[0]!;
  }

  const draw = legal.find((action) => action.type === "Draw");
  if (draw !== undefined) return draw;

  return chooseDiscard(view) ?? legal[0]!;
}
