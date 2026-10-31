/**
 * Seeded, deterministic RNG. No Math.random anywhere in src/core.
 *
 * mulberry32 is used for the stream; string seeds are hashed with xmur3 so
 * `createRng("table-7")` is reproducible across processes and platforms.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, bound). */
  int(bound: number): number;
  /** Fisher-Yates shuffle; returns a new array, does not mutate input. */
  shuffle<T>(items: readonly T[]): T[];
}

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (bound: number): number => {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new RangeError(`Bad bound: ${bound}`);
    }
    return Math.floor(next() * bound);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };

  return { next, int, shuffle };
}
