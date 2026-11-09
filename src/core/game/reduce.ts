/**
 * The deterministic reducer: `GameState + Action -> { state, events }`.
 *
 * The rules in rules/RULES.md are enforced here, in one place:
 *   - the 144-tile Western deal or 136-tile Chinese deal; East starts at 14
 *     and discards first
 *   - flowers/seasons are bonuses replaced immediately; kong and bonus
 *     replacements come from the loose tiles (Western) or dead wall (Chinese)
 *   - claim precedence win > pung/kong > chow; a chow comes from the
 *     discarder's right or completes the hand
 *   - fishing is the announced state of needing one tile; it does not restrict
 *     claims and has no dead-wait rule
 *   - payments: all three losers pay the winner, East pays/receives double,
 *     rounded to 100; fishing is paid the same way (R69-R71, R76)
 *   - settlement levels: beginner winner only, intermediate winner plus
 *     fishing, advanced all hands with pairwise loser differences (R94)
 *   - the Wind of the Round advances when East passes; a drawn Western hand
 *     repeats East once and makes the next hand a Goulash with three chosen
 *     three-tile exchanges (R100-R104)
 *
 * Purity: `apply` deep-clones the input, never mutates it, never throws for an
 * ordinary illegal move (it returns `{ error, state }` with the input state
 * untouched), and never reads a clock or `Math.random`.
 */

import { createHand, type Hand, type Meld } from "../hand.ts";
import { matchesAny } from "../match.ts";
import { DEFAULT_LIMIT, scoreHand, type ScoreResult } from "../score.ts";
import { declareFishing } from "../fishing.ts";
import { TIER_FISHING, TIER_POINTS, type Tier } from "../patterns/types.ts";
import {
  isBonus,
  isSuited,
  parseTile,
  PLAY_TILE_KEYS,
  WINDS,
  suitTileKey,
  tileKey,
  type PlayTile,
  type Wind,
} from "../tiles.ts";
import { createRng } from "../rng.ts";
import { createTileSet } from "../tiles.ts";
import type { Action, ClaimKind } from "./actions.ts";
import type { Event } from "./events.ts";
import {
  SEATS,
  effectiveCount,
  nextSeat,
  playerOf,
  seatIndex,
  seatWindOf,
  tilesLeft,
  wallRemaining,
  type ClaimRecord,
  type ClaimWindow,
  type FishingState,
  type SettlementLevel,
  type GameState,
  type LedgerEntry,
  type MeldState,
  type PlayerState,
  type Seat,
} from "./state.ts";

export interface ApplyOk {
  readonly state: GameState;
  readonly events: readonly Event[];
}

export interface ApplyError {
  readonly error: string;
  readonly state: GameState;
}

export type ApplyResult = ApplyOk | ApplyError;

export function isApplyError(result: ApplyResult): result is ApplyError {
  return "error" in result;
}

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

type Draft = DeepMutable<GameState>;

type WithoutSeq<T> = T extends unknown ? Omit<T, "seq"> : never;
type EventInput = WithoutSeq<Event>;

type Emit = (event: EventInput) => void;

const KEY_ORDER = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));

export function sortKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => (KEY_ORDER.get(a) ?? 99) - (KEY_ORDER.get(b) ?? 99));
}

function countOf(keys: readonly string[], key: string): number {
  let count = 0;
  for (const candidate of keys) if (candidate === key) count++;
  return count;
}

