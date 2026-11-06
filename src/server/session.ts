/**
 * Web-table sessions: one game, one human seat, three bots.
 *
 * This module is the only place the server touches a `GameState`. Everything
 * it hands to the browser is built from `viewFor` plus the table-side checker
 * in `src/core/check.ts`; a raw `GameState` never leaves the process. The
 * reducer stays the authority on legality: a human action is applied through
 * `apply`, and an illegal one returns the reducer's own wording with the
 * session untouched.
 *
 * The bots are driven by the same pure policy as the console table
 * (`chooseAction` over `viewFor`), so the web table introduces no new game
 * logic. Every action, human or bot, is recorded as a replay step; undo drops
 * the previous human decision and replays from the seed, exactly like
 * `console.ts`.
 */

import { checkHand, summarizeMatch, type MatchSummary } from "../core/check.ts";
import { tileKey } from "../core/tiles.ts";
import type { Action } from "../core/game/actions.ts";
import { chooseAction } from "../core/game/bot.ts";
import type { Event } from "../core/game/events.ts";
import {
  apply,
  isApplyError,
  ledgerTotals,
  newGame,
  nextHand,
} from "../core/game/reduce.ts";
import { replaySteps, type ReplayStep } from "../core/game/replay.ts";
import {
  SEATS,
  seatWindOf,
  type GameState,
  type LedgerEntry,
  type MeldState,
  type Seat,
} from "../core/game/state.ts";
import { viewFor, type GameView, type PlayerView } from "../core/game/view.ts";
import type { Wind } from "../core/tiles.ts";
import type { Tier } from "../core/patterns/types.ts";
import { PATTERNS } from "../core/patterns/table.ts";

/** The web table always seats you at East, and deals to you. */
const SEAT: Seat = "E";

const PATTERN_NAMES: ReadonlyMap<string, string> = new Map(
  PATTERNS.map((pattern) => [pattern.id, pattern.name]),
);

export interface WebSession {
  readonly id: string;
  readonly seed: string | number;
  /** The human's fixed seat. The web table seats you at East. */
  readonly seat: Seat;
  readonly state: GameState;
  /** Every step needed to rebuild `state` from the seed, including NextHand. */
  readonly steps: readonly ReplayStep[];
  /** Indices in `steps` that the human chose, in order. */
  readonly humanSteps: readonly number[];
  readonly events: readonly Event[];
}

export interface SessionUpdate {
  readonly session: WebSession;
  /** Events produced by this request only. */
  readonly events: readonly Event[];
}

export interface WaitPanelEntry {
  readonly tile: string;
  readonly remaining: number;
  readonly dead: boolean;
  /** The tile completes the hand only when drawn, never off a discard. */
  readonly selfDrawnOnly: boolean;
  readonly matches: readonly MatchSummary[];
  readonly best: MatchSummary | null;
}

export type CheckerPayload =
  | { readonly size: 13; readonly waits: readonly WaitPanelEntry[] }
  | {
      readonly size: 14;
      readonly matches: readonly MatchSummary[];
      readonly best: MatchSummary | null;
      readonly concealed: boolean;
    }
  | { readonly size: null; readonly errors: readonly string[] };

export interface OutcomePattern {
  readonly id: string;
  readonly name: string;
}

export interface OutcomePayload {
  readonly kind: "win" | "drawn";
  readonly winner: Seat | null;
  readonly from: Seat | null;
  readonly selfDrawn: boolean;
  readonly patternId: string | null;
  readonly patternName: string | null;
  readonly tier: Tier | null;
  readonly points: number | null;
  readonly ground: number | null;
  readonly doubles: number | null;
  readonly raw: number | null;
  readonly limit: number;
  readonly reason: string;
  /** The tile that completed the hand, as shown on the table. */
  readonly winningTile: string | null;
  /**
   * The winner's concealed tiles, only when the viewer is the winner.
   * Another seat's concealed hand is never part of any payload.
   */
  readonly hand: readonly string[] | null;
  /** Public melds of the winner, or null for a drawn hand. */
  readonly melds: readonly MeldState[] | null;
  /** Public concealed-hand count of the winner. */
  readonly handCount: number;
  readonly matches: readonly OutcomePattern[];
  readonly ledger: readonly LedgerEntry[];
  /** Ledger entries whose reason names a fishing settlement. */
  readonly fishing: readonly LedgerEntry[];
  readonly totals: Readonly<Record<Seat, number>>;
  readonly unknown: number;
}

export interface TableSeat {
  readonly seat: Seat;
  readonly wind: Wind;
  readonly dealer: boolean;
  readonly isYou: boolean;
  readonly handCount: number;
  readonly melds: readonly MeldState[];
  readonly discards: readonly string[];
  readonly flowers: readonly string[];
  readonly seasons: readonly string[];
}

export interface StatePayload {
  readonly game: string;
  readonly seat: Seat;
  readonly seed: string | number;
  readonly view: GameView;
  readonly legalActions: readonly Action[];
  readonly wallRemaining: number;
  readonly ledger: readonly LedgerEntry[];
  readonly table: readonly TableSeat[];
  readonly checker: CheckerPayload;
  readonly outcome: OutcomePayload | null;
}

