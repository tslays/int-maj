/**
 * What a seat's tiles make: the questions the reducer, the view and the bots
 * ask about a hand without changing anything.
 *
 * Which patterns are allowed, whether a hand is complete or wins on a
 * discard, what it waits on, what a fishing declaration is worth, and which
 * claims a discard opens.
 */

import { createHand, type Hand, type Meld } from "../hand.ts";
import { isExcluded, matchesAny, tierExclusion } from "../match.ts";
import { DEFAULT_LIMIT, scoreHand, type ScoreResult } from "../score.ts";
import { TIER_FISHING, TIER_POINTS, type Tier } from "../patterns/types.ts";
import { isSuited, parseTile, PLAY_TILE_KEYS, suitTileKey, type PlayTile } from "../tiles.ts";
import {
  effectiveCount,
  nextSeat,
  playerOf,
  seatWindOf,
  wallRemaining,
  type ClaimRecord,
  type GameState,
  type PlayerState,
  type Seat,
} from "./state.ts";
import { countOf, removeKeys, sortKeys } from "./draft.ts";

function toPlayTiles(keys: readonly string[]): PlayTile[] {
  return keys.map((key) => parseTile(key) as PlayTile);
}

function meldsOf(player: PlayerState): Meld[] {
  return player.melds.map((meld) => ({
    kind: meld.kind,
    tiles: toPlayTiles(meld.tiles),
    exposed: meld.exposed,
  }));
}

/** Build the matcher's Hand for a seat, optionally adding one tile. */
export function buildHand(
  state: GameState,
  seat: Seat,
  options: {
    readonly extra?: string;
    readonly winningTile?: string | null;
    readonly selfDrawn?: boolean;
    readonly concealedOverride?: readonly string[];
    readonly meldOverride?: readonly Meld[];
  } = {},
): Hand | null {
  const player = playerOf(state, seat);
  const concealed = options.concealedOverride ?? player.hand;
  try {
    return createHand({
      concealed: toPlayTiles(options.extra ? [...concealed, options.extra] : concealed),
      melds: options.meldOverride ?? meldsOf(player),
      flowers: player.flowers.map((key) => parseTile(key)),
      seasons: player.seasons.map((key) => parseTile(key)),
      winningTile: options.winningTile ?? null,
      selfDrawn: options.selfDrawn ?? false,
      seatWind: seatWindOf(state, seat),
      prevailingWind: state.prevailingWind,
      variant: state.variant ?? "western",
    });
  } catch {
    return null;
  }
}

/**
 * House rules ride in `excludedHands` beside the hands a table leaves out, so
 * a deal, a save and a replay carry them with no field of their own. Each is
 * a token the engine reads here, never a pattern id.
 *
 * `GOULASH_NO_HALF_LIMIT`: "No half-limit hands are permitted during a
 * Goulash" (C p. 55, interesting idea 5; RULES.md Part III §3.3). In a Goulash
 * hand, whatever would score at half limit is left out, so it cannot win and
 * is no fishing hand; a hand that is also another pattern scores as that.
 */
export const GOULASH_NO_HALF_LIMIT = "rule:goulash-no-half-limit";

/**
 * `WIN_NEEDS_FISH`: a player must have shown the fish to go out (tester
 * report #118; owner ruling 2026-11-13). Neither book prints it: the
 * Illustrated (p. 21) only names the fishing state, and the Companion (p. 55)
 * asks for the fish only to claim a fishing score. Off by default.
 */
export const WIN_NEEDS_FISH = "rule:win-needs-fish";

/** True when the table plays with the house rule `rule`. */
export function hasRule(state: GameState, rule: string): boolean {
  return state.excludedHands?.includes(rule) === true;
}

/**
 * Whether the rules let this seat go out now. Under `WIN_NEEDS_FISH` a seat
 * that was offered the announcement must have shown the fish; a seat never
 * offered it (a hand complete or waiting straight from the deal or a Goulash)
 * had no chance to, and may go out.
 */
export function mayGoOut(state: GameState, seat: Seat): boolean {
  if (!hasRule(state, WIN_NEEDS_FISH)) return true;
  if (state.fishing.some((entry) => entry.seat === seat)) return true;
  return state.fishOffered?.includes(seat) !== true;
}

/** True for an `excludedHands` entry that is a house rule rather than a hand. */
export function isRuleToken(entry: string): boolean {
  return entry.startsWith("rule:");
}

/**
 * What the engine leaves out of this hand: the hands the table plays without
 * by id, and by tier what a house rule bars from it. Pass this, never
 * `state.excludedHands` itself, to the matcher and the scorer.
 */
