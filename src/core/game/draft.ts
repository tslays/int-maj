/**
 * The reducer's working copy and its small tools.
 *
 * `apply` never mutates its input: it clones the state into a `Draft`, a
 * deeply mutable twin, and the handlers change that. This module holds the
 * draft type, the result types of `apply`, and the tile-key helpers every
 * other game module uses.
 */

import { PLAY_TILE_KEYS } from "../tiles.ts";
import type { Event } from "./events.ts";
import { seatIndex, type GameState, type MeldState, type Seat } from "./state.ts";

export interface ApplyOk {
  readonly state: GameState;
  readonly events: readonly Event[];
}

export interface ApplyError {
  readonly error: string;
  readonly state: GameState;
}

export type ApplyResult = ApplyOk | ApplyError;

export function isApplyError(result: ApplyResult): result is ApplyError {
  return "error" in result;
}

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

export type Draft = DeepMutable<GameState>;

type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;

type EventInput = WithoutSeq<Event>;

export type Emit = (event: EventInput) => void;

const KEY_ORDER = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));

export function sortKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => (KEY_ORDER.get(a) ?? 99) - (KEY_ORDER.get(b) ?? 99));
}

export function countOf(keys: readonly string[], key: string): number {
  let count = 0;
  for (const candidate of keys) if (candidate === key) count++;
  return count;
}

export function sameTiles(a: readonly string[], b: readonly string[]): boolean {
  const left = sortKeys(a);
  const right = sortKeys(b);
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function removeKeys(keys: string[], remove: readonly string[]): boolean {
  const copy = keys.slice();
  for (const key of remove) {
    const index = copy.indexOf(key);
    if (index < 0) return false;
    copy.splice(index, 1);
  }
  keys.splice(0, keys.length, ...copy);
  return true;
}

export function draftOf(state: GameState): Draft {
  return structuredClone(state) as unknown as Draft;
}

export function draftPlayer(draft: Draft, seat: Seat): Draft["players"][number] {
  return draft.players[seatIndex(seat)]!;
}

/** Remove the just-discarded tile from the discarder's pile. */
export function takeDiscard(draft: Draft, discarder: Seat, tile: string): void {
  const player = draftPlayer(draft, discarder);
  const index = player.discards.lastIndexOf(tile);
  if (index >= 0) player.discards.splice(index, 1);
}

/**
 * Ground bonus (d), I p. 24: "Claiming first discard made by East Wind". The
 * first discard of a hand is East's, and nothing else has been discarded or
 * claimed before the window on it resolves.
 */
export function noteFirstDiscardClaim(draft: Draft, discarder: Seat, claimant: Seat): void {
  const discards = draft.players.reduce((sum, player) => sum + player.discards.length, 0);
  const melds = draft.players.reduce((sum, player) => sum + player.melds.length, 0);
  if (discarder === draft.dealer && discards === 1 && melds === 0) {
    draft.firstDiscardClaimedBy = claimant;
  }
}

export function addMeld(draft: Draft, seat: Seat, meld: MeldState): void {
  draftPlayer(draft, seat).melds.push({ ...meld, tiles: [...meld.tiles] });
}