function startSession(id: string, seed: string | number): WebSession {
  // You are East and the deal is yours, so the first discard is yours too.
  const { state, events } = newGame(seed, { dealer: SEAT });
  return {
    id,
    seed,
    seat: SEAT,
    state,
    steps: [],
    humanSteps: [],
    events: [...events],
  };
}

/**
 * Exactly one bot decision, or null when the table is waiting on the human (or
 * the hand is over). The browser asks for these one at a time, from the beat
 * itself, so a payload never carries more than one throw: the table advances
 * at the pace it is shown, not a round ahead of it.
 *
 * Bots see only their own `viewFor` projection, so this cannot reveal a hand
 * to the client either: only their public events are appended.
 */
function botStep(session: WebSession): SessionUpdate | null {
  if (session.state.phase === "finished") return null;
  if (viewFor(session.state, session.seat).legalActions.length > 0) return null;
  const actor = session.state.turn;
  const action = chooseAction(viewFor(session.state, actor), actor);
  if (action === null) return null;
  const result = apply(session.state, action);
  if (isApplyError(result)) {
    throw new Error(`bot ${actor} produced an illegal action: ${result.error}`);
  }
  return {
    session: {
      ...session,
      state: result.state,
      steps: [...session.steps, action],
      events: [...session.events, ...result.events],
    },
    events: result.events,
  };
}

/** A step either moves the table, says it is the human's move, or fails. */
export type StepUpdate =
  | SessionUpdate
  | { readonly done: true }
  | { readonly error: string };

export function isDone(update: StepUpdate): update is { readonly done: true } {
  return "done" in update;
}

/**
 * The checker's input for one seat: exposed melds in parentheses, then the
 * concealed hand — the same string a player would type at the table.
 */
export function handCheck(player: PlayerView) {
  const melds = player.melds.map((meld) => `(${meld.tiles.join(" ")})`);
  return checkHand([...melds, ...player.hand].join(" "));
}

function checkerFor(player: PlayerView): CheckerPayload {
  const result = handCheck(player);
  if (result.size === 13) {
    return {
      size: 13,
      waits: result.waits.map((wait) => ({
        tile: tileKey(wait.tile),
        remaining: wait.remaining,
        dead: wait.dead,
        selfDrawnOnly: wait.selfDrawnOnly,
        matches: wait.matches.map(summarizeMatch),
        best: wait.matches[0] === undefined ? null : summarizeMatch(wait.matches[0]),
      })),
    };
  }
  if (result.size === 14) {
    return {
      size: 14,
      matches: result.matches.map(summarizeMatch),
      best: result.best === null ? null : summarizeMatch(result.best),
      concealed: result.concealed,
    };
  }
  return { size: null, errors: [...result.errors] };
}

function tableFor(state: GameState, view: GameView): TableSeat[] {
  return SEATS.map((seat) => {
    const wind = seatWindOf(state, seat);
    const dealer = seat === state.dealer;
    if (seat === view.seat) {
      return {
        seat,
        wind,
        dealer,
        isYou: true,
        handCount: view.player.hand.length,
        melds: view.player.melds,
        discards: view.player.discards,
        flowers: view.player.flowers,
        seasons: view.player.seasons,
      };
    }
    const opponent = view.opponents.find((entry) => entry.seat === seat);
    if (opponent === undefined) throw new Error(`missing opponent view for ${seat}`);
    return {
      seat,
      wind,
      dealer,
      isYou: false,
      handCount: opponent.handCount,
      melds: opponent.melds,
      discards: opponent.discards,
      flowers: opponent.flowers,
      seasons: opponent.seasons,
    };
  });
}

function outcomeFor(session: WebSession, view: GameView): OutcomePayload | null {
  const state = session.state;
  if (state.phase !== "finished" || state.result === null) return null;
  const result = state.result;

  // Events accumulate across hands; the last NextDeal starts this one.
  const dealIndex = session.events.findLastIndex((event) => event.type === "NextDeal");
  const handEvents = session.events.slice(dealIndex + 1);
  const scored = [...handEvents].reverse().find((event) => event.type === "HandScored");
  const win = [...handEvents].reverse().find((event) => event.type === "WinDeclared");
  const totals = ledgerTotals(state);

  const isWinner = result.winner !== null && result.winner === view.seat;
  let hand: readonly string[] | null = null;
  let melds: readonly MeldState[] | null = null;
  let handCount = 0;
  if (result.winner !== null) {
    if (isWinner) {
      hand = [...view.player.hand];
      melds = view.player.melds;
      handCount = view.player.hand.length;
    } else {
      const opponent = view.opponents.find((entry) => entry.seat === result.winner);
      melds = opponent?.melds ?? null;
      handCount = opponent?.handCount ?? 0;
    }
  }

  return {
    kind: result.kind,
    winner: result.winner,
    from: result.from,
    selfDrawn: result.selfDrawn,
    patternId: result.patternId,
    patternName: result.patternName,
    tier: result.tier,
    points: result.points,
    ground: result.ground,
    doubles: result.doubles,
    raw: result.raw,
    limit: result.limit,
    reason: result.reason,
    winningTile: win?.type === "WinDeclared" ? win.tile : null,
    hand,
    melds,
    handCount,
    matches:
      scored?.type === "HandScored"
        ? scored.matches.map((id) => ({ id, name: PATTERN_NAMES.get(id) ?? id }))
        : [],
    ledger: state.ledger,
    fishing: state.ledger.filter((entry) => entry.reason.startsWith("fishing")),
    totals: totals.totals,
    unknown: totals.unknown,
  };
}

