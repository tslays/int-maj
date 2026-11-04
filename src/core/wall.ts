/**
 * Wall construction and the printed deal. Deterministic given a seed.
 *
 * Four walls of 18 x 2 tiles are built square (I p. 18). The engine draws
 * from the open end (`front`); the two loose tiles are lifted at the break
 * (`back`) and replacements come from them.
 */

import { createTileSet, type Tile } from "./tiles.ts";
import { createRng, type Rng } from "./rng.ts";

export const WALL_COUNT = 4;
export const WALL_LENGTH = 18;
export const WALL_HEIGHT = 2;
export const WALL_TILES = WALL_COUNT * WALL_LENGTH * WALL_HEIGHT;
export const LOOSE_TILES = 2;
export const DEAL_ROUNDS = 3;
export const DEAL_PER_ROUND = 4;
export const EAST_EXTRA = 1;

export interface Wall {
  /** All 144 tiles, shuffled; `front..back` are live and `loose` is set aside. */
  readonly tiles: readonly Tile[];
  readonly front: number;
  readonly back: number;
  readonly loose: readonly Tile[];
}

export interface Deal {
  /** The wall after the deal, in draw order. */
  readonly wall: Wall;
  /** Four hands in seat order E, S, W, N: East 14, the others 13. */
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

/** The four 18 x 2 walls, in table order, from one shuffled set. */
export function buildWalls(seed: number | string): {
  walls: readonly (readonly Tile[])[];
  wall: Tile[];
  rng: Rng;
} {
  const { wall, rng } = shuffledWall(seed);
  const walls = Array.from({ length: WALL_COUNT }, (_, index) =>
    wall.slice(index * WALL_LENGTH * WALL_HEIGHT, (index + 1) * WALL_LENGTH * WALL_HEIGHT),
  );
  return { walls, wall, rng };
}

/**
 * The printed deal (I p. 18): four tiles at a time for three rounds, then one
 * each, then East's extra tile. Two loose tiles are lifted at the break.
 * Flowers are not replaced here; that belongs to the turn engine.
 */
export function deal(seed: number | string): Deal {
  const { wall, rng } = shuffledWall(seed);
  let back = wall.length - 1;
  const loose: Tile[] = [];
  while (loose.length < LOOSE_TILES) loose.push(wall[back--]!);
  let front = 0;
  const take = (): Tile => wall[front++]!;
  const hands: Tile[][] = [[], [], [], []];
  for (let round = 0; round < DEAL_ROUNDS; round++) {
    for (let seat = 0; seat < 4; seat++) {
      for (let tile = 0; tile < DEAL_PER_ROUND; tile++) hands[seat]!.push(take());
    }
  }
  for (let seat = 0; seat < 4; seat++) hands[seat]!.push(take());
  for (let extra = 0; extra < EAST_EXTRA; extra++) hands[0]!.push(take());
  return { wall: { tiles: wall, front, back, loose }, hands, rng };
}
