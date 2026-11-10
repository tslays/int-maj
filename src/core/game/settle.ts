/**
 * Ending a hand: the result, and who pays whom.
 *
 *   - payments: all three losers pay the winner, East pays/receives double,
 *     rounded to 100; fishing is paid the same way (R69-R71, R76)
 *   - settlement levels: beginner winner only, intermediate winner plus
 *     fishing, advanced all hands with pairwise loser differences (R94)
 *   - a drawn hand pays nothing but its penalties, and a drawn Western hand
 *     makes the next one a Goulash
 */

import { DEFAULT_LIMIT, scoreHand } from "../score.ts";
import { TIER_FISHING, type Tier } from "../patterns/types.ts";
import {
  SEATS,
  effectiveCount,
  nextSeat,
  playerOf,
  tilesLeft,
  type GameState,
  type LedgerEntry,
  type MeldState,
  type Seat,
} from "./state.ts";
import type { ApplyError, Draft, Emit } from "./draft.ts";
import { ORDINARY_PATTERNS, allowedPattern, buildHand, waitsOf } from "./hands.ts";

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

export function finishDrawn(draft: Draft, reason: string, emit: Emit): void {
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

export function finishWin(
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
