/**
 * Winning-hand representation.
 *
 * `concealed` holds every tile still in hand, INCLUDING the winning tile when
 * the win was on a discard (the tile is not yet part of a meld). Meld tiles are
 * kept separately. Flowers and seasons are bonuses and never enter the shape.
 */

import {
  isBonus,
  isSuited,
  parseTile,
  parseTiles,
  tileKey,
  type PlayTile,
  type Tile,
  type Wind,
} from "./tiles.ts";

export type MeldKind = "chow" | "pung" | "kong";

export interface Meld {
  readonly kind: MeldKind;
  readonly tiles: readonly PlayTile[];
  readonly exposed: boolean;
}

export interface Hand {
  readonly concealed: readonly PlayTile[];
  readonly melds: readonly Meld[];
  readonly flowers: readonly Tile[];
  readonly seasons: readonly Tile[];
  readonly winningTile: PlayTile | null;
  readonly selfDrawn: boolean;
  readonly seatWind: Wind;
  readonly prevailingWind: Wind;
}

export interface MeldInput {
  readonly kind: MeldKind;
  readonly tiles: string | readonly Tile[];
  readonly exposed?: boolean;
}

export interface HandInput {
  readonly concealed: string | readonly Tile[];
  readonly melds?: readonly MeldInput[];
  readonly flowers?: string | readonly Tile[];
  readonly seasons?: string | readonly Tile[];
  readonly winningTile?: string | Tile | null;
  readonly selfDrawn?: boolean;
  readonly seatWind?: Wind;
  readonly prevailingWind?: Wind;
}

export function meld(input: MeldInput): Meld {
  const tiles = toTiles(input.tiles).map(requirePlayTile);
  validateMeldTiles(input.kind, tiles);
  return { kind: input.kind, tiles, exposed: input.exposed ?? false };
}

export function createHand(input: HandInput): Hand {
  const concealed = toTiles(input.concealed).map(requirePlayTile);
  const melds = (input.melds ?? []).map(meld);
  const flowers = toTiles(input.flowers ?? []);
  const seasons = toTiles(input.seasons ?? []);
  for (const tile of flowers) {
    if (tile.kind !== "flower") throw new Error(`Not a flower: ${tileKey(tile)}`);
  }
  for (const tile of seasons) {
    if (tile.kind !== "season") throw new Error(`Not a season: ${tileKey(tile)}`);
  }
  const winningTile =
    input.winningTile == null
      ? null
      : typeof input.winningTile === "string"
        ? requirePlayTile(parseTile(input.winningTile))
        : requirePlayTile(input.winningTile);

  const allPlay = [...concealed, ...melds.flatMap((m) => m.tiles)];
  enforceCopyLimit(allPlay);
  enforceBonusLimit(flowers, seasons);

  if (winningTile !== null) {
    const key = tileKey(winningTile);
    if (!allPlay.some((t) => tileKey(t) === key)) {
      throw new Error(`Winning tile ${key} is not in the hand`);
    }
  }

  return {
    concealed,
    melds,
    flowers,
    seasons,
    winningTile,
    selfDrawn: input.selfDrawn ?? false,
    seatWind: input.seatWind ?? "E",
    prevailingWind: input.prevailingWind ?? "E",
  };
}

export function handTiles(hand: Hand): PlayTile[] {
  return [...hand.concealed, ...hand.melds.flatMap((m) => m.tiles)];
}

export function isConcealed(hand: Hand): boolean {
  return hand.melds.every((m) => !m.exposed);
}

/** Number of declared kongs (each adds one extra tile beyond 14). */
export function kongCount(hand: Hand): number {
  return hand.melds.filter((m) => m.kind === "kong").length;
}

function toTiles(input: string | readonly Tile[]): Tile[] {
  return typeof input === "string" ? parseTiles(input) : input.slice();
}

function requirePlayTile(tile: Tile): PlayTile {
  if (isBonus(tile)) throw new Error(`Bonus tile cannot be in a hand shape: ${tileKey(tile)}`);
  return tile;
}

function validateMeldTiles(kind: MeldKind, tiles: readonly PlayTile[]): void {
  if (kind === "chow") {
    if (tiles.length !== 3) throw new Error("A chow must have three tiles");
    const [a, b, c] = tiles;
    if (!a || !b || !c || !isSuited(a) || !isSuited(b) || !isSuited(c)) {
      throw new Error("A chow must be three suited tiles");
    }
    if (a.suit !== b.suit || a.suit !== c.suit) throw new Error("A chow must use one suit");
    const ranks = [a.rank, b.rank, c.rank].sort((x, y) => x - y);
    if (ranks[1] !== ranks[0]! + 1 || ranks[2] !== ranks[0]! + 2) {
      throw new Error("A chow must be consecutive");
    }
    return;
  }

  const expected = kind === "pung" ? 3 : 4;
  if (tiles.length !== expected) throw new Error(`A ${kind} must have ${expected} tiles`);
  const key = tileKey(tiles[0]!);
  if (!tiles.every((t) => tileKey(t) === key)) throw new Error(`A ${kind} must use identical tiles`);
}

function enforceCopyLimit(tiles: readonly PlayTile[]): void {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    const next = (counts.get(key) ?? 0) + 1;
    if (next > 4) throw new Error(`More than four copies of ${key}`);
    counts.set(key, next);
  }
}

function enforceBonusLimit(flowers: readonly Tile[], seasons: readonly Tile[]): void {
  const flowerIndices = new Set(flowers.map((t) => (t.kind === "flower" ? t.index : -1)));
  const seasonIndices = new Set(seasons.map((t) => (t.kind === "season" ? t.index : -1)));
  if (flowers.length > 4 || flowerIndices.size !== flowers.length) {
    throw new Error("Flowers must be four distinct tiles");
  }
  if (seasons.length > 4 || seasonIndices.size !== seasons.length) {
    throw new Error("Seasons must be four distinct tiles");
  }
}
