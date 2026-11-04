/**
 * Table-side hand checker.
 *
 * A player types the tiles they hold; the checker parses them, builds a
 * normalised Hand and asks the existing matcher which catalogue patterns the
 * hand makes. Nothing here knows any pattern by name: this module is input
 * parsing plus a wait search over the 34 play-tile kinds.
 *
 * Input syntax
 *   b1..b9 c1..c9 o1..o9   suits
 *   wE wS wW wN            winds
 *   dR dG dW               dragons
 *   f1..f4 s1..s4          flowers/seasons (bonuses, stripped from the shape)
 *   E S W N                wind aliases
 *   r g w, red green white dragon aliases
 *   (b1 b2 b3)             one EXPOSED meld: chow, pung or kong
 *
 * Whitespace, commas and pipes separate tokens. Canonical keys and aliases are
 * case-insensitive where they do not collide. A bare `W` is the West wind and
 * a bare lowercase `w` is the White dragon, because those two aliases do
 * collide; exact case wins before the case-insensitive fallback.
 *
 * `parseTiles` never throws: malformed input comes back in `errors`.
 */

import {
  isBonus,
  isSuited,
  parseTile,
  tileKey,
  PLAY_TILE_KEYS,
  type FlowerTile,
  type PlayTile,
  type SeasonTile,
  type Tile,
} from "./tiles.ts";
import {
  createHand,
  isConcealed,
  type Hand,
  type Meld,
  type MeldKind,
} from "./hand.ts";
import { matchHand, type PatternMatch } from "./match.ts";

export type BonusTile = FlowerTile | SeasonTile;

export interface ParsedTiles {
  /** Every play tile in input order, including tiles inside exposed melds. */
  readonly tiles: PlayTile[];
  /** Each exposed meld's tiles, in input order. */
  readonly meldGroups: PlayTile[][];
  /** Start index in `tiles` of each group in `meldGroups`, same order. */
  readonly exposedMelds: number[];
  /** Flowers and seasons, in input order. */
  readonly bonuses: BonusTile[];
  readonly errors: string[];
}

export interface WaitReport {
  readonly tile: PlayTile;
  /** Copies not visible in the input (0..4). */
  readonly remaining: number;
  /** True when every copy is already held or exposed in the input. */
  readonly dead: boolean;
  /**
   * True when the only completed hands require the tile to be drawn. Such a
   * wait cannot be claimed off a discard, but it still finishes the hand and
   * is exactly what an announced fishing wait names.
   */
  readonly selfDrawnOnly: boolean;
  /** Catalogue matches for the completed hand, best tier first. */
  readonly matches: PatternMatch[];
}

export interface CheckWin {
  readonly size: 14;
  readonly matches: PatternMatch[];
  readonly best: PatternMatch | null;
  readonly concealed: boolean;
}

export interface CheckWait {
  readonly size: 13;
  readonly waits: WaitReport[];
}

export interface CheckErrors {
  readonly size: null;
  readonly errors: string[];
}

export type CheckResult = CheckWin | CheckWait | CheckErrors;

export type CheckInput = string | readonly string[];

/** Compact match description for the CLI's JSON output. */
export interface MatchSummary {
  readonly id: string;
  readonly name: string;
  readonly tier: PatternMatch["tier"];
  readonly points: number | null;
  readonly concealed: boolean;
}

export function summarizeMatch(match: PatternMatch): MatchSummary {
  return {
    id: match.pattern.id,
    name: match.pattern.name,
    tier: match.tier,
    points: match.points,
    concealed: match.concealed,
  };
}

/** A chow, pung or kong, or null when the group cannot be one. */
function classifyMeld(tiles: readonly PlayTile[]): MeldKind | null {
  if (tiles.length === 4) {
    const key = tileKey(tiles[0]!);
    return tiles.every((tile) => tileKey(tile) === key) ? "kong" : null;
  }
  if (tiles.length !== 3) return null;

  const key = tileKey(tiles[0]!);
  if (tiles.every((tile) => tileKey(tile) === key)) return "pung";

  const [a, b, c] = tiles;
  if (!a || !b || !c || !isSuited(a) || !isSuited(b) || !isSuited(c)) return null;
  if (a.suit !== b.suit || b.suit !== c.suit) return null;
  const ranks = [a.rank, b.rank, c.rank].sort((x, y) => x - y);
  return ranks[1] === ranks[0]! + 1 && ranks[2] === ranks[1]! + 1 ? "chow" : null;
}

