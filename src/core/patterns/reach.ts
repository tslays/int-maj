/**
 * How near a set of tiles is to a hand that is a partition into groups.
 *
 * Many catalogue hands are declared as a list of groups (`Group`: "a mixed
 * chow", "a pung of any dragon", "a pair of the own wind", ...). This module
 * reads that same declaration the other way round: instead of asking whether
 * a finished hand is a partition into the groups, it asks which partition is
 * nearest to the tiles a player holds, and how many tiles that partition
 * still lacks. It is exact: it searches every partition, pruned only by a
 * tile budget, never a sample of them. Nothing in it knows a hand by name.
 *
 * Pure and deterministic.
 */

import { PLAY_TILE_KEYS } from "../tiles.ts";
import type { Group, Pool } from "./predicates.ts";

const KINDS = PLAY_TILE_KEYS.length;
const INDEX: ReadonlyMap<string, number> = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));

/** A pool with every tile at four copies: asks a group for all the options it can ever offer. */
const FULL_POOL: Pool = Object.freeze(Object.fromEntries(PLAY_TILE_KEYS.map((key) => [key, 4])));

/** One way a group can be filled: its tiles by index, and a signature for symmetry checks. */
interface Option {
  readonly tiles: readonly number[];
  readonly signature: string;
}

interface Slot {
  readonly options: readonly Option[];
  /** Groups with the same options are interchangeable; they are filled in option order. */
  readonly twin: string;
}

const OPTIONS = new WeakMap<Group, readonly Option[]>();

function optionsOf(group: Group): readonly Option[] {
  const cached = OPTIONS.get(group);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const options: Option[] = [];
  for (const keys of group.options(FULL_POOL)) {
    const tiles = keys.map((key) => INDEX.get(key)!).sort((a, b) => a - b);
    const signature = tiles.join(",");
    if (seen.has(signature)) continue;
    seen.add(signature);
    options.push({ tiles, signature });
  }
  // A kong is a pung with a fourth tile: a fifteen-tile hand, outside the fourteen tiles counted here.
  const hasSmallerTwin = (option: Option): boolean =>
    option.tiles.some((tile, at) => {
      if (at > 0 && option.tiles[at - 1] === tile) return false;
      return seen.has(option.tiles.filter((_, index) => index !== at).join(","));
    });
  const counted = options.filter((option) => !hasSmallerTwin(option));
  OPTIONS.set(group, counted);
  return counted;
}

const SLOTS = new WeakMap<readonly Group[], readonly Slot[]>();

/** A reading's groups, fewest options first so the search narrows early. */
function slotsOf(groups: readonly Group[]): readonly Slot[] {
  const cached = SLOTS.get(groups);
  if (cached !== undefined) return cached;
  const slots = groups
    .map((group) => {
      const options = optionsOf(group);
      return { options, twin: options.map((option) => option.signature).join(";") };
    })
    .sort((a, b) => a.options.length - b.options.length || (a.twin < b.twin ? -1 : a.twin > b.twin ? 1 : 0));
  SLOTS.set(groups, slots);
  return slots;
}

/** Work that depends only on the held tiles, shared by searches that use the same ones. */
export interface ReachCache {
  readonly ranking: Map<readonly Option[], { options: readonly Option[]; lacking: readonly number[] }>;
}

export function reachCache(): ReachCache {
  return { ranking: new Map() };
}

export interface ReachInput {
  /** The hand's alternative readings, each a list of groups that must all be filled. */
  readonly alternatives: readonly (readonly Group[])[];
  /** Concealed tiles in hand, by `PLAY_TILE_KEYS` index. */
  readonly held: ArrayLike<number>;
  /** Copies of each tile that can still arrive (not seen by the player), by index. */
  readonly spare: ArrayLike<number>;
  /** Declared melds, each as its tile keys; a meld fills one group exactly and cannot be regrouped. */
  readonly melds: readonly (readonly string[])[];
  /** Search up to this many missing tiles. */
  readonly budget: number;
  /** Keep at most this many partitions at the nearest distance. */
  readonly keep: number;
  /** Shared between searches over the same `held` tiles; omit to search on its own. */
  readonly cache?: ReachCache;
}

export interface Reach {
  /** Tiles still missing at the nearest partition. */
  readonly missing: number;
  /** The concealed tiles each nearest partition wants, by index (the meld tiles excluded). */
  readonly wants: readonly Int8Array[];
}

/**
 * The partition nearest to the held tiles within the budget, or null when
 * every partition lacks more than the budget (or needs a tile that can no
 * longer be had). `wants` lists the nearest partitions (up to `keep` of them,
 * each distinct as a tile count).
 */