export function exclusionsOf(state: GameState): readonly string[] {
  const listed = state.excludedHands ?? [];
  if (!listed.some(isRuleToken)) return listed;
  const hands = listed.filter((entry) => !isRuleToken(entry));
  if (state.goulash === true && listed.includes(GOULASH_NO_HALF_LIMIT)) hands.push(tierExclusion("half"));
  return hands;
}

/** Tournament/agreed special-hand filter (R105(7)-(8), R106). */
export const ORDINARY_PATTERNS = new Set(["ordinary-mahjong", "chinese-ordinary"]);

export function allowedPattern(state: GameState, patternId: string, tier: Tier): boolean {
  if (isExcluded(exclusionsOf(state), patternId, tier)) return false;
  if (
    state.specialHands !== undefined &&
    !ORDINARY_PATTERNS.has(patternId) &&
    !state.specialHands.includes(patternId)
  ) {
    return false;
  }
  if (
    state.tournament === true &&
    !ORDINARY_PATTERNS.has(patternId) &&
    state.specialHands?.includes(patternId) !== false
  ) {
    const recent = state.recentSpecialHands ?? [];
    if (
      recent.length >= 2 &&
      recent[recent.length - 1] === patternId &&
      recent[recent.length - 2] === patternId
    ) {
      return false;
    }
  }
  return true;
}

/** True when the seat's current hand plus `tile` matches a catalogue hand. */
export function winsOnDiscard(state: GameState, seat: Seat, tile: string): boolean {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 13) return false;
  if (countOf(player.hand, tile) >= 4) return false;
  if (!mayGoOut(state, seat)) return false;
  const hand = buildHand(state, seat, { extra: tile, winningTile: tile, selfDrawn: false });
  return (
    hand !== null &&
    matchesAny(hand, (pattern, tier) => allowedPattern(state, pattern.id, tier))
  );
}

/** True when the seat's current 14-effective hand is already a win. */
export function handIsComplete(state: GameState, seat: Seat, winningTile: string): ScoreResult | null {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 14) return null;
  if (!mayGoOut(state, seat)) return null;
  const hand = buildHand(state, seat, { winningTile, selfDrawn: true });
  if (hand === null) return null;
  const score = scoreHand(hand, {
    limit: state.limit ?? DEFAULT_LIMIT,
    excluded: exclusionsOf(state),
  });
  if (score.winning === null || !allowedPattern(state, score.winning.pattern.id, score.winning.tier)) return null;
  return score;
}

/**
 * Every tile that completes the seat's 13-effective hand. The wait is the
 * full set, canonical order; this is what a fishing announcement fixes.
 */
export function waitsOf(state: GameState, seat: Seat): string[] {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 13) return [];
  const held = [
    ...player.hand,
    ...player.melds.flatMap((meld) => meld.tiles),
  ];
  const waits: string[] = [];
  for (const key of PLAY_TILE_KEYS) {
    if (countOf(held, key) >= 4) continue;
    // A wait is a tile that would win when drawn, so self-drawn-only patterns
    // count here even though they can never be claimed off a discard.
    const hand = buildHand(state, seat, { extra: key, selfDrawn: true });
    if (
      hand !== null &&
      matchesAny(hand, (pattern, tier) => allowedPattern(state, pattern.id, tier))
    ) {
      waits.push(key);
    }
  }
  return waits;
}

function tierRank(tier: Tier): number {
  const points = TIER_POINTS[tier];
  return points === null ? -1 : points;
}

function fishingFigure(tier: Tier): number | null {
  return tier === "calculate" ? null : TIER_FISHING[tier];
}

/**
 * The announced tier and printed fishing figure: the highest among the hands
 * that would complete the wait. An ordinary/Purity/All Honour completion uses
 * its ground score without the 20 for Mah Jong (I p. 32).
 */
export function fishingValueFor(
  state: GameState,
  seat: Seat,
  wait: readonly string[],
): { readonly tier: Tier; readonly value: number | null } | null {
  let bestTier: Tier | null = null;
  let bestValue: number | null = null;
  let bestRank = -1;
  for (const tile of wait) {
    const hand = buildHand(state, seat, {
      extra: tile,
      winningTile: tile,
      selfDrawn: true,
    });
    if (hand === null) continue;
    const score = scoreHand(hand, {
      withoutMahJongBonus: true,
      excluded: exclusionsOf(state),
    });
    const winning = score.winning;
    if (winning === null) continue;
    const value =
      winning.tier === "calculate"
        ? score.points
        : fishingFigure(winning.tier);
    if (value === null) continue;
    const rank = tierRank(winning.tier);
    if (bestTier === null || rank > bestRank) {
      bestTier = winning.tier;
      bestValue = value;
      bestRank = rank;
    }
  }
  return bestTier === null ? null : { tier: bestTier, value: bestValue };
}

