/**
 * Standard 4-sets-plus-pair decomposition. Used by plain patterns and by
 * patterns that mix ordinary sets with special honour requirements.
 *
 * A kong consumes four tiles but still counts as one set, so a winning hand
 * with kongs has 14 + kongCount tiles.
 */

import { PLAY_TILE_KEYS, tileKey, type Suit } from "./tiles.ts";
import type { HandShape } from "./shape.ts";

export type StandardSet =
  | { readonly kind: "chow"; readonly suit: Suit; readonly start: number }
  | { readonly kind: "pung"; readonly tile: string }
  | { readonly kind: "kong"; readonly tile: string };

export interface StandardDecomposition {
  readonly sets: readonly StandardSet[];
  readonly pair: string;
}

const SUIT_BY_INDEX: readonly Suit[] = [
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "bamboo",
  "characters",
  "characters",
  "characters",
  "characters",
  "characters",
  "characters",
  "characters",
  "characters",
  "characters",
  "circles",
  "circles",
  "circles",
  "circles",
  "circles",
  "circles",
  "circles",
  "circles",
  "circles",
];

function walk(
  counts: number[],
  sets: StandardSet[],
  pair: string,
  results: StandardDecomposition[],
  setCount: number,
  allowKongs: boolean,
): void {
  if (sets.length === setCount) {
    if (counts.every((count) => count === 0)) results.push({ sets: sets.slice(), pair });
    return;
  }

  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return;

  const key = PLAY_TILE_KEYS[first]!;
  const count = counts[first]!;

  if (allowKongs && count >= 4) {
    counts[first] = count - 4;
    sets.push({ kind: "kong", tile: key });
    walk(counts, sets, pair, results, setCount, allowKongs);
    sets.pop();
    counts[first] = count;
  }

  if (count >= 3) {
    counts[first] = count - 3;
    sets.push({ kind: "pung", tile: key });
    walk(counts, sets, pair, results, setCount, allowKongs);
    sets.pop();
    counts[first] = count;
  }

  if (first < 27 && first % 9 <= 6 && counts[first + 1]! >= 1 && counts[first + 2]! >= 1) {
    counts[first] = count - 1;
    counts[first + 1]! -= 1;
    counts[first + 2]! -= 1;
    sets.push({ kind: "chow", suit: SUIT_BY_INDEX[first]!, start: (first % 9) + 1 });
    walk(counts, sets, pair, results, setCount, allowKongs);
    sets.pop();
    counts[first] = count;
    counts[first + 1]! += 1;
    counts[first + 2]! += 1;
  }
}

export interface DecomposeOptions {
  /** How many sets to form after the pair. Default 4 (an ordinary hand). */
  readonly setCount?: number;
  /** Allow four identical tiles to form a kong. Default true. */
  readonly allowKongs?: boolean;
}

export function decomposeStandard(
  shape: HandShape,
  options: DecomposeOptions = {},
): StandardDecomposition[] {
  const allowKongs = options.allowKongs ?? true;
  // Declared melds are fixed sets: a claimed set is exposed as that set
  // (R-060, R-061) and only ever grows into a kong (R-063, R-065), so its
  // tiles may never be regrouped to complete the rest of the hand.
  const fixed: StandardSet[] = [];
  const base = PLAY_TILE_KEYS.map((key) => shape.counts[key] ?? 0);
  for (const meld of shape.melds) {
    for (const tile of meld.tiles) {
      const index = PLAY_TILE_KEYS.indexOf(tileKey(tile));
      if (index < 0 || base[index]! < 1) return [];
      base[index]! -= 1;
    }
    const first = meld.tiles[0]!;
    if (meld.kind === "chow") {
      if (first.kind !== "suited") return [];
      const start = Math.min(...meld.tiles.map((tile) => (tile.kind === "suited" ? tile.rank : 99)));
      fixed.push({ kind: "chow", suit: first.suit, start });
    } else {
      fixed.push({ kind: meld.kind, tile: tileKey(first) });
    }
  }
  const setCount = (options.setCount ?? 4) - fixed.length;
  if (setCount < 0) return [];
  const results: StandardDecomposition[] = [];
  for (let index = 0; index < base.length; index++) {
    if (base[index]! < 2) continue;
    const counts = base.slice();
    counts[index]! -= 2;
    walk(counts, [], PLAY_TILE_KEYS[index]!, results, setCount, allowKongs);
  }
  return results.map((result) => ({ sets: [...fixed, ...result.sets], pair: result.pair }));
}

/** True when every set in the decomposition is a chow. */
export function isAllChows(decomposition: StandardDecomposition): boolean {
  return decomposition.sets.every((set) => set.kind === "chow");
}