export function nearest(input: ReachInput): Reach | null {
  const { held, spare, budget, keep } = input;
  const meldSignatures = input.melds.map((keys) =>
    keys
      .slice(0, 3)
      .map((key) => INDEX.get(key)!)
      .sort((a, b) => a - b)
      .join(","),
  );

  let best = budget;
  let hit = false;
  let found: Int8Array[] = [];
  const seen = new Set<string>();
  const used = new Int8Array(KINDS);

  /** The tiles an option lacks on its own. Beside other groups it can only lack more. */
  const alone = (option: Option): number => {
    let added = 0;
    for (let at = 0; at < option.tiles.length; at++) {
      const tile = option.tiles[at]!;
      let copy = 1;
      while (at - copy >= 0 && option.tiles[at - copy] === tile) copy += 1;
      if (copy > held[tile]!) added += 1;
    }
    return added;
  };

  /** A group's options from the least lacking: the search stops reading them once one is too dear. */
  const ranking = input.cache?.ranking ?? new Map<readonly Option[], { options: readonly Option[]; lacking: readonly number[] }>();
  const rank = (slot: Slot): { options: readonly Option[]; lacking: readonly number[] } => {
    let ranked = ranking.get(slot.options);
    if (ranked === undefined) {
      const scored = slot.options
        .map((option, order) => ({ option, order, lacking: alone(option) }))
        .sort((a, b) => a.lacking - b.lacking || a.order - b.order);
      ranked = { options: scored.map((entry) => entry.option), lacking: scored.map((entry) => entry.lacking) };
      ranking.set(slot.options, ranked);
    }
    return ranked;
  };

  /**
   * Fills the remaining slots from `slot` on; `cost` tiles are missing so far.
   * `rest[slot]` is the least that slots from `slot` on can still add (each
   * taken alone at its cheapest option), so a branch that cannot finish
   * within the best known distance is dropped at once.
   */
  const fill = (
    slots: readonly Slot[],
    skip: ReadonlySet<number>,
    rest: readonly number[],
    slot: number,
    floor: number,
    cost: number,
  ): void => {
    while (slot < slots.length && skip.has(slot)) slot += 1;
    // Past `keep` equally near partitions only a nearer one is worth finding.
    if (cost + rest[slot]! > (found.length >= keep ? best - 1 : best)) return;
    if (slot === slots.length) {
      if (cost > best) return;
      if (cost < best || !hit) {
        best = cost;
        hit = true;
        found = [];
        seen.clear();
      }
      const key = used.join(",");
      if (found.length < keep && !seen.has(key)) {
        seen.add(key);
        found.push(new Int8Array(used));
      }
      return;
    }
    const current = slots[slot]!;
    const { options, lacking } = rank(current);
    const after = rest[slot + 1]!;
    // An interchangeable twin just filled is not filled again with an earlier option.
    let previous = slot - 1;
    while (previous >= 0 && skip.has(previous)) previous -= 1;
    const start = previous >= 0 && slots[previous]!.twin === current.twin ? floor : 0;
    for (let at = start; at < options.length; at++) {
      if (cost + lacking[at]! + after > (found.length >= keep ? best - 1 : best)) break;
      const option = options[at]!;
      let added = 0;
      let feasible = true;
      let taken = 0;
      for (const tile of option.tiles) {
        used[tile]! += 1;
        taken += 1;
        if (used[tile]! > held[tile]!) added += 1;
        if (used[tile]! > held[tile]! + spare[tile]!) {
          feasible = false;
          break;
        }
      }
      if (feasible && cost + added <= best) fill(slots, skip, rest, slot + 1, at, cost + added);
      for (let index = 0; index < taken; index++) used[option.tiles[index]!]! -= 1;
    }
  };

  /** Seats each meld in a group it fills exactly, then fills the groups left. */
  const seat = (slots: readonly Slot[], skip: Set<number>, meld: number): void => {
    if (meld === meldSignatures.length) {
      const rest: number[] = new Array(slots.length + 1).fill(0);
      for (let slot = slots.length - 1; slot >= 0; slot--) {
        rest[slot] = rest[slot + 1]! + (skip.has(slot) ? 0 : (rank(slots[slot]!).lacking[0] ?? 0));
      }
      fill(slots, skip, rest, 0, 0, 0);
      return;
    }
    const signature = meldSignatures[meld]!;
    const tried = new Set<string>();
    for (let slot = 0; slot < slots.length; slot++) {
      if (skip.has(slot) || tried.has(slots[slot]!.twin)) continue;
      if (!slots[slot]!.options.some((option) => option.signature === signature)) continue;
      tried.add(slots[slot]!.twin);
      skip.add(slot);
      seat(slots, skip, meld + 1);
      skip.delete(slot);
    }
  };

  for (const groups of input.alternatives) {
    if (input.melds.length > groups.length) continue;
    seat(slotsOf(groups), new Set(), 0);
  }
  return hit ? { missing: best, wants: found } : null;
}
