/**
 * The deterministic reducer: `GameState + Action -> { state, events }`.
 *
 * Every rule from rules/archive/PLAY.md is enforced here, in one place:
 *   - the 144-tile deal, 13 each, dealer draws first (#1, #3)
 *   - flowers/seasons are bonuses replaced immediately (#2)
 *   - kongs take a loose tile from the BACK of the wall (#4, p. 34)
 *   - claim precedence mah jong > pung/kong > chow, ties nearest (#6, p. 34)
 *   - chow only from the seat on your left, never to complete (#7)
 *   - no minimum hand; any catalogue match goes out (#5)
 *   - fishing: fixed wait, no pung/chow/claim-kong afterwards (fishing DECIDED)
 *   - payments: discarder pays, self-draw from all three, dealer pays double
 *     (#8); fishing is 40% of the announced tier from each of the three
 *   - dealer repeats only on a dealer win or a drawn hand (#9, p. 34)
 *
 * Purity: `apply` deep-clones the input, never mutates it, never throws for an
 * ordinary illegal move (it returns `{ error, state }` with the input state
 * untouched), and never reads a clock or `Math.random`.
 */

import { createHand, type Hand, type Meld } from "../hand.ts";
import { matchHand } from "../match.ts";
import { scoreHand, type ScoreResult } from "../score.ts";
import { declareFishing, isWaitAlive, settleFishing } from "../fishing.ts";
import { TIER_FISHING, TIER_POINTS, type Tier } from "../patterns/types.ts";
import {
  isBonus,
  isSuited,
  parseTile,
  PLAY_TILE_KEYS,
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
  wallRemaining,
  type ClaimRecord,
  type ClaimWindow,
  type FishingState,
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
    });
  } catch {
    return null;
  }
}

/** True when the seat's current hand plus `tile` matches a catalogue hand. */
export function winsOnDiscard(state: GameState, seat: Seat, tile: string): boolean {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 13) return false;
  if (countOf(player.hand, tile) >= 4) return false;
  const hand = buildHand(state, seat, { extra: tile, winningTile: tile, selfDrawn: false });
  return hand !== null && matchHand(hand).length > 0;
}

/** True when the seat's current 14-effective hand is already a win. */
export function handIsComplete(state: GameState, seat: Seat, winningTile: string): ScoreResult | null {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 14) return null;
  const hand = buildHand(state, seat, { winningTile, selfDrawn: true });
  if (hand === null) return null;
  const score = scoreHand(hand);
  return score.winning === null ? null : score;
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
    if (hand !== null && matchHand(hand).length > 0) waits.push(key);
  }
  return waits;
}

/**
 * Dead-tile census for the fishing rule (p. 34): discards + melds of every
 * seat, plus the declaring player's own concealed hand. Other concealed
 * hands are unknown to the table and are not counted.
 */
export function deadTilesFor(state: GameState, seat: Seat): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const player of state.players) {
    for (const key of player.discards) add(key);
    for (const meld of player.melds) for (const key of meld.tiles) add(key);
  }
  for (const key of playerOf(state, seat).hand) add(key);
  return counts;
}

function tierRank(tier: Tier): number {
  const points = TIER_POINTS[tier];
  return points === null ? -1 : points;
}

/**
 * The tier a fishing declaration announces: the highest tier among the hands
 * that would complete the declared wait. Calculate stays Calculate.
 */
export function fishingTier(state: GameState, seat: Seat, wait: readonly string[]): Tier | null {
  let best: Tier | null = null;
  let calculate = false;
  for (const tile of wait) {
    const hand = buildHand(state, seat, {
      extra: tile,
      winningTile: tile,
      selfDrawn: true,
    });
    if (hand === null) continue;
    const score = scoreHand(hand);
    const tier = score.winning?.tier ?? null;
    if (tier === null) continue;
    if (tier === "calculate") calculate = true;
    else if (best === null || tierRank(tier) > tierRank(best)) best = tier;
  }
  return best ?? (calculate ? "calculate" : null);
}

/** Legal fishing declaration for the discarder, or null when none is legal. */
export function fishingDeclarationFor(
  state: GameState,
  seat: Seat,
): { readonly wait: string[]; readonly tier: Tier } | null {
  if (state.fishing.some((declaration) => declaration.seat === seat)) return null;
  const wait = waitsOf(state, seat);
  if (wait.length === 0) return null;
  if (!isWaitAlive(wait, deadTilesFor(state, seat))) return null;
  const tier = fishingTier(state, seat, wait);
  if (tier === null) return null;
  return { wait, tier };
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
  return hand !== null && matchHand(hand).length > 0;
}

/**
 * Every claim the seat may make on `tile`, in one deterministic order:
 * mahjong, pung, kong, then each chow variant. Fishing narrows this to
 * mahjong only (no pung, no chow, no claim-kong).
 */
