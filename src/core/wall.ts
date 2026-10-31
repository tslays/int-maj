/**
 * Wall construction and dealing. Deterministic given a seed.
 */

import { createTileSet, type Tile } from "./tiles.ts";
import { createRng, type Rng } from "./rng.ts";

export interface Deal {
  /** Undealt wall, in draw order. */
  readonly wall: readonly Tile[];
  /** Four hands of 13 tiles, in seat order E, S, W, N. */
  readonly hands: readonly (readonly Tile[])[];
  readonly rng: Rng;
}

export function buildWall(): Tile[] {
  return createTileSet();
}

export function shuffledWall(seed: number | string): { wall: Tile[]; rng: Rng } {
  const rng = createRng(seed);
  return { wall: rng.shuffle(buildWall()), rng };
}

/**
 * Deal 13 tiles to each of four seats, round-robin, from the top of the wall.
 * No flowers are replaced here; that belongs to the turn engine.
 */
export function deal(seed: number | string, handSize = 13, players = 4): Deal {
  if (!Number.isInteger(handSize) || handSize < 0) throw new RangeError(`Bad hand size: ${handSize}`);
  if (!Number.isInteger(players) || players < 1) throw new RangeError(`Bad player count: ${players}`);
  const { wall, rng } = shuffledWall(seed);
  const needed = handSize * players;
  if (needed > wall.length) throw new RangeError("Not enough tiles to deal");
  const hands: Tile[][] = Array.from({ length: players }, () => []);
  for (let i = 0; i < needed; i++) {
    hands[i % players]!.push(wall[i]!);
  }
  return { wall: wall.slice(needed), hands, rng };
}