/** The announcement available to a player who is one tile from mah jong. */
export function fishingDeclarationFor(
  state: GameState,
  seat: Seat,
): { readonly wait: string[]; readonly tier: Tier; readonly value: number | null } | null {
  if (state.fishing.some((declaration) => declaration.seat === seat)) return null;
  const wait = waitsOf(state, seat);
  if (wait.length === 0) return null;
  const scored = fishingValueFor(state, seat, wait);
  if (scored === null) return null;
  return { wait, tier: scored.tier, value: scored.value };
}

function chowKeys(suit: PlayTile, start: number): string[] {
  if (suit.kind !== "suited") return [];
  return [start, start + 1, start + 2].map((rank) => suitTileKey(suit.suit, rank));
}

export function completesAsChow(
  state: GameState,
  seat: Seat,
  handKeys: readonly string[],
  chow: readonly string[],
  needed: readonly string[],
): boolean {
  const player = playerOf(state, seat);
  const concealed = handKeys.slice();
  if (!removeKeys(concealed, needed)) return false;
  const melds: Meld[] = [
    ...meldsOf(player),
    { kind: "chow", tiles: toPlayTiles(chow), exposed: true },
  ];
  const hand = buildHand(state, seat, { concealedOverride: concealed, meldOverride: melds });
  return hand !== null && matchesAny(hand, () => true);
}

/**
 * Every claim the seat may make on `tile`, in one deterministic order:
 * mahjong, pung, kong, then each chow variant. Fishing does not narrow the
 * claim list: a fishing player may still pung, kong or chow (R67-R68).
 */
export function claimOptions(
  state: GameState,
  seat: Seat,
  tile: string,
  discarder: Seat,
  source: "discard" | "kong" = "discard",
): ClaimRecord[] {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 13) return [];
  const options: ClaimRecord[] = [];

  if (winsOnDiscard(state, seat, tile)) {
    options.push({ seat, kind: "mahjong", tiles: [tile] });
  }
  if (source === "kong") return options;

  const copies = countOf(player.hand, tile);
  if (copies >= 2) options.push({ seat, kind: "pung", tiles: [tile, tile, tile] });
  if (copies >= 3 && (wallRemaining(state) > 0 || state.wall.loose.length > 0)) {
    options.push({ seat, kind: "kong", tiles: [tile, tile, tile, tile] });
  }

  // A chow may be claimed by the player on the discarder's right (the next
  // seat in turn order), or by any player when it completes the hand. A
  // player who already has an exposed meld may claim a chow only to win.
  const parsed = parseTile(tile);
  if (state.goulash === true) return options;
  if (isSuited(parsed)) {
    const right = seat === nextSeat(discarder);
    const hasExposed = player.melds.some((meld) => meld.exposed);
    for (const start of [parsed.rank - 2, parsed.rank - 1, parsed.rank]) {
      if (start < 1 || start > 7) continue;
      const chow = chowKeys(parsed, start);
      const needed = chow.filter((key) => key !== tile);
      if (needed.length !== 2) continue;
      if (!needed.every((key) => countOf(player.hand, key) > 0)) continue;
      const wins = completesAsChow(state, seat, player.hand, chow, needed);
      if (!right && !wins) continue;
      if (hasExposed && !wins) continue;
      options.push({ seat, kind: "chow", tiles: sortKeys(chow) });
    }
  }
  return options;
}

/** R82: no Wind, Dragon, pair, Pung/Chow, terminal, Season or Flower. */
export function isFeaturelessHand(state: GameState, seat: Seat): boolean {
  const player = playerOf(state, seat);
  if (player.flowers.length > 0 || player.seasons.length > 0) return false;
  const counts = new Map<string, number>();
  for (const key of player.hand) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const [key, count] of counts) {
    const tile = parseTile(key);
    if (tile.kind === "wind" || tile.kind === "dragon") return false;
    if (tile.kind === "suited" && (tile.rank === 1 || tile.rank === 9)) return false;
    if (count >= 2) return false;
  }
  for (const [key] of counts) {
    const tile = parseTile(key);
    if (tile.kind !== "suited") continue;
    for (const start of [tile.rank - 2, tile.rank - 1, tile.rank]) {
      if (start < 1 || start > 7) continue;
      const run = [start, start + 1, start + 2].map((rank) =>
        suitTileKey(tile.suit, rank),
      );
      if (run.every((runKey) => counts.has(runKey))) return false;
    }
  }
  return true;
}
