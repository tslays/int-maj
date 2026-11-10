/**
 * Tile model for the 144-tile international set.
 *
 * Canonical tile keys:
 *   b1..b9  bamboo
 *   c1..c9  characters
 *   o1..o9  circles (dots)
 *   wE wS wW wN  winds
 *   dR dG dW     dragons (red, green, white)
 *   f1..f4       flowers
 *   s1..s4       seasons
 *
 * Flowers and seasons are bonus tiles: they are never part of a hand shape.
 */

export const SUITS = ["bamboo", "characters", "circles"] as const;
export type Suit = (typeof SUITS)[number];

export const WINDS = ["E", "S", "W", "N"] as const;
export type Wind = (typeof WINDS)[number];

export const DRAGONS = ["red", "green", "white"] as const;
export type Dragon = (typeof DRAGONS)[number];

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type BonusIndex = 1 | 2 | 3 | 4;

export interface SuitedTile {
  readonly kind: "suited";
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface WindTile {
  readonly kind: "wind";
  readonly wind: Wind;
}

export interface DragonTile {
  readonly kind: "dragon";
  readonly dragon: Dragon;
}

export interface FlowerTile {
  readonly kind: "flower";
  readonly index: BonusIndex;
}

export interface SeasonTile {
  readonly kind: "season";
  readonly index: BonusIndex;
}

export type Tile = SuitedTile | WindTile | DragonTile | FlowerTile | SeasonTile;
export type PlayTile = SuitedTile | WindTile | DragonTile;
export type HonourTile = WindTile | DragonTile;

const SUIT_PREFIX: Record<Suit, string> = {
  bamboo: "b",
  characters: "c",
  circles: "o",
};

const PREFIX_SUIT: Record<string, Suit> = {
  b: "bamboo",
  c: "characters",
  o: "circles",
};

const WIND_BY_CODE: Record<string, Wind> = {
  E: "E",
  S: "S",
  W: "W",
  N: "N",
};

const DRAGON_BY_CODE: Record<string, Dragon> = {
  R: "red",
  G: "green",
  W: "white",
};

export function suited(suit: Suit, rank: number): SuitedTile {
  if (!Number.isInteger(rank) || rank < 1 || rank > 9) {
    throw new RangeError(`Bad suit rank: ${rank}`);
  }
  return { kind: "suited", suit, rank: rank as Rank };
}

export function wind(value: Wind): WindTile {
  return { kind: "wind", wind: value };
}

export function dragon(value: Dragon): DragonTile {
  return { kind: "dragon", dragon: value };
}

export function flower(index: number): FlowerTile {
  return { kind: "flower", index: checkBonusIndex(index) };
}

export function season(index: number): SeasonTile {
  return { kind: "season", index: checkBonusIndex(index) };
}

function checkBonusIndex(index: number): BonusIndex {
  if (!Number.isInteger(index) || index < 1 || index > 4) {
    throw new RangeError(`Bad bonus index: ${index}`);
  }
  return index as BonusIndex;
}

/** Canonical key for a suited tile, e.g. suitTileKey("circles", 5) === "o5". */
export function suitTileKey(suit: Suit, rank: number): string {
  return `${SUIT_PREFIX[suit]}${rank}`;
}

export function tileKey(tile: Tile): string {
  switch (tile.kind) {
    case "suited":
      return `${SUIT_PREFIX[tile.suit]}${tile.rank}`;
    case "wind":
      return `w${tile.wind}`;
    case "dragon":
      return `d${tile.dragon.charAt(0).toUpperCase()}`;
    case "flower":
      return `f${tile.index}`;
    case "season":
      return `s${tile.index}`;
  }
}

export function parseTile(key: string): Tile {
  if (/^[bco][1-9]$/.test(key)) {
    return suited(PREFIX_SUIT[key[0]!]!, Number(key[1]));
  }
  if (/^w[ESWN]$/.test(key)) {
    return wind(WIND_BY_CODE[key[1]!]!);
  }
  if (/^d[RGW]$/.test(key)) {
    return dragon(DRAGON_BY_CODE[key[1]!]!);
  }
  if (/^f[1-4]$/.test(key)) {
    return flower(Number(key[1]));
  }
  if (/^s[1-4]$/.test(key)) {
    return season(Number(key[1]));
  }
  throw new Error(`Bad tile key: ${key}`);
}

export function parseTiles(spec: string): Tile[] {
  return spec
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseTile);
}

export function isBonus(tile: Tile): tile is FlowerTile | SeasonTile {
  return tile.kind === "flower" || tile.kind === "season";
}

export function isPlayTile(tile: Tile): tile is PlayTile {
  return !isBonus(tile);
}

export function isSuited(tile: Tile): tile is SuitedTile {
  return tile.kind === "suited";
}

export function isHonour(tile: Tile): tile is HonourTile {
  return tile.kind === "wind" || tile.kind === "dragon";
}

export function isSuitedKey(key: string): boolean {
  return /^[bco][1-9]$/.test(key);
}

export function isHonourKey(key: string): boolean {
  return /^w[ESWN]$/.test(key) || /^d[RGW]$/.test(key);
}

export function isTerminalKey(key: string): boolean {
  return /^[bco][19]$/.test(key);
}

/** The 34 distinct play-tile kinds, in canonical order. */
export const PLAY_TILE_KEYS: readonly string[] = Object.freeze([
  ...SUITS.flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${SUIT_PREFIX[suit]}${i + 1}`)),
  ...WINDS.map((w) => `w${w}`),
  ...DRAGONS.map((d) => `d${d[0]!.toUpperCase()}`),
]);

export function formatTile(tile: Tile): string {
  switch (tile.kind) {
    case "suited":
      return `${tile.rank} ${tile.suit}`;
    case "wind":
      return `${NAME_OF_WIND[tile.wind]} wind`;
    case "dragon":
      return `${NAME_OF_DRAGON[tile.dragon]} dragon`;
    case "flower":
      return `flower ${tile.index}`;
    case "season":
      return `season ${tile.index}`;
  }
}

const NAME_OF_WIND: Record<Wind, string> = {
  E: "East",
  S: "South",
  W: "West",
  N: "North",
};

const NAME_OF_DRAGON: Record<Dragon, string> = {
  red: "Red",
  green: "Green",
  white: "White",
};

/**
 * The assumed 144-tile set: 3 suits x 9 ranks x 4, winds x4, dragons x4,
 * four flowers and four seasons.
 */
export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 0; copy < 4; copy++) tiles.push(suited(suit, rank));
    }
  }
  for (const w of WINDS) {
    for (let copy = 0; copy < 4; copy++) tiles.push(wind(w));
  }
  for (const d of DRAGONS) {
    for (let copy = 0; copy < 4; copy++) tiles.push(dragon(d));
  }
  for (let i = 1; i <= 4; i++) tiles.push(flower(i));
  for (let i = 1; i <= 4; i++) tiles.push(season(i));
  return tiles;
}