/** The complete browser-facing state: `viewFor` plus derived public tables. */
export function statePayload(session: WebSession): StatePayload {
  const view = viewFor(session.state, session.seat);
  return {
    game: session.id,
    seat: session.seat,
    seed: session.seed,
    view,
    legalActions: [...view.legalActions],
    wallRemaining: view.wallRemaining,
    ledger: view.ledger,
    table: tableFor(session.state, view),
    checker: checkerFor(view.player),
    outcome: outcomeFor(session, view),
  };
}

export interface GameStoreOptions {
  readonly defaultSeed?: string | number;
}

/**
 * In-memory games keyed by a short id. No persistence: a restart deals fresh
 * tables, and the seed in the payload is enough to reproduce any hand.
 */
export class GameStore {
  readonly defaultSeed: string | number;
  private readonly sessions = new Map<string, WebSession>();
  private nextId = 0;

  constructor(options: GameStoreOptions = {}) {
    this.defaultSeed = options.defaultSeed ?? "web";
  }

  create(seed: string | number = this.defaultSeed): SessionUpdate {
    const id = `g${++this.nextId}`;
    const session = startSession(id, seed);
    this.sessions.set(id, session);
    return { session, events: [...session.events] };
  }

  get(id: string): WebSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Keep a session built outside `create` — a review scenario replayed from
   * its seed — under a fresh id, so the browser can read and play it exactly
   * like a dealt game.
   */
  adopt(session: Omit<WebSession, "id">): WebSession {
    const stored: WebSession = { ...session, id: `g${++this.nextId}` };
    this.sessions.set(stored.id, stored);
    return stored;
  }

  /** Read-only inspection for tests; never serialised to a client. */
  state(id: string): GameState | undefined {
    return this.sessions.get(id)?.state;
  }

  move(id: string, action: Action): SessionUpdate | { readonly error: string } {
    const session = this.sessions.get(id);
    if (session === undefined) return { error: `unknown game: ${id}` };
    if (action.seat !== session.seat) {
      return { error: `not your turn: ${String(action.seat)}` };
    }
    const before = session.events.length;
    const result = apply(session.state, action);
    if (isApplyError(result)) return { error: result.error };
    const next: WebSession = {
      ...session,
      state: result.state,
      steps: [...session.steps, action],
      humanSteps: [...session.humanSteps, session.steps.length],
      events: [...session.events, ...result.events],
    };
    this.sessions.set(id, next);
    return { session: next, events: next.events.slice(before) };
  }

  /**
   * The table's next decision. The browser calls this whenever the human has
   * nothing to do, so every throw arrives as its own payload and the beat the
   * player watches is the beat the game actually runs at.
   */
  step(id: string): StepUpdate {
    const session = this.sessions.get(id);
    if (session === undefined) return { error: `unknown game: ${id}` };
    const stepped = botStep(session);
    if (stepped === null) return { done: true };
    this.sessions.set(id, stepped.session);
    return stepped;
  }

  undo(id: string): SessionUpdate | { readonly error: string } {
    const session = this.sessions.get(id);
    if (session === undefined) return { error: `unknown game: ${id}` };
    const last = session.humanSteps.at(-1);
    if (last === undefined) return { error: "nothing to undo" };
    const steps = session.steps.slice(0, last);
    const replayed = replaySteps(session.seed, steps, { dealer: SEAT });
    const next: WebSession = {
      ...session,
      state: replayed.state,
      steps,
      humanSteps: session.humanSteps.slice(0, -1),
      events: replayed.events,
    };
    this.sessions.set(id, next);
    return { session: next, events: [] };
  }

  next(id: string): SessionUpdate | { readonly error: string } {
    const session = this.sessions.get(id);
    if (session === undefined) return { error: `unknown game: ${id}` };
    if (session.state.phase !== "finished") {
      return { error: "nextHand requires a finished hand" };
    }
    const before = session.events.length;
    const dealt = nextHand(session.state);
    const next: WebSession = {
      ...session,
      state: dealt.state,
      steps: [...session.steps, { type: "NextHand" }],
      events: [...session.events, ...dealt.events],
    };
    this.sessions.set(id, next);
    return { session: next, events: next.events.slice(before) };
  }
}
