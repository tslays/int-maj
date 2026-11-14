/**
 * How a winning hand breaks into its groups, for showing it.
 *
 * The matcher answers "is this hand that pattern" without keeping the
 * partition it found. The result screen wants the partition: a mixed chow
 * (three consecutive numbers, one in each suit) is a set, and sorted by suit
 * its three tiles land far apart. This reads the same declaration the matcher
 * does (`HandPattern.groups`, or a plain four sets and a pair) and returns
 * the first partition that keeps every declared meld as one group.
 *
 * Pure and deterministic; nothing here knows a hand by name.
 */

import { decomposeStandard, type StandardSet } from "./decompose.ts";
import { handTiles, type Hand } from "./hand.ts";
import type { Group } from "./patterns/predicates.ts";
import type { HandPattern } from "./patterns/types.ts";
import { normalizeHand } from "./shape.ts";
import { PLAY_TILE_KEYS, tileKey } from "./tiles.ts";

const ORDER: ReadonlyMap<string, number> = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));

function inTileOrder(keys: readonly string[]): string[] {
  return [...keys].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** A meld's identity as a group: its first three tiles (a kong is a pung with a spare tile), in tile order. */
function signature(keys: readonly string[]): string {
  return inTileOrder(keys.slice(0, 3)).join(",");
}

/** Every partition of `pool` into `groups`, the first that `accept` allows. */
function search(
  pool: Record<string, number>,
  groups: readonly Group[],
  chosen: string[][],
  accept: (chosen: readonly (readonly string[])[]) => boolean,
): boolean {
  if (chosen.length === groups.length) {
    for (const key in pool) if (pool[key] !== 0) return false;
    return accept(chosen);
  }
  for (const option of groups[chosen.length]!.options(pool)) {
    const taken: string[] = [];
    let fits = true;
    for (const key of option) {
      if ((pool[key] ?? 0) <= 0) {
        fits = false;
        break;
      }
      pool[key]! -= 1;
      taken.push(key);
    }
    if (fits) {
      chosen.push([...option]);
      if (search(pool, groups, chosen, accept)) return true;
      chosen.pop();
    }
    for (const key of taken) pool[key]! += 1;
  }
  return false;
}

function setKeys(set: StandardSet): string[] {
  if (set.kind === "chow") {
    const prefix = set.suit === "bamboo" ? "b" : set.suit === "characters" ? "c" : "o";
    return [0, 1, 2].map((offset) => `${prefix}${set.start + offset}`);
  }
  return [set.tile, set.tile, set.tile];
}

/**
 * The concealed part of a winning hand as groups of tile keys, each group in
 * tile order, in the pattern's own order (a pair last). The declared melds are
 * left out: they are shown as they were exposed. Null when no grouping is
 * known (a hand that is not a partition into groups, such as seven pairs), so
 * the caller falls back to a plain sorted row.
 */
export function arrangeConcealed(hand: Hand, pattern: Pick<HandPattern, "groups">): string[][] | null {
  const shape = normalizeHand(hand);
  const melds = hand.melds.map((meld) => signature(meld.tiles.map(tileKey)));

  // A kong's fourth tile sits outside the fourteen the groups describe.
  const pool: Record<string, number> = {};
  for (const tile of handTiles(hand)) pool[tileKey(tile)] = (pool[tileKey(tile)] ?? 0) + 1;
  for (const meld of hand.melds) {
    if (meld.kind === "kong") pool[tileKey(meld.tiles[0]!)]! -= 1;
  }

  /** The partition's groups without the melds, or null when a meld is not one of its groups. */
  const without = (groups: readonly (readonly string[])[]): string[][] | null => {
    const open = melds.slice();
    const rest: string[][] = [];
    for (const group of groups) {
      const at = open.indexOf(signature(group));
      if (at >= 0 && group.length >= 3) open.splice(at, 1);
      else rest.push(inTileOrder(group));
    }
    return open.length === 0 ? rest : null;
  };

  if (pattern.groups !== undefined) {
    for (const reading of pattern.groups(`w${hand.seatWind}`)) {
      let found: string[][] | null = null;
      if (
        search({ ...pool }, reading, [], (chosen) => {
          found = without(chosen);
          return found !== null;
        })
      ) {
        return found;
      }
    }
    return null;
  }

  for (const decomposition of decomposeStandard(shape)) {
    const groups = [...decomposition.sets.map(setKeys), [decomposition.pair, decomposition.pair]];
    const rest = without(groups);
    if (rest !== null) return rest;
  }
  return null;
}
