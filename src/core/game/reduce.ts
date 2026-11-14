/**
 * The deterministic reducer: `GameState + Action -> { state, events }`.
 *
 * The rules in rules/RULES.md are enforced by this module and its helpers:
 * `hands.ts` (what a seat's tiles make), `draws.ts` (the wall), `settle.ts`
 * (results and payments) and `deal.ts` (dealing and rounds), all working on
 * the `draft.ts` copy. The turn itself is here:
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

import { DEFAULT_LIMIT } from "../score.ts";
import { declareFishing } from "../fishing.ts";
import type { Action, ClaimKind } from "./actions.ts";
import type { Event } from "./events.ts";
import {
  SEATS,
  nextSeat,
  playerOf,
  seatIndex,
  tilesLeft,
  wallRemaining,
  type ClaimRecord,
  type GameState,
  type LedgerEntry,
  type Seat,
} from "./state.ts";
import { type ApplyError, type ApplyResult, type Draft, type Emit, addMeld, countOf, draftOf, draftPlayer, noteFirstDiscardClaim, removeKeys, sameTiles, sortKeys, takeDiscard } from "./draft.ts";
import { claimOptions, completesAsChow, fishingDeclarationFor, handIsComplete, isFeaturelessHand, winsOnDiscard } from "./hands.ts";
import { drawFrom, replaceBonus } from "./draws.ts";
import { finishDrawn, finishWin, roundTo100 } from "./settle.ts";
import { dealHand } from "./deal.ts";

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
    const offered = draft.fishOffered ?? [];
    if (!offered.includes(seat)) draft.fishOffered = [...offered, seat];
    return;
  }
  openClaims(draft, seat, events, emit);
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
    return finishWin(draft, claims[0]!.seat, kong.seat, false, kong.tile, emit, true);
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
  noteFirstDiscardClaim(draft, discarder, claim.seat);

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

  window.claims.push({ ...match, tiles: [...match.tiles] });
  window.pending.shift();
  if (window.pending.length === 0) return resolveClaims(draft, events, emit);
  draft.turn = window.pending[0]!;
  return null;
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
  for (const [a, b] of GOULASH_PAIRS[stage]!) {
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
  const entry = {
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