/** Resolve one token, using exact case first where aliases collide. */
function resolveToken(raw: string): Tile | null {
  const lower = raw.toLowerCase();

  // Canonical keys, case-insensitive.
  if (/^[bco][1-9]$/.test(lower)) return parseTile(lower);
  if (/^w[eswn]$/.test(lower)) return parseTile(`w${lower[1]!.toUpperCase()}`);
  if (/^d[rgw]$/.test(lower)) return parseTile(`d${lower[1]!.toUpperCase()}`);
  if (/^[fs][1-4]$/.test(lower)) return parseTile(lower);

  // Dragon words.
  if (lower === "red") return parseTile("dR");
  if (lower === "green") return parseTile("dG");
  if (lower === "white") return parseTile("dW");

  // Exact-case single-letter aliases: W is West wind, w is White dragon.
  if (raw === "E" || raw === "S" || raw === "W" || raw === "N") {
    return parseTile(`w${raw}`);
  }
  if (raw === "r" || raw === "g" || raw === "w") {
    return parseTile(`d${raw.toUpperCase()}`);
  }

  // Case-insensitive fallbacks. Winds are tried first, so R/G map to dragons.
  if (/^[eswn]$/i.test(raw)) return parseTile(`w${raw.toUpperCase()}`);
  if (/^[rgw]$/i.test(raw)) return parseTile(`d${raw.toUpperCase()}`);

  return null;
}

/**
 * Parse a typed hand. Never throws; malformed tokens, bad copy counts and
 * illegal exposed melds are returned in `errors`.
 */
export function parseTiles(input: CheckInput): ParsedTiles {
  const text = typeof input === "string" ? input : input.join(" ");

  const tiles: PlayTile[] = [];
  const meldGroups: PlayTile[][] = [];
  const exposedMelds: number[] = [];
  const bonuses: BonusTile[] = [];
  const errors: string[] = [];

  const copies = new Map<string, number>();
  const bonusCopies = new Map<string, number>();
  const reportedCopies = new Set<string>();

  const addPlayTile = (tile: PlayTile) => {
    tiles.push(tile);
    const key = tileKey(tile);
    const next = (copies.get(key) ?? 0) + 1;
    copies.set(key, next);
    if (next > 4 && !reportedCopies.has(key)) {
      reportedCopies.add(key);
      errors.push(`More than four copies of ${key}`);
    }
  };

  const addBonus = (tile: BonusTile) => {
    bonuses.push(tile);
    const key = tileKey(tile);
    const next = (bonusCopies.get(key) ?? 0) + 1;
    bonusCopies.set(key, next);
    if (next > 1) errors.push(`Duplicate bonus tile: ${key}`);
  };

  let depth = 0;
  let token = "";
  let group: PlayTile[] = [];
  let groupLabels: string[] = [];
  let groupStart = 0;
  let groupInvalid = false;

  const handleToken = (raw: string) => {
    const tile = resolveToken(raw);
    if (tile === null) {
      errors.push(`Unknown tile "${raw}"`);
      if (depth > 0) groupInvalid = true;
      return;
    }

    if (isBonus(tile)) {
      addBonus(tile);
      if (depth > 0) {
        groupInvalid = true;
        groupLabels.push(tileKey(tile));
      }
      return;
    }

    addPlayTile(tile);
    if (depth > 0) {
      group.push(tile);
      groupLabels.push(tileKey(tile));
    }
  };

  const flush = () => {
    if (token.length === 0) return;
    handleToken(token);
    token = "";
  };

  const closeGroup = () => {
    depth = 0;
    if (groupInvalid || classifyMeld(group) === null) {
      errors.push(
        `Illegal exposed meld (${groupLabels.join(" ")}): ` +
          "must be a chow, pung or kong",
      );
    } else {
      meldGroups.push(group);
      exposedMelds.push(groupStart);
    }
    group = [];
    groupLabels = [];
    groupInvalid = false;
  };

  for (const char of text) {
    if (char === "," || char === "|" || /\s/.test(char)) {
      flush();
      continue;
    }
    if (char === "(") {
      flush();
      if (depth > 0) {
        errors.push('Nested "(" in an exposed meld');
        groupInvalid = true;
        continue;
      }
      depth = 1;
      groupStart = tiles.length;
      group = [];
      groupLabels = [];
      groupInvalid = false;
      continue;
    }
    if (char === ")") {
      flush();
      if (depth === 0) {
        errors.push('Unmatched ")"');
        continue;
      }
      closeGroup();
      continue;
    }
    token += char;
  }
  flush();
  if (depth > 0) {
    errors.push(
      `Unclosed exposed meld (${groupLabels.join(" ")}): missing ")"`,
    );
  }

  if (meldGroups.length > 4) {
    errors.push(`More than four exposed melds (${meldGroups.length})`);
  }

  return { tiles, meldGroups, exposedMelds, bonuses, errors };
}

function groupMask(parsed: ParsedTiles): Set<number> {
  const mask = new Set<number>();
  parsed.meldGroups.forEach((group, index) => {
    const start = parsed.exposedMelds[index]!;
    for (let offset = 0; offset < group.length; offset++) mask.add(start + offset);
  });
  return mask;
}

