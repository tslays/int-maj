/**
 * Taking tiles from the wall: the live end, the loose tiles (Western) or the
 * dead wall (Chinese), and the immediate replacement of flowers and seasons.
 */

import { isBonus, parseTile } from "../tiles.ts";
import type { Event } from "./events.ts";
import type { Seat } from "./state.ts";
import { type Draft, type Emit, draftPlayer } from "./draft.ts";
import { finishDrawn } from "./settle.ts";

/** Refill the loose pair from the replacement end of the wall. */
export function refillLoose(draft: Draft): void {
  if (draft.variant === "chinese") return;
  while (draft.wall.loose.length < 2 && draft.wall.front <= draft.wall.back) {
    draft.wall.loose.push(draft.wall.tiles[draft.wall.back]!);
    draft.wall.back -= 1;
  }
}

export function drawFrom(draft: Draft, end: "front" | "loose"): string | null {
  if (end === "front") {
    if (draft.wall.front > draft.wall.back) {
      // The live wall is gone: the Western loose pair is drawn down last, so
      // no tile is left over when the hand is drawn (I p. 21).
      if (draft.variant === "chinese") return null;
      return draft.wall.loose.shift() ?? null;
    }
    const key = draft.wall.tiles[draft.wall.front]!;
    draft.wall.front += 1;
    return key;
  }
  if (draft.variant === "chinese") {
    return draft.wall.dead?.pop() ?? null;
  }
  if (draft.wall.loose.length === 0) refillLoose(draft);
  const key = draft.wall.loose.shift();
  if (key === undefined) return null;
  if (draft.wall.loose.length === 0) refillLoose(draft);
  return key;
}

function addBonus(draft: Draft, seat: Seat, key: string): void {
  const player = draftPlayer(draft, seat);
  const tile = parseTile(key);
  if (tile.kind === "flower") player.flowers.push(key);
  else player.seasons.push(key);
}

/**
 * Bonus tiles are drawn and replaced immediately. The replacement comes from
 * the loose end (back), like a kong replacement (R-039).
 * Returns the play tile finally held, or null when the wall ran out.
 */
export function replaceBonus(
  draft: Draft,
  seat: Seat,
  tile: string,
  events: Event[],
  emit: Emit,
): string | null {
  let current = tile;
  while (isBonus(parseTile(current))) {
    // Keep the bonus even when no replacement exists: the tile has been
    // turned over, so it belongs to the pool. Dropping it here made the
    // final bonus tile vanish from the 144-tile census.
    addBonus(draft, seat, current);
    const replacement = drawFrom(draft, "loose");
    if (replacement === null) {
      finishDrawn(draft, "wall exhausted while replacing a bonus tile", emit);
      return null;
    }
    emit({ type: "FlowerReplaced", seat, tile: current, replacement });
    current = replacement;
  }
  return current;
}