function sameTiles(a: readonly string[], b: readonly string[]): boolean {
  const left = sortKeys(a);
  const right = sortKeys(b);
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function removeKeys(keys: string[], remove: readonly string[]): boolean {
  const copy = keys.slice();
  for (const key of remove) {
    const index = copy.indexOf(key);
    if (index < 0) return false;
    copy.splice(index, 1);
  }
  keys.splice(0, keys.length, ...copy);
  return true;
}

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

/** Tournament/agreed special-hand filter (R105(7)-(8), R106). */
const ORDINARY_PATTERNS = new Set(["ordinary-mahjong", "chinese-ordinary"]);

export function allowedPattern(state: GameState, patternId: string): boolean {
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
  const hand = buildHand(state, seat, { extra: tile, winningTile: tile, selfDrawn: false });
  return (
    hand !== null &&
    matchesAny(hand, (pattern) => allowedPattern(state, pattern.id))
  );
}

/** True when the seat's current 14-effective hand is already a win. */
export function handIsComplete(state: GameState, seat: Seat, winningTile: string): ScoreResult | null {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 14) return null;
  const hand = buildHand(state, seat, { winningTile, selfDrawn: true });
  if (hand === null) return null;
  const score = scoreHand(hand, { limit: state.limit ?? DEFAULT_LIMIT });
  if (score.winning === null || !allowedPattern(state, score.winning.pattern.id)) return null;
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
      matchesAny(hand, (pattern) => allowedPattern(state, pattern.id))
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

/** Companion-only double-limit hands keep their printed 800 fishing figure. */
const COMPANION_DOUBLE_FISHING = new Set(["up-you-go", "down-you-go"]);

function fishingFigure(tier: Tier, patternId: string): number | null {
  if (tier === "double" && COMPANION_DOUBLE_FISHING.has(patternId)) return 800;
  if (tier === "calculate") return null;
  return TIER_FISHING[tier];
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
    const score = scoreHand(hand, { withoutMahJongBonus: true });
    const winning = score.winning;
    if (winning === null) continue;
    const value =
      winning.tier === "calculate"
        ? score.points
        : fishingFigure(winning.tier, winning.pattern.id);
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

function completesAsChow(
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

function draftOf(state: GameState): Draft {
  return structuredClone(state) as unknown as Draft;
}

function draftPlayer(draft: Draft, seat: Seat): Draft["players"][number] {
  return draft.players[seatIndex(seat)]!;
}

/** Refill the loose pair from the replacement end of the wall. */
function refillLoose(draft: Draft): void {
  if (draft.variant === "chinese") return;
  while (draft.wall.loose.length < 2 && draft.wall.front <= draft.wall.back) {
    draft.wall.loose.push(draft.wall.tiles[draft.wall.back]!);
    draft.wall.back -= 1;
  }
}

function drawFrom(draft: Draft, end: "front" | "loose"): string | null {
  if (end === "front") {
    if (draft.wall.front > draft.wall.back) {
      // The live wall is gone: the Western loose pair is drawn down last, so
      // no tile is left over when the hand is drawn (I p. 21).
      if (draft.variant === "chinese") return null;
      return draft.wall.loose.shift() ?? null;
    }
    const key = draft.wall.tiles[draft.wall.front]!;
    draft.wall.front += 1;
    return key;
  }
  if (draft.variant === "chinese") {
    return draft.wall.dead?.pop() ?? null;
  }
  if (draft.wall.loose.length === 0) refillLoose(draft);
  const key = draft.wall.loose.shift();
  if (key === undefined) return null;
  if (draft.wall.loose.length === 0) refillLoose(draft);
  return key;
}

function addBonus(draft: Draft, seat: Seat, key: string): void {
  const player = draftPlayer(draft, seat);
  const tile = parseTile(key);
  if (tile.kind === "flower") player.flowers.push(key);
  else player.seasons.push(key);
}

/**
 * Bonus tiles are drawn and replaced immediately. The replacement comes from
 * the loose end (back), like a kong replacement (PLAY.md, p. 34).
 * Returns the play tile finally held, or null when the wall ran out.
 */
function replaceBonus(
  draft: Draft,
  seat: Seat,
  tile: string,
  events: Event[],
  emit: Emit,
): string | null {
  let current = tile;
  while (isBonus(parseTile(current))) {
    // Keep the bonus even when no replacement exists: the tile has been
    // turned over, so it belongs to the pool. Dropping it here made the
    // final bonus tile vanish from the 144-tile census.
    addBonus(draft, seat, current);
    const replacement = drawFrom(draft, "loose");
    if (replacement === null) {
      finishDrawn(draft, "wall exhausted while replacing a bonus tile", emit);
      return null;
    }
    emit({ type: "FlowerReplaced", seat, tile: current, replacement });
    current = replacement;
  }
  return current;
}

function finishDrawn(draft: Draft, reason: string, emit: Emit): void {
  draft.phase = "finished";
  draft.claimWindow = null;
  draft.lastDraw = null;
  draft.result = {
    kind: "drawn",
    winner: null,
    from: null,
    selfDrawn: false,
    patternId: null,
    patternName: null,
    tier: null,
    points: null,
    ground: null,
    doubles: null,
    raw: null,
    limit: draft.limit ?? DEFAULT_LIMIT,
    nextDealer:
      draft.tournament === true
        ? nextSeat(draft.dealer)
        : draft.drawRepeatUsed === true
          ? nextSeat(draft.dealer)
          : draft.dealer,
    reason,
    goulash: draft.tournament === true ? false : draft.variant !== "chinese",
  };
  if (draft.goulash === true && (draft.goulashPool ?? 0) > 0) {
    draft.goulashPool = (draft.goulashPool ?? 0) * 2;
  }
  const penalties = overfullEntries(draft);
  if (penalties.length > 0) {
    draft.ledger.push(...penalties);
    emit({ type: "Payments", entries: penalties });
  }
  if (draft.variant === "chinese") draft.kitty = (draft.kitty ?? 0) + 1;
  emit({ type: "DrawnHand", reason, dealer: draft.dealer });
}

function openClaims(draft: Draft, discarder: Seat, events: Event[], emit: Emit): void {
  const tile = draft.lastDiscard?.tile;
  if (tile === undefined) {
    advanceTurn(draft, discarder, events, emit);
    return;
  }
  const pending: Seat[] = [];
  let seat = nextSeat(discarder);
  for (let step = 0; step < SEATS.length - 1; step++) {
    if (claimOptions(draft as GameState, seat, tile, discarder).length > 0) pending.push(seat);
    seat = nextSeat(seat);
  }
  if (pending.length === 0) {
    advanceTurn(draft, discarder, events, emit);
    return;
  }
  draft.phase = "claim";
  draft.turn = pending[0]!;
  draft.claimWindow = { discarder, tile, pending, claims: [] };
}

function advanceTurn(draft: Draft, from: Seat, events: Event[], emit: Emit): void {
  draft.claimWindow = null;
  draft.phase = "draw";
  draft.turn = nextSeat(from);
  draft.lastDraw = null;
  if (tilesLeft(draft as GameState) === 0) {
    finishDrawn(draft, "wall exhausted with no winner", emit);
  }
}

function afterDiscard(draft: Draft, seat: Seat, events: Event[], emit: Emit): void {
  const declaration = fishingDeclarationFor(draft as GameState, seat);
  if (declaration !== null) {
    draft.phase = "announce";
    draft.turn = seat;
    return;
  }
  openClaims(draft, seat, events, emit);
}

/** Remove the just-discarded tile from the discarder's pile. */
function takeDiscard(draft: Draft, discarder: Seat, tile: string): void {
  const player = draftPlayer(draft, discarder);
  const index = player.discards.lastIndexOf(tile);
  if (index >= 0) player.discards.splice(index, 1);
}

function addMeld(draft: Draft, seat: Seat, meld: MeldState): void {
  draftPlayer(draft, seat).melds.push(meld);
}

/** Payments are made to the nearest 100; over 50 rounds up, 50 or less down. */
export function roundTo100(points: number): number {
  const remainder = Math.abs(points) % 100;
  const base = points - Math.sign(points) * remainder;
  return remainder > 50 ? base + Math.sign(points) * 100 : base;
}

/** The best ground-score route for a losing 13-tile hand, without the 20 (R69/R94). */
function losingHandPoints(draft: Draft, seat: Seat): number {
  const player = playerOf(draft as GameState, seat);
  if (effectiveCount(player) > 14) return 0;
  const limit = draft.limit ?? DEFAULT_LIMIT;
  let best = 0;
  for (const tile of waitsOf(draft as GameState, seat)) {
    const hand = buildHand(draft as GameState, seat, {
      extra: tile,
      winningTile: tile,
      selfDrawn: true,
    });
    if (hand === null) continue;
    const score = scoreHand(hand, {
      limit,
      withoutMahJongBonus: true,
      goulash: draft.goulash === true,
    });
    if (score.ground !== null) best = Math.max(best, score.ground);
  }
  return best;
}

/** Doubles held by a 13-tile hand, used for the careless-discard exemption (R79). */
function heldDoubles(draft: Draft, seat: Seat): number {
  for (const tile of waitsOf(draft as GameState, seat)) {
    const hand = buildHand(draft as GameState, seat, {
      extra: tile,
      winningTile: tile,
      selfDrawn: true,
    });
    if (hand === null) continue;
    const score = scoreHand(hand, {
      limit: draft.limit ?? DEFAULT_LIMIT,
      goulash: draft.goulash === true,
    });
    return score.doubles ?? 0;
  }
  return 0;
}

/** Too many tiles: pays every other player, scores nothing (R81). */
function overfullEntries(draft: Draft): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const penalty = (draft.limit ?? DEFAULT_LIMIT) / 2;
  for (const player of draft.players) {
    if (effectiveCount(player) <= 14) continue;
    for (const other of SEATS) {
      if (other === player.seat) continue;
      entries.push({
        from: player.seat,
        to: other,
        points: roundTo100(penalty),
        reason: `too many tiles (${effectiveCount(player)})`,
        kind: "too-many-tiles",
      });
    }
  }
  return entries;
}

/**
 * True when a player's exposed sets "indicate the tile needed" (I p. 22,
 * careless discards). The page does not say how many exposed tiles suffice;
 * the recorded narrowest reading (rules/archive/ASSUMPTIONS.md, "Careless
 * discard") is three or more exposed sets whose suited tiles are all of one
 * suit, which shows a one-suit hand: the indicated tiles are that suit and
 * the honours (only honours when every exposed set is of honours).
 */
export function exposureIndicates(melds: readonly MeldState[], tile: string): boolean {
  const exposed = melds.filter((meld) => meld.exposed);
  if (exposed.length < 3) return false;
  const suits = new Set(
    exposed.flatMap((meld) => meld.tiles).filter((key) => /^[bco]/.test(key)).map((key) => key[0]),
  );
  if (suits.size > 1) return false;
  if (!/^[bco]/.test(tile)) return true;
  return suits.has(tile[0]!);
}

function ledgerFor(
  draft: Draft,
  winner: Seat,
  from: Seat | null,
  selfDrawn: boolean,
  tier: Tier,
  points: number | null,
  winningTile: string,
  discarderHeldDoubles: number,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const others = SEATS.filter((seat) => seat !== winner);
  const winnerEntries: LedgerEntry[] = [];

  // All three losers pay the winner; the winner pays nobody. East pays and
  // receives double (I p. 21, R76-R78).
  for (const payer of others) {
    const doubled = payer === draft.dealer || winner === draft.dealer;
    const amount = points === null ? null : roundTo100(points * (doubled ? 2 : 1));
    const base = selfDrawn ? "self-drawn" : "win";
    const entry: LedgerEntry = {
      from: payer,
      to: winner,
      points: amount,
      reason:
        points === null
          ? `${base} ${tier} (calculate, unscored)`
          : `${base} ${tier}${doubled ? " (dealer double)" : ""}`,
      kind: "win",
      doubled,
    };
    winnerEntries.push(entry);
    entries.push(entry);
  }

  // Careless discard: when the winner's exposed tiles indicated the tile
  // needed, the discarder pays the other two losers' debts too, unless the
  // discarder was fishing or held at least three doubles (I p. 22, R79).
  if (from !== null && from !== winner) {
    const discarderFishing = draft.fishing.some((entry) => entry.seat === from);
    const visiblyNeeded = exposureIndicates(
      playerOf(draft as GameState, winner).melds,
      winningTile,
    );
    if (visiblyNeeded && !discarderFishing && discarderHeldDoubles < 3) {
      for (const entry of winnerEntries) {
        if (entry.from === from) continue;
        entries.push({
          from,
          to: winner,
          points: entry.points,
          reason: `careless discard for ${entry.from}`,
          kind: "careless",
          doubled: entry.doubled === true,
          covers: entry.from,
        });
      }
    }
  }

  // The winner is paid first and pays nobody; "the other players expose their
  // hands, total their scores and settle the differences" (I p. 21 #24). Which
  // losing hands are scored is the settlement level (I p. 24, R94): beginners
  // none, intermediate the fishing hands, advanced all of them.
  const settlement = draft.settlement ?? "intermediate";
  if (settlement !== "beginner") {
    const losers = others.filter((seat) => effectiveCount(playerOf(draft as GameState, seat)) <= 14);
    const scores = new Map<Seat, number>();
    for (const seat of losers) {
      if (settlement === "advanced") {
        scores.set(seat, losingHandPoints(draft, seat));
        continue;
      }
      const declaration = draft.fishing.find((entry) => entry.seat === seat);
      scores.set(
        seat,
        declaration === undefined ? 0 : (declaration.value ?? TIER_FISHING[declaration.tier] ?? 0),
      );
    }
    const label = settlement === "advanced" ? "losing hand difference" : "fishing difference";
    for (let i = 0; i < losers.length; i++) {
      for (let j = i + 1; j < losers.length; j++) {
        const a = losers[i]!;
        const b = losers[j]!;
        const delta = (scores.get(a) ?? 0) - (scores.get(b) ?? 0);
        if (delta === 0) continue;
        const higher = delta > 0 ? a : b;
        const lower = delta > 0 ? b : a;
        const doubled = lower === draft.dealer || higher === draft.dealer;
        const amount = roundTo100(Math.abs(delta) * (doubled ? 2 : 1));
        // Payments go to the nearest 100, 50 or less down: a small difference
        // is no payment, not a payment of 0.
        if (amount === 0) continue;
        entries.push({
          from: lower,
          to: higher,
          points: amount,
          reason: `${label}${doubled ? " (dealer double)" : ""}`,
          kind: settlement === "advanced" ? "difference" : "fishing",
          doubled,
          ...(settlement === "advanced"
            ? {}
            : { tier: draft.fishing.find((declaration) => declaration.seat === higher)?.tier }),
        });
      }
    }
  }

  if (draft.goulash === true && (draft.goulashPool ?? 0) > 0) {
    for (const payer of others) {
      entries.push({
        from: payer,
        to: winner,
        points: draft.goulashPool!,
        reason: "goulash pool",
        kind: "goulash",
      });
    }
  }

  entries.push(...overfullEntries(draft));
  return entries;
}

function finishWin(
  draft: Draft,
  seat: Seat,
  from: Seat | null,
  selfDrawn: boolean,
  winningTile: string,
  emit: Emit,
): ApplyError | null {
  const hand = buildHand(draft as GameState, seat, {
    winningTile,
    selfDrawn,
  });
  if (hand === null) return { error: "winning hand is not a valid hand", state: draft as GameState };
  const score = scoreHand(hand, {
    limit: draft.limit ?? DEFAULT_LIMIT,
    goulash: draft.goulash === true,
    wonOnLooseTile: selfDrawn && draft.lastDraw?.end === "loose",
    wonOnLastWallTile:
      selfDrawn &&
      draft.lastDraw?.end === "front" &&
      tilesLeft(draft as GameState) === 0,
  });
  const winning = score.winning;
  if (winning === null) {
    return { error: "hand does not match any catalogue pattern", state: draft as GameState };
  }
  if (!allowedPattern(draft as GameState, winning.pattern.id)) {
    return {
      error: `pattern not allowed at this table: ${winning.pattern.id}`,
      state: draft as GameState,
    };
  }
  if (draft.tournament === true && !ORDINARY_PATTERNS.has(winning.pattern.id)) {
    draft.recentSpecialHands = [
      ...(draft.recentSpecialHands ?? []),
      winning.pattern.id,
    ].slice(-2);
  }

  emit({
    type: "WinDeclared",
    seat,
    from,
    selfDrawn,
    tile: winningTile,
    patternId: winning.pattern.id,
    tier: winning.tier,
    points: score.points,
  });
  emit({
    type: "HandScored",
    seat,
    patternId: winning.pattern.id,
    patternName: winning.pattern.name,
    tier: winning.tier,
    points: score.points,
    ground: score.ground,
    doubles: score.doubles,
    raw: score.raw,
    limit: score.limit,
    matches: score.matches.map((match) => match.pattern.id),
  });

  const entries = ledgerFor(
    draft,
    seat,
    from,
    selfDrawn,
    winning.tier,
    score.points,
    winningTile,
    from === null ? 0 : heldDoubles(draft, from),
  );
  draft.ledger.push(...entries);
  emit({ type: "Payments", entries });

  draft.phase = "finished";
  draft.claimWindow = null;
  draft.lastDiscard = null;
  draft.lastDraw = null;
  draft.turn = seat;
  draft.result = {
    kind: "win",
    winner: seat,
    from,
    selfDrawn,
    patternId: winning.pattern.id,
    patternName: winning.pattern.name,
    tier: winning.tier,
    points: score.points,
    ground: score.ground,
    doubles: score.doubles,
    raw: score.raw,
    limit: score.limit,
    nextDealer:
      draft.tournament === true
        ? nextSeat(draft.dealer)
        : seat === draft.dealer
          ? draft.dealer
          : nextSeat(draft.dealer),
    reason: `win by ${winning.pattern.id}`,
  };
  return null;
}

function resolveClaims(draft: Draft, events: Event[], emit: Emit): ApplyError | null {
  const window = draft.claimWindow;
  if (window === null) return null;
  const claims = [...window.claims];
  const discarder = window.discarder;
  const tile = window.tile;

  draft.claimWindow = null;
  draft.lastDiscard = null;

  if (window.kind === "kong") {
    const kong = window.kong!;
    if (claims.length === 0) {
      return finishKongReplacement(
        draft,
        kong.seat,
        kong.tile,
        true,
        kong.meldIndex,
        events,
        emit,
      );
    }
    removeKeys(draftPlayer(draft, kong.seat).hand as string[], [kong.tile]);
    const winner = draftPlayer(draft, claims[0]!.seat);
    winner.hand.push(kong.tile);
    winner.hand.splice(0, winner.hand.length, ...sortKeys(winner.hand));
    return finishWin(draft, claims[0]!.seat, kong.seat, false, kong.tile, emit);
  }

  if (claims.length === 0) {
    advanceTurn(draft, discarder, events, emit);
    return null;
  }

  const winsOnClaim = (claim: ClaimRecord): boolean => {
    if (claim.kind === "mahjong") return true;
    if (claim.kind !== "chow") return false;
    const claimant = playerOf(draft as GameState, claim.seat);
    const needed = claim.tiles.filter((key) => key !== tile);
    return completesAsChow(draft as GameState, claim.seat, claimant.hand, claim.tiles, needed);
  };
  const priority = (claim: ClaimRecord): number =>
    winsOnClaim(claim) ? 3 : claim.kind === "kong" || claim.kind === "pung" ? 2 : 1;
  const distance = (seat: Seat): number =>
    (seatIndex(seat) - seatIndex(discarder) + SEATS.length) % SEATS.length;
  claims.sort((a, b) => priority(b) - priority(a) || distance(a.seat) - distance(b.seat));
  const claim = claims[0]!;

  if (claim.kind === "mahjong") {
    takeDiscard(draft, discarder, tile);
    const winner = draftPlayer(draft, claim.seat);
    winner.hand.push(tile);
    winner.hand.splice(0, winner.hand.length, ...sortKeys(winner.hand));
    return finishWin(draft, claim.seat, discarder, false, tile, emit);
  }

  if (winsOnClaim(claim)) {
    takeDiscard(draft, discarder, tile);
    const winner = draftPlayer(draft, claim.seat);
    const needed = claim.tiles.filter((key) => key !== tile);
    removeKeys(winner.hand as string[], needed);
    addMeld(draft, claim.seat, {
      kind: "chow",
      tiles: sortKeys(claim.tiles),
      exposed: true,
    });
    return finishWin(draft, claim.seat, discarder, false, tile, emit);
  }

  takeDiscard(draft, discarder, tile);
  const claimant = draftPlayer(draft, claim.seat);
  if (claim.kind === "pung") {
    removeKeys(claimant.hand as string[], [tile, tile]);
    addMeld(draft, claim.seat, { kind: "pung", tiles: [tile, tile, tile], exposed: true });
  } else if (claim.kind === "kong") {
    removeKeys(claimant.hand as string[], [tile, tile, tile]);
    addMeld(draft, claim.seat, {
      kind: "kong",
      tiles: [tile, tile, tile, tile],
      exposed: true,
    });
  } else {
    const needed = claim.tiles.filter((key) => key !== tile);
    removeKeys(claimant.hand as string[], needed);
    addMeld(draft, claim.seat, {
      kind: "chow",
      tiles: sortKeys(claim.tiles),
      exposed: true,
    });
  }

  emit({
    type: "Promoted",
    seat: claim.seat,
    from: discarder,
    kind: claim.kind,
  });
  emit({
    type: "Claimed",
    seat: claim.seat,
    from: discarder,
    kind: claim.kind,
    tiles: claim.tiles,
  });

  draft.turn = claim.seat;
  draft.phase = "discard";
  draft.lastDraw = null;

  if (claim.kind === "kong") {
    const replacement = drawFrom(draft, "loose");
    if (replacement === null) {
      finishDrawn(draft, "wall exhausted while replacing a claimed kong", emit);
      return null;
    }
    emit({ type: "KongReplacementDrawn", seat: claim.seat, tile: replacement });
    const tileAfter = replaceBonus(draft, claim.seat, replacement, events, emit);
    if (tileAfter === null) return null;
    draft.lastDraw = { seat: claim.seat, tile: tileAfter, end: "loose" };
    draftPlayer(draft, claim.seat).hand.push(tileAfter);
    draftPlayer(draft, claim.seat).hand.splice(
      0,
      draftPlayer(draft, claim.seat).hand.length,
      ...sortKeys(draftPlayer(draft, claim.seat).hand),
    );
  }
  return null;
}

function applyDraw(draft: Draft, seat: Seat, events: Event[], emit: Emit): ApplyError | null {
  if (draft.phase !== "draw") return { error: `cannot draw in phase ${draft.phase}`, state: draft as GameState };
  if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
  const tile = drawFrom(draft, "front");
  if (tile === null) {
    finishDrawn(draft, "wall exhausted with no winner", emit);
    return null;
  }
  emit({ type: "Drew", seat, tile, end: "front", replacement: false });
  const after = replaceBonus(draft, seat, tile, events, emit);
  if (after === null) return null;
  draftPlayer(draft, seat).hand.push(after);
  draftPlayer(draft, seat).hand.splice(
    0,
    draftPlayer(draft, seat).hand.length,
    ...sortKeys(draftPlayer(draft, seat).hand),
  );
  draft.phase = "discard";
  draft.turn = seat;
  draft.lastDraw = { seat, tile: after, end: "front" };
  return null;
}

function applyDiscard(
  draft: Draft,
  seat: Seat,
  tile: string,
  events: Event[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "discard") {
    return { error: `cannot discard in phase ${draft.phase}`, state: draft as GameState };
  }
  if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
  const player = draftPlayer(draft, seat);
  const index = player.hand.indexOf(tile);
  if (index < 0) return { error: `tile not in hand: ${tile}`, state: draft as GameState };
  player.hand.splice(index, 1);
  player.discards.push(tile);
  draft.lastDiscard = { seat, tile };
  draft.lastDraw = null;
  emit({ type: "Discarded", seat, tile });
  afterDiscard(draft, seat, events, emit);
  return null;
}

function applyClaim(
  draft: Draft,
  seat: Seat,
  kind: ClaimKind,
  tiles: readonly string[],
  events: Event[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "claim" || draft.claimWindow === null) {
    return { error: `no claim window is open`, state: draft as GameState };
  }
  const window = draft.claimWindow;
  if (window.pending[0] !== seat || draft.turn !== seat) {
    return { error: `not your claim to answer: ${seat}`, state: draft as GameState };
  }
  const options = claimOptions(
    draft as GameState,
    seat,
    window.tile,
    window.discarder,
    window.kind,
  );
  const match = options.find(
    (option) => option.kind === kind && sameTiles(option.tiles, tiles),
  );
  if (match === undefined) {
    if (kind === "chow" && seat !== nextSeat(window.discarder)) {
      return { error: "chow is only allowed from the player on your right", state: draft as GameState };
    }
    return { error: `illegal ${kind} claim on ${window.tile}`, state: draft as GameState };
  }

  window.claims.push(match);
  window.pending.shift();
  if (window.pending.length === 0) return resolveClaims(draft, events, emit);
  draft.turn = window.pending[0]!;
  return null;
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

function applyReshuffle(
  draft: Draft,
  seat: Seat,
  events: Event[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "discard") {
    return { error: "a reshuffle is requested only before play", state: draft as GameState };
  }
  if (draft.players.some((player) => player.discards.length > 0 || player.melds.length > 0)) {
    return { error: "a reshuffle is requested before the first discard", state: draft as GameState };
  }
  if (!isFeaturelessHand(draft as GameState, seat)) {
    return { error: `${seat} was not dealt a featureless hand`, state: draft as GameState };
  }
  emit({ type: "Reshuffled", seat, hand: draft.handNumber });
  dealHand(draft, draft.seed, draft.rngSteps + 144, draft.dealer, draft.handNumber, events, emit);
  return null;
}

function applyFalseMahJong(draft: Draft, seat: Seat, emit: Emit): ApplyError | null {
  if (draft.phase === "finished") {
    return { error: "the hand is already finished", state: draft as GameState };
  }
  const exposed = draft.players.some((player) =>
    player.melds.some((meld) => meld.exposed),
  );
  if (!exposed) {
    return {
      error: "play continues: no other player has exposed a hand",
      state: draft as GameState,
    };
  }
  const amount = roundTo100((draft.limit ?? DEFAULT_LIMIT) / 2);
  const entries: LedgerEntry[] = SEATS.filter((other) => other !== seat).map((other) => ({
    from: seat,
    to: other,
    points: amount,
    reason: "false Mah Jong (half limit)",
    kind: "false-mahjong",
  }));
  draft.ledger.push(...entries);
  emit({ type: "Payments", entries });
  return null;
}

/**
 * R-100 [I p. 21, 63]: "three tiles are exchanged with the player opposite.
 * Then East exchanges three tiles with South, West exchanges with North.
 * Lastly East exchanges three tiles with North while West and South exchange."
 */
export const GOULASH_PAIRS: readonly (readonly (readonly [Seat, Seat])[])[] = [
  [["E", "W"], ["S", "N"]],
  [["E", "S"], ["W", "N"]],
  [["E", "N"], ["W", "S"]],
];

/** Who `seat` exchanges with in Goulash `stage` (0, 1 or 2). */
export function goulashPartner(stage: 0 | 1 | 2, seat: Seat): Seat {
  const pair = GOULASH_PAIRS[stage]!.find(([a, b]) => a === seat || b === seat)!;
  return pair[0] === seat ? pair[1] : pair[0];
}

function applyGoulashExchange(
  draft: Draft,
  seat: Seat,
  tiles: readonly string[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "exchange" || draft.turn !== seat) {
    return { error: `not your exchange: ${seat}`, state: draft as GameState };
  }
  if (tiles.length !== 3) {
    return { error: "a Goulash exchange is exactly three tiles", state: draft as GameState };
  }
  const player = draftPlayer(draft, seat);
  const remaining = [...player.hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return { error: `not in hand: ${tile}`, state: draft as GameState };
    remaining.splice(index, 1);
  }
  const picks = { ...(draft.goulashPicks ?? {}) };
  if (picks[seat] !== undefined) {
    return { error: `already exchanged: ${seat}`, state: draft as GameState };
  }
  picks[seat] = [...tiles];
  draft.goulashPicks = picks;

  const next = SEATS.find((candidate) => picks[candidate] === undefined);
  if (next !== undefined) {
    draft.turn = next;
    return null;
  }

  const stage = draft.goulashStage ?? 0;
  for (const [a, b] of GOULASH_PAIRS[stage]) {
    const pickedA = picks[a]!;
    const pickedB = picks[b]!;
    const handA = draftPlayer(draft, a).hand as string[];
    const handB = draftPlayer(draft, b).hand as string[];
    removeKeys(handA, pickedA);
    removeKeys(handB, pickedB);
    handA.push(...pickedB);
    handB.push(...pickedA);
    handA.splice(0, handA.length, ...sortKeys(handA));
    handB.splice(0, handB.length, ...sortKeys(handB));
    emit({
      type: "GoulashExchanged",
      stage,
      a: { seat: a, tiles: [...pickedA] },
      b: { seat: b, tiles: [...pickedB] },
    });
  }

  if (stage < 2) {
    draft.goulashStage = (stage + 1) as 1 | 2;
    draft.goulashPicks = {};
    draft.turn = draft.dealer;
  } else {
    draft.goulashStage = undefined;
    draft.goulashPicks = undefined;
    draft.phase = "discard";
    draft.turn = draft.dealer;
    draft.lastDraw = null;
  }
  return null;
}

function applyPass(draft: Draft, seat: Seat, events: Event[], emit: Emit): ApplyError | null {
  if (draft.phase === "announce") {
    if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
    openClaims(draft, seat, events, emit);
    return null;
  }
  if (draft.phase === "claim" && draft.claimWindow !== null) {
    const window = draft.claimWindow;
    if (window.pending[0] !== seat || draft.turn !== seat) {
      return { error: `not your claim to answer: ${seat}`, state: draft as GameState };
    }
    window.pending.shift();
    if (window.pending.length === 0) return resolveClaims(draft, events, emit);
    draft.turn = window.pending[0]!;
    return null;
  }
  return { error: `cannot pass in phase ${draft.phase}`, state: draft as GameState };
}

function applyDeclareFishing(
  draft: Draft,
  seat: Seat,
  wait: readonly string[],
  events: Event[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "announce") {
    return { error: `cannot declare fishing in phase ${draft.phase}`, state: draft as GameState };
  }
  if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
  const declaration = fishingDeclarationFor(draft as GameState, seat);
  if (declaration === null) {
    return { error: "fishing is not legal: no wait to announce", state: draft as GameState };
  }
  if (!sameTiles(declaration.wait, wait)) {
    return {
      error: `declared wait must name every wait tile: ${declaration.wait.join(" ")}`,
      state: draft as GameState,
    };
  }
  let fixed;
  try {
    fixed = declareFishing({
      player: seat,
      wait: declaration.wait,
      tier: declaration.tier,
      value: declaration.value,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      state: draft as GameState,
    };
  }
  const entry: FishingState = {
    seat,
    wait: [...fixed.wait],
    tier: fixed.tier,
    value: fixed.value ?? null,
  };
  draft.fishing.push(entry);
  emit({
    type: "FishingDeclared",
    seat,
    wait: entry.wait,
    tier: entry.tier,
  });
  openClaims(draft, seat, events, emit);
  return null;
}

function finishKongReplacement(
  draft: Draft,
  seat: Seat,
  tile: string,
  added: boolean,
  meldIndex: number,
  events: Event[],
  emit: Emit,
): ApplyError | null {
  const player = draftPlayer(draft, seat);
  if (added) {
    removeKeys(player.hand as string[], [tile]);
    const meld = player.melds[meldIndex]!;
    meld.kind = "kong";
    meld.tiles = [tile, tile, tile, tile];
  } else {
    removeKeys(player.hand as string[], [tile, tile, tile, tile]);
    addMeld(draft, seat, { kind: "kong", tiles: [tile, tile, tile, tile], exposed: false });
  }

  emit({ type: "KongDeclared", seat, kind: added ? "added" : "concealed", tile });
  const replacement = drawFrom(draft, "loose");
  if (replacement === null) {
    finishDrawn(draft, "wall exhausted while replacing a kong", emit);
    return null;
  }
  emit({ type: "KongReplacementDrawn", seat, tile: replacement });
  const after = replaceBonus(draft, seat, replacement, events, emit);
  if (after === null) return null;
  player.hand.push(after);
  player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
  draft.lastDraw = { seat, tile: after, end: "loose" };
  draft.phase = "discard";
  draft.turn = seat;
  return null;
}

function applyKong(
  draft: Draft,
  seat: Seat,
  tile: string,
  added: boolean,
  events: Event[],
  emit: Emit,
): ApplyError | null {
  if (draft.phase !== "discard") {
    return { error: `cannot kong in phase ${draft.phase}`, state: draft as GameState };
  }
  if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
  const player = draftPlayer(draft, seat);
  if (wallRemaining(draft as GameState) === 0 && draft.wall.loose.length === 0) {
    return { error: "no replacement tile available for a kong", state: draft as GameState };
  }

  if (!added) {
    if (countOf(player.hand, tile) < 4) {
      return { error: `concealed kong needs four copies: ${tile}`, state: draft as GameState };
    }
    return finishKongReplacement(draft, seat, tile, false, -1, events, emit);
  }

  const meldIndex = player.melds.findIndex(
    (candidate) => candidate.kind === "pung" && candidate.tiles[0] === tile,
  );
  if (meldIndex < 0) {
    return {
      error: "added kong needs your own pung of that tile",
      state: draft as GameState,
    };
  }
  if (countOf(player.hand, tile) < 1) {
    return { error: `tile not in hand: ${tile}`, state: draft as GameState };
  }

  // An exposed pung may be robbed by any player who can win on the fourth
  // tile (I p. 21). A concealed pung has no rob window.
  const meld = player.melds[meldIndex]!;
  if (meld.exposed) {
    const pending: Seat[] = [];
    let candidate = nextSeat(seat);
    for (let step = 0; step < SEATS.length - 1; step++) {
      if (winsOnDiscard(draft as GameState, candidate, tile)) pending.push(candidate);
      candidate = nextSeat(candidate);
    }
    if (pending.length > 0) {
      draft.phase = "claim";
      draft.turn = pending[0]!;
      draft.claimWindow = {
        discarder: seat,
        tile,
        pending,
        claims: [],
        kind: "kong",
        kong: { seat, tile, meldIndex },
      };
      return null;
    }
  }

  return finishKongReplacement(draft, seat, tile, true, meldIndex, events, emit);
}

function applyWinSelfDrawn(draft: Draft, seat: Seat, events: Event[], emit: Emit): ApplyError | null {
  if (draft.phase !== "discard") {
    return { error: `cannot declare a self-drawn win in phase ${draft.phase}`, state: draft as GameState };
  }
  if (draft.turn !== seat) return { error: `not your turn: ${seat}`, state: draft as GameState };
  if (draft.lastDraw === null || draft.lastDraw.seat !== seat) {
    return { error: "a self-drawn win needs a tile drawn this turn", state: draft as GameState };
  }
  const tile = draft.lastDraw.tile;
  if (handIsComplete(draft as GameState, seat, tile) === null) {
    return { error: "hand does not complete", state: draft as GameState };
  }
  return finishWin(draft, seat, null, true, tile, emit);
}

export function apply(state: GameState, action: Action): ApplyResult {
  if (!SEATS.includes(action.seat)) {
    return { error: `unknown seat: ${String(action.seat)}`, state };
  }
  const draft = draftOf(state);
  const events: Event[] = [];
  let seq = state.eventSeq;
  const emit: Emit = (event) => {
    events.push({ ...event, seq } as Event);
    seq += 1;
  };

  let failure: ApplyError | null = null;
  switch (action.type) {
    case "Draw":
      failure = applyDraw(draft, action.seat, events, emit);
      break;
    case "Discard":
      failure = applyDiscard(draft, action.seat, action.tile, events, emit);
      break;
    case "Claim":
      failure = applyClaim(draft, action.seat, action.kind, action.tiles, events, emit);
      break;
    case "DeclareFishing":
      failure = applyDeclareFishing(draft, action.seat, action.wait, events, emit);
      break;
    case "ConcealedKong":
      failure = applyKong(draft, action.seat, action.tile, false, events, emit);
      break;
    case "AddedKong":
      failure = applyKong(draft, action.seat, action.tile, true, events, emit);
      break;
    case "Pass":
      failure = applyPass(draft, action.seat, events, emit);
      break;
    case "GoulashExchange":
      failure = applyGoulashExchange(draft, action.seat, action.tiles, emit);
      break;
    case "RequestReshuffle":
      failure = applyReshuffle(draft, action.seat, events, emit);
      break;
    case "FalseMahJong":
      failure = applyFalseMahJong(draft, action.seat, emit);
      break;
    case "Win":
      if (action.kind === "self-drawn") {
        failure = applyWinSelfDrawn(draft, action.seat, events, emit);
      } else if (action.kind === "on-discard") {
        const tile = draft.claimWindow?.tile;
        if (tile === undefined) {
          failure = { error: "no claim window is open", state: draft as GameState };
        } else {
          failure = applyClaim(draft, action.seat, "mahjong", [tile], events, emit);
        }
      } else {
        failure = { error: "unknown win kind", state: draft as GameState };
      }
      break;
    default: {
      // Runtime JSON can carry an action the union does not name.
      const unknown = action as unknown as { type?: unknown };
      failure = {
        error: `unknown action type: ${String(unknown.type)}`,
        state: draft as GameState,
      };
      break;
    }
  }

  if (failure !== null) return { error: failure.error, state };
  draft.eventSeq = seq;
  return { state: draft as GameState, events };
}

/**
 * Deal one hand into `draft`. Shared by `newGame` and `nextHand` so the
 * deal, the flower replacements and the RNG bookkeeping cannot drift apart.
 */
function dealHand(
  draft: Draft,
  seed: string | number,
  rngSteps: number,
  dealer: Seat,
  handNumber: number,
  events: Event[],
  emit: Emit,
): void {
  const rng = createRng(seed);
  for (let step = 0; step < rngSteps; step++) rng.next();
  const set =
    draft.variant === "chinese" || draft.tournament === true
      ? createTileSet().filter((tile) => !isBonus(tile))
      : createTileSet();
  const tiles = rng.shuffle(set).map(tileKey);
  const stepsAfter = rngSteps + (tiles.length - 1);

  draft.seed = seed;
  draft.rngSteps = stepsAfter;
  draft.handNumber = handNumber;
  draft.dealer = dealer;
  draft.players = SEATS.map((seat) => ({
    seat,
    hand: [],
    melds: [],
    flowers: [],
    seasons: [],
    discards: [],
  }));
  if (draft.variant === "chinese") {
    const dead = tiles.slice(tiles.length - 14);
    draft.wall = {
      tiles,
      front: 0,
      back: tiles.length - 14 - 1,
      loose: [],
      dead,
    };
  } else {
    draft.wall = { tiles, front: 0, back: tiles.length - 1, loose: [] };
    refillLoose(draft);
  }
  draft.turn = dealer;
  draft.phase = "discard";
  draft.lastDiscard = null;
  draft.claimWindow = null;
  draft.fishing = [];
  draft.ledger = [];
  draft.lastDraw = null;
  draft.result = null;

  // Four tiles at a time for three rounds (12 each), then one each, then
  // East's extra tile: East starts at 14 and discards first (I p. 18).
  for (let round = 0; round < 3; round++) {
    for (const seat of SEATS) {
      const player = draftPlayer(draft, seat);
      for (let index = 0; index < 4; index++) {
        player.hand.push(drawFrom(draft, "front")!);
      }
    }
  }
  for (const seat of SEATS) {
    draftPlayer(draft, seat).hand.push(drawFrom(draft, "front")!);
  }
  draftPlayer(draft, dealer).hand.push(drawFrom(draft, "front")!);
  for (const seat of SEATS) {
    const player = draftPlayer(draft, seat);
    player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
    emit({ type: "Dealt", seat, count: player.hand.length });
  }

  // Flowers and seasons dealt in the opening hand are replaced immediately.
  for (const seat of SEATS) {
    const player = draftPlayer(draft, seat);
    let index = 0;
    while (index < player.hand.length) {
      const key = player.hand[index]!;
      if (!isBonus(parseTile(key))) {
        index += 1;
        continue;
      }
      player.hand.splice(index, 1);
      const replacement = replaceBonus(draft, seat, key, events, emit);
      if (replacement === null) return;
      player.hand.push(replacement);
      player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
      // Do not advance: the replacement itself may be another bonus.
    }
  }

  if (draft.goulash === true) {
    draft.phase = "exchange";
    draft.turn = dealer;
    draft.goulashStage = 0;
    draft.goulashPicks = {};
    draft.lastDraw = null;
  }
}

export interface NewGameOptions {
  readonly dealer?: Seat;
  readonly variant?: "western" | "chinese";
  readonly limit?: number;
  readonly settlement?: SettlementLevel;
  readonly tournament?: boolean;
  readonly specialHands?: readonly string[];
  readonly goulash?: boolean;
  readonly goulashJokers?: "blank" | "two-bamboo";
  readonly goulashPool?: number;
}

/** Roll two dice per seat; the unique highest total becomes East (I p. 18). */
function rollForSeats(seed: string | number): {
  rolls: Record<Seat, number>;
  dealer: Seat;
} {
  const rng = createRng(`${seed}:seats`);
  for (;;) {
    const rolls = Object.fromEntries(
      SEATS.map((seat) => [seat, rng.int(6) + 1 + rng.int(6) + 1]),
    ) as Record<Seat, number>;
    const best = Math.max(...SEATS.map((seat) => rolls[seat]));
    const winners = SEATS.filter((seat) => rolls[seat] === best);
    if (winners.length === 1) return { rolls, dealer: winners[0]! };
  }
}

/** Start hand 1 from a seed. East starts at 14 and discards first. */
export function newGame(seed: string | number, options: NewGameOptions = {}): ApplyOk {
  if (options.specialHands !== undefined && options.specialHands.length > 14) {
    throw new Error("at most fourteen special hands may be selected");
  }
  const selected = options.dealer === undefined ? rollForSeats(seed) : null;
  const dealer = options.dealer ?? selected!.dealer;
  const events: Event[] = [];
  let seq = 0;
  const emit: Emit = (event) => {
    events.push({ ...event, seq } as Event);
    seq += 1;
  };
  const draft = {
    version: 1,
    seed,
    rngSteps: 0,
    handNumber: 1,
    dealer,
    prevailingWind: "E" as Wind,
    roundDealer: dealer,
    gameOver: false,
    limit: options.tournament === true ? 1000 : (options.limit ?? DEFAULT_LIMIT),
    settlement: options.settlement ?? "intermediate",
    tournament: options.tournament === true,
    recentSpecialHands: [],
    goulash: options.goulash === true,
    goulashPool: options.goulashPool ?? 0,
    drawRepeatUsed: false,
    variant: options.variant ?? "western",
    kitty: 0,
    goulash: false,
    players: [],
    wall: { tiles: [], front: 0, back: -1 },
    turn: dealer,
    phase: "draw" as const,
    lastDiscard: null,
    claimWindow: null,
    fishing: [],
    ledger: [],
    eventSeq: 0,
    lastDraw: null,
    result: null,
  } as unknown as Draft;
  if (selected !== null) draft.seatSelection = selected;
  if (options.specialHands !== undefined) draft.specialHands = [...options.specialHands];
  if (options.goulashJokers !== undefined) draft.goulashJokers = options.goulashJokers;
  dealHand(draft, seed, 0, dealer, 1, events, emit);
  draft.eventSeq = seq;
  return { state: draft as GameState, events };
}

/**
 * Deal the next hand after a finished one. The dealer repeats only when the
 * dealer won or the hand was drawn (PLAY.md #9, p. 34). Not an Action: the
 * engine exposes it separately so `apply` never invents a deal.
 */
export function nextHand(state: GameState): ApplyOk {
  if (state.phase !== "finished" || state.result === null) {
    throw new Error("nextHand requires a finished hand");
  }
  if (endsGame(state)) throw new Error("the game is over");
  const dealer = state.result.nextDealer;
  const draft = draftOf(state);
  if (endsRound(state)) {
    draft.prevailingWind = WINDS[WINDS.indexOf(state.prevailingWind) + 1]!;
    draft.roundDealer = dealer;
  }
  draft.drawRepeatUsed = state.result.kind === "drawn" && dealer === state.dealer;
  draft.goulash = state.result.goulash === true;
  const events: Event[] = [];
  let seq = state.eventSeq;
  const emit: Emit = (event) => {
    events.push({ ...event, seq } as Event);
    seq += 1;
  };
  emit({ type: "NextDeal", dealer, hand: state.handNumber + 1 });
  dealHand(draft, state.seed, state.rngSteps, dealer, state.handNumber + 1, events, emit);
  draft.eventSeq = seq;
  return { state: draft as GameState, events };
}

/**
 * R-032: a round is finished when each player has completed a turn as East
 * Wind. The deal passes one seat at a time (R-030), so the round ends with the
 * finished hand whose next dealer is the seat that opened the round.
 */
export function endsRound(state: GameState): boolean {
  if (state.phase !== "finished" || state.result === null) return false;
  const next = state.result.nextDealer;
  return next !== state.dealer && next === (state.roundDealer ?? "E");
}

/**
 * R-032: "A game ends ... when East, South, West and North have all been the
 * Wind of the Round" - the hand that finishes the North round finishes the
 * game, and no further hand is dealt.
 */
export function endsGame(state: GameState): boolean {
  if (state.gameOver === true) return true;
  return endsRound(state) && state.prevailingWind === WINDS[WINDS.length - 1];
}

/** Per-seat totals of the numeric ledger; null (Calculate) entries are counted. */
export function ledgerTotals(state: GameState): {
  readonly totals: Readonly<Record<Seat, number>>;
  readonly unknown: number;
} {
  const totals: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  let unknown = 0;
  for (const entry of state.ledger) {
    if (entry.points === null) {
      unknown += 1;
      continue;
    }
    totals[entry.to] += entry.points;
    totals[entry.from] -= entry.points;
  }
  return { totals, unknown };
}