export function claimOptions(
  state: GameState,
  seat: Seat,
  tile: string,
  discarder: Seat,
): ClaimRecord[] {
  const player = playerOf(state, seat);
  if (effectiveCount(player) !== 13) return [];
  const options: ClaimRecord[] = [];
  const fishing = state.fishing.some((declaration) => declaration.seat === seat);

  if (winsOnDiscard(state, seat, tile)) {
    options.push({ seat, kind: "mahjong", tiles: [tile] });
  }
  if (fishing) return options;

  const copies = countOf(player.hand, tile);
  if (copies >= 2) options.push({ seat, kind: "pung", tiles: [tile, tile, tile] });
  if (copies >= 3 && wallRemaining(state) > 0) {
    options.push({ seat, kind: "kong", tiles: [tile, tile, tile, tile] });
  }

  // Chow only from the player on your left — the seat that discarded just
  // before you in turn order — and never when the chow would complete the
  // hand (PLAY.md #7). In turn order that is the seat after the discarder.
  if (seat === nextSeat(discarder)) {
    const parsed = parseTile(tile);
    if (isSuited(parsed)) {
      for (const start of [parsed.rank - 2, parsed.rank - 1, parsed.rank]) {
        if (start < 1 || start > 7) continue;
        const chow = chowKeys(parsed, start);
        const needed = chow.filter((key) => key !== tile);
        if (needed.length !== 2) continue;
        if (!needed.every((key) => countOf(player.hand, key) > 0)) continue;
        if (completesAsChow(state, seat, player.hand, chow, needed)) continue;
        options.push({ seat, kind: "chow", tiles: sortKeys(chow) });
      }
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

function drawFrom(draft: Draft, end: "front" | "back"): string | null {
  if (draft.wall.front > draft.wall.back) return null;
  if (end === "front") {
    const key = draft.wall.tiles[draft.wall.front]!;
    draft.wall.front += 1;
    return key;
  }
  const key = draft.wall.tiles[draft.wall.back]!;
  draft.wall.back -= 1;
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
    const replacement = drawFrom(draft, "back");
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
    nextDealer: draft.dealer,
    reason,
  };
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
  if (wallRemaining(draft as GameState) === 0) {
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

function ledgerFor(
  draft: Draft,
  winner: Seat,
  from: Seat | null,
  selfDrawn: boolean,
  tier: Tier,
  points: number | null,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const others = SEATS.filter((seat) => seat !== winner);

  if (from !== null) {
    entries.push({
      from,
      to: winner,
      points,
      reason: points === null ? `win ${tier} (calculate, unscored)` : `win ${tier}`,
    });
  } else {
    for (const payer of others) {
      const doubled = payer === draft.dealer;
      const amount = points === null ? null : points * (doubled ? 2 : 1);
      entries.push({
        from: payer,
        to: winner,
        points: amount,
        reason:
          points === null
            ? `self-drawn ${tier} (calculate, unscored)`
            : `self-drawn ${tier}${doubled ? " (dealer double)" : ""}`,
      });
    }
  }

  // Fishing settles independently of the winner. Every non-winner declaration
  // collects the printed fishing figure from each of the other three seats.
  const declarations = draft.fishing.map((entry) => ({
    player: entry.seat,
    wait: entry.wait,
    tier: entry.tier,
  }));
  const awards = settleFishing(declarations, winner, TIER_FISHING);
  for (const award of awards) {
    for (const payer of SEATS) {
      if (payer === award.player) continue;
      entries.push({
        from: payer,
        to: award.player,
        points: award.points,
        reason:
          award.points === null
            ? `fishing ${award.tier} (calculate, unscored)`
            : `fishing ${award.tier}`,
      });
    }
  }
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
  const score = scoreHand(hand);
  const winning = score.winning;
  if (winning === null) {
    return { error: "hand does not match any catalogue pattern", state: draft as GameState };
  }

  emit({
    type: "WinDeclared",
    seat,
    from,
    selfDrawn,
    tile: winningTile,
    patternId: winning.pattern.id,
    tier: winning.tier,
    points: winning.points,
  });
  emit({
    type: "HandScored",
    seat,
    patternId: winning.pattern.id,
    patternName: winning.pattern.name,
    tier: winning.tier,
    points: winning.points,
    matches: score.matches.map((match) => match.pattern.id),
  });

  const entries = ledgerFor(draft, seat, from, selfDrawn, winning.tier, winning.points);
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
    points: winning.points,
    nextDealer: seat === draft.dealer ? draft.dealer : nextSeat(draft.dealer),
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

  if (claims.length === 0) {
    advanceTurn(draft, discarder, events, emit);
    return null;
  }

  const priority = (kind: ClaimKind): number =>
    kind === "mahjong" ? 3 : kind === "kong" || kind === "pung" ? 2 : 1;
  const distance = (seat: Seat): number =>
    (seatIndex(seat) - seatIndex(discarder) + SEATS.length) % SEATS.length;
  claims.sort((a, b) => priority(b.kind) - priority(a.kind) || distance(a.seat) - distance(b.seat));
  const claim = claims[0]!;

  if (claim.kind === "mahjong") {
    takeDiscard(draft, discarder, tile);
    const winner = draftPlayer(draft, claim.seat);
    winner.hand.push(tile);
    winner.hand.splice(0, winner.hand.length, ...sortKeys(winner.hand));
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
    const replacement = drawFrom(draft, "back");
    if (replacement === null) {
      finishDrawn(draft, "wall exhausted while replacing a claimed kong", emit);
      return null;
    }
    emit({ type: "KongReplacementDrawn", seat: claim.seat, tile: replacement });
    const tileAfter = replaceBonus(draft, claim.seat, replacement, events, emit);
    if (tileAfter === null) return null;
    draft.lastDraw = { seat: claim.seat, tile: tileAfter, end: "back" };
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
  const options = claimOptions(draft as GameState, seat, window.tile, window.discarder);
  const fishing = draft.fishing.some((declaration) => declaration.seat === seat);
  if (fishing && kind !== "mahjong") {
    return {
      error: "fishing player may not claim a pung, chow or kong from a discard",
      state: draft as GameState,
    };
  }
  const match = options.find(
    (option) => option.kind === kind && sameTiles(option.tiles, tiles),
  );
  if (match === undefined) {
    if (kind === "chow" && seat !== nextSeat(window.discarder)) {
      return { error: "chow is only allowed from the player on your left", state: draft as GameState };
    }
    return { error: `illegal ${kind} claim on ${window.tile}`, state: draft as GameState };
  }

  window.claims.push(match);
  window.pending.shift();
  if (window.pending.length === 0) return resolveClaims(draft, events, emit);
  draft.turn = window.pending[0]!;
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
    return { error: "fishing is not legal: no live wait", state: draft as GameState };
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
      deadTiles: deadTilesFor(draft as GameState, seat),
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
  if (wallRemaining(draft as GameState) === 0) {
    return { error: "no replacement tile available for a kong", state: draft as GameState };
  }

  if (added) {
    const meld = player.melds.find(
      (candidate) => candidate.kind === "pung" && !candidate.exposed && candidate.tiles[0] === tile,
    );
    if (meld === undefined) {
      return {
        error: "added kong needs your own concealed pung of that tile",
        state: draft as GameState,
      };
    }
    if (countOf(player.hand, tile) < 1) {
      return { error: `tile not in hand: ${tile}`, state: draft as GameState };
    }
    removeKeys(player.hand as string[], [tile]);
    meld.kind = "kong";
    meld.tiles = [tile, tile, tile, tile];
  } else {
    if (countOf(player.hand, tile) < 4) {
      return { error: `concealed kong needs four copies: ${tile}`, state: draft as GameState };
    }
    removeKeys(player.hand as string[], [tile, tile, tile, tile]);
    addMeld(draft, seat, { kind: "kong", tiles: [tile, tile, tile, tile], exposed: false });
  }

  emit({ type: "KongDeclared", seat, kind: added ? "added" : "concealed", tile });
  const replacement = drawFrom(draft, "back");
  if (replacement === null) {
    finishDrawn(draft, "wall exhausted while replacing a kong", emit);
    return null;
  }
  emit({ type: "KongReplacementDrawn", seat, tile: replacement });
  const after = replaceBonus(draft, seat, replacement, events, emit);
  if (after === null) return null;
  player.hand.push(after);
  player.hand.splice(0, player.hand.length, ...sortKeys(player.hand));
  draft.lastDraw = { seat, tile: after, end: "back" };
  draft.phase = "discard";
  draft.turn = seat;
  return null;
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
  const tiles = rng.shuffle(createTileSet()).map(tileKey);
  const stepsAfter = rngSteps + (tiles.length - 1);

  draft.seed = seed;
  draft.rngSteps = stepsAfter;
  draft.handNumber = handNumber;
  draft.dealer = dealer;
  draft.prevailingWind = "E";
  draft.players = SEATS.map((seat) => ({
    seat,
    hand: [],
    melds: [],
    flowers: [],
    seasons: [],
    discards: [],
  }));
  draft.wall = { tiles, front: 0, back: tiles.length - 1 };
  draft.turn = dealer;
  draft.phase = "draw";
  draft.lastDiscard = null;
  draft.claimWindow = null;
  draft.fishing = [];
  draft.ledger = [];
  draft.lastDraw = null;
  draft.result = null;

  for (let index = 0; index < SEATS.length * 13; index++) {
    const key = drawFrom(draft, "front")!;
    draftPlayer(draft, SEATS[index % SEATS.length]!).hand.push(key);
  }
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
}

export interface NewGameOptions {
  readonly dealer?: Seat;
}

/** Start hand 1 from a seed. The dealer's first draw is the first action. */
export function newGame(seed: string | number, options: NewGameOptions = {}): ApplyOk {
  const dealer = options.dealer ?? "E";
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
  const dealer = state.result.nextDealer;
  const draft = draftOf(state);
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