function concealedTiles(parsed: ParsedTiles): PlayTile[] {
  const mask = groupMask(parsed);
  return parsed.tiles.filter((_, index) => !mask.has(index));
}

function handMelds(parsed: ParsedTiles): Meld[] {
  return parsed.meldGroups.map((group) => ({
    kind: classifyMeld(group)!,
    tiles: group,
    exposed: true,
  }));
}

function splitBonuses(parsed: ParsedTiles): { flowers: FlowerTile[]; seasons: SeasonTile[] } {
  const flowers: FlowerTile[] = [];
  const seasons: SeasonTile[] = [];
  for (const tile of parsed.bonuses) {
    if (tile.kind === "flower") flowers.push(tile);
    else seasons.push(tile);
  }
  return { flowers, seasons };
}

function makeHand(
  parsed: ParsedTiles,
  concealed: PlayTile[],
  melds: Meld[],
  allowExtraCopy: boolean,
  selfDrawn = false,
): Hand {
  const { flowers, seasons } = splitBonuses(parsed);
  if (!allowExtraCopy) {
    return createHand({ concealed, melds, flowers, seasons, selfDrawn });
  }

  // A dead wait is a tile the player already holds four copies of. The fifth
  // copy cannot exist, so createHand's copy check would reject it; the shape
  // is still built so the wait can be reported as dead instead of omitted.
  return {
    concealed,
    melds,
    flowers,
    seasons,
    winningTile: null,
    selfDrawn,
    seatWind: "E",
    prevailingWind: "E",
  };
}

function heldCounts(tiles: readonly PlayTile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Check a typed hand.
 *
 * 14 effective tiles (14 plus one per exposed kong) are a complete hand:
 * every catalogue match, best tier first. 13 effective tiles are a wait:
 * every play tile that would match a pattern, with the visible copies left.
 */
export function checkHand(input: CheckInput): CheckResult {
  const parsed = parseTiles(input);
  if (parsed.errors.length > 0) {
    return { size: null, errors: [...parsed.errors] };
  }

  try {
    const melds = handMelds(parsed);
    const kongCount = melds.filter((meld) => meld.kind === "kong").length;
    const effective = parsed.tiles.length - kongCount;
    if (effective !== 13 && effective !== 14) {
      return {
        size: null,
        errors: [
          `Hand has ${effective} tiles after bonuses` +
            (kongCount > 0 ? ` and ${kongCount} kong${kongCount === 1 ? "" : "s"}` : "") +
            "; expected 13 or 14",
        ],
      };
    }

    const concealed = concealedTiles(parsed);
    const { flowers, seasons } = splitBonuses(parsed);

    if (effective === 14) {
      const hand = makeHand(parsed, concealed, melds, false);
      const matches = matchHand(hand);
      return {
        size: 14,
        matches,
        best: matches[0] ?? null,
        concealed: isConcealed(hand),
      };
    }

    const counts = heldCounts(parsed.tiles);
    const waits: WaitReport[] = [];

    for (const key of PLAY_TILE_KEYS) {
      const remaining = 4 - (counts.get(key) ?? 0);
      const candidate = parseTile(key) as PlayTile;
      // A wait is a tile the player draws: self-drawn-only hands count here
      // even though they can never be claimed off a discard.
      const hand = makeHand(
        parsed,
        [...concealed, candidate],
        melds,
        remaining <= 0,
        true,
      );
      const matches = matchHand(hand);
      if (matches.length === 0) continue;
      const claimable =
        matchHand(makeHand(parsed, [...concealed, candidate], melds, remaining <= 0))
          .length > 0;
      waits.push({
        tile: candidate,
        remaining: Math.max(0, remaining),
        dead: remaining <= 0,
        selfDrawnOnly: !claimable,
        matches,
      });
    }

    const order = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));
    waits.sort((a, b) => {
      const aPoints = a.matches[0]?.points ?? -1;
      const bPoints = b.matches[0]?.points ?? -1;
      if (aPoints !== bPoints) return bPoints - aPoints;
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      return (order.get(tileKey(a.tile)) ?? 0) - (order.get(tileKey(b.tile)) ?? 0);
    });

    return { size: 13, waits };
  } catch (error) {
    return {
      size: null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/** Complete-hand wrapper: a 13-tile input is reported as an error. */
export function completeHand(input: CheckInput): CheckResult {
  const result = checkHand(input);
  if (result.size === 13) {
    return {
      size: null,
      errors: [
        "Hand is one tile short; pass 14 effective tiles for a complete hand",
      ],
    };
  }
  return result;
}

/** Wait wrapper: a 14-tile input is reported as an error. */
export function waitingTiles(input: CheckInput): CheckResult {
  const result = checkHand(input);
  if (result.size === 14) {
    return {
      size: null,
      errors: [
        "Hand is already complete; pass 13 effective tiles to list waits",
      ],
    };
  }
  return result;
}
