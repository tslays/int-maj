/**
 * The console table's pure layer: argument parsing, command parsing, table
 * text and the undo-capable session. No I/O lives here, so the terminal loop
 * in bin/play.ts stays a thin readline wrapper and every parser is testable.
 * The one-line action and event texts live in the engine
 * (`src/core/game/describe.ts`), shared with the table service.
 *
 * The table is rendered from `viewFor` only. That is what stops the console
 * from accidentally showing another seat's hand and keeps it identical to
 * the projection a bot receives.
 *
 * Undo is defined as "replay from the seed to just before the previous human
 * decision": the session records every action (including the bots' replies),
 * remembers which indices were typed by the human, and drops the last one
 * before replaying. That is the same contract as `replaySteps`, so an undo
 * cannot drift from the engine.
 */

import type { Action } from "../core/game/actions.ts";
import type { Event } from "../core/game/events.ts";
import { isApplyError } from "../core/game/draft.ts";
import { newGame } from "../core/game/deal.ts";
import { apply } from "../core/game/reduce.ts";
import { replaySteps } from "../core/game/replay.ts";
import { SEATS, type GameState, type LedgerEntry, type Seat } from "../core/game/state.ts";
import type { GameView } from "../core/game/view.ts";

export interface PlayOptions {
  readonly seed: string;
  readonly seat: Seat;
  readonly bot: boolean;
  readonly events: boolean;
  readonly help: boolean;
}

export const PLAY_USAGE = `Usage: npm run play -- [options]

Options:
  --seed <seed>   deal seed (default "console")
  --seat E|S|W|N  the seat you play (default E)
  --bot           all four seats played by the bot
  --events        print every engine event as it happens
  --help          show this help

Commands (at your decision):
  d <n>    discard tile n from the numbered hand
  p        claim pung
  c        claim chow (c <n> picks the nth chow variant)
  k        claim kong (or a concealed/added kong on your turn)
  m        claim mahjong, or go out self-drawn
  f        announce the fishing wait
  space    pass
  u        undo the previous decision
  h        help
  q        quit`;

export function parsePlayArgs(argv: readonly string[]): PlayOptions {
  let seed = "console";
  let seat: Seat = "E";
  let bot = false;
  let events = false;
  let help = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--seed") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--seed needs a value");
      seed = value;
    } else if (argument === "--seat") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--seat needs E, S, W or N");
      if (!(SEATS as readonly string[]).includes(value)) {
        throw new Error(`unknown seat "${value}"; use E, S, W or N`);
      }
      seat = value as Seat;
    } else if (argument === "--bot") {
      bot = true;
    } else if (argument === "--events") {
      events = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option "${argument}"`);
    } else {
      throw new Error(`unexpected argument "${argument}"`);
    }
  }

  return { seed, seat, bot, events, help };
}

export type ConsoleCommand =
  | { readonly kind: "action"; readonly action: Action }
  | { readonly kind: "undo" }
  | { readonly kind: "help" }
  | { readonly kind: "quit" }
  | { readonly kind: "invalid"; readonly message: string };

function invalid(message: string): ConsoleCommand {
  return { kind: "invalid", message };
}

function claimOf(view: GameView, kind: "pung" | "chow" | "kong" | "mahjong"): Action | undefined {
  return view.legalActions.find(
    (action) => action.type === "Claim" && action.kind === kind,
  );
}

/**
 * Translate one line into an action drawn from `view.legalActions`. A command
 * that is legal in general but not now (a pung with no legal pung) is rejected
 * with the same message as a typo, so the caller can reprint the options and
 * leave the state untouched.
 */
export function parseCommand(line: string, view: GameView): ConsoleCommand {
  const text = line.trim();
  const tokens = text.length === 0 ? [] : text.toLowerCase().split(/\s+/);
  const command = tokens[0] ?? "";

  if (command === "q" || command === "quit") return { kind: "quit" };
  if (command === "h" || command === "help") return { kind: "help" };
  if (command === "u" || command === "undo") return { kind: "undo" };

  if (command === "" || command === "space") {
    const pass = view.legalActions.find((action) => action.type === "Pass");
    return pass === undefined ? invalid("There is nothing to pass.") : { kind: "action", action: pass };
  }

  if (command === "d") {
    const hand = view.player.hand;
    const index = Number(tokens[1]);
    if (!Number.isInteger(index) || index < 1 || index > hand.length) {
      return invalid(`d needs a tile number from 1 to ${hand.length}.`);
    }
    const tile = hand[index - 1]!;
    const action = view.legalActions.find(
      (candidate) => candidate.type === "Discard" && candidate.tile === tile,
    );
    return action === undefined
      ? invalid(`Cannot discard ${tile} now.`)
      : { kind: "action", action };
  }

  if (command === "p") {
    const action = claimOf(view, "pung");
    return action === undefined ? invalid("No pung is legal now.") : { kind: "action", action };
  }

  if (command === "c") {
    const chows = view.legalActions.filter(
      (action) => action.type === "Claim" && action.kind === "chow",
    );
    if (chows.length === 0) return invalid("No chow is legal now.");
    const index = tokens[1] === undefined ? 1 : Number(tokens[1]);
    if (!Number.isInteger(index) || index < 1 || index > chows.length) {
      return invalid(`c needs a chow number from 1 to ${chows.length}.`);
    }
    return { kind: "action", action: chows[index - 1]! };
  }

  if (command === "k") {
    const action =
      claimOf(view, "kong") ??
      view.legalActions.find((candidate) => candidate.type === "AddedKong") ??
      view.legalActions.find((candidate) => candidate.type === "ConcealedKong");
    return action === undefined ? invalid("No kong is legal now.") : { kind: "action", action };
  }

  if (command === "m") {
    const action =
      view.legalActions.find((candidate) => candidate.type === "Win") ??
      claimOf(view, "mahjong");
    return action === undefined ? invalid("Mahjong is not legal now.") : { kind: "action", action };
  }

  if (command === "f") {
    const action = view.legalActions.find((candidate) => candidate.type === "DeclareFishing");
    return action === undefined ? invalid("Fishing is not legal now.") : { kind: "action", action };
  }

  return invalid(`Unknown command "${tokens[0]}".`);
}

/** One line naming every legal action the viewer currently has. */
export function commandPrompt(view: GameView): string {
  if (view.phase === "finished") return "Hand finished.";
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (part: string) => {
    if (seen.has(part)) return;
    seen.add(part);
    parts.push(part);
  };

  for (const action of view.legalActions) {
    switch (action.type) {
      case "Draw":
        add("draw");
        break;
      case "Discard":
        add("d <n> discard");
        break;
      case "Claim":
        if (action.kind === "pung") add("p pung");
        else if (action.kind === "chow") add("c chow");
        else if (action.kind === "kong") add("k kong");
        else add("m mahjong");
        break;
      case "DeclareFishing":
        add(`f fishing ${action.wait.join(" ")}`);
        break;
      case "ConcealedKong":
      case "AddedKong":
        add("k kong");
        break;
      case "Win":
        add("m mahjong");
        break;
      case "Pass":
        add("space pass");
        break;
    }
  }

  if (parts.length === 0) return `Waiting for ${view.turn} (${view.phase}).`;
  return `Legal: ${parts.join(" | ")}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function scoreLine(ledger: readonly LedgerEntry[]): string {
  const totals: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  let unknown = 0;
  for (const entry of ledger) {
    if (entry.points === null) {
      unknown += 1;
      continue;
    }
    totals[entry.to] += entry.points;
    totals[entry.from] -= entry.points;
  }
  const line = SEATS.map((seat) => `${seat} ${signed(totals[seat])}`).join("  ");
  return unknown > 0 ? `${line}  (${unknown} calculate entries unscored)` : line;
}

function meldText(melds: readonly { kind: string; tiles: readonly string[] }[]): string {
  if (melds.length === 0) return "none";
  return melds.map((meld) => `(${meld.tiles.join(" ")})`).join(" ");
}

function resultText(view: GameView): string | null {
  const result = view.result;
  if (result === null) return null;
  if (result.kind === "drawn") return `Result: drawn hand — ${result.reason}`;
  const points = result.points === null ? "" : ` ${result.points}`;
  const source = result.selfDrawn ? "self-drawn" : `on ${result.from}'s discard`;
  return `Result: ${result.winner} wins ${result.patternName} (${result.tier}${points}, ${source})`;
}

/**
 * The whole table from one seat's view. The viewer's hand is numbered because
 * `d <n>` reads those numbers; opponents show only counts, melds and discards.
 */
export function renderTable(view: GameView): string {
  const lines: string[] = [];
  lines.push(
    `Hand ${view.handNumber} · dealer ${view.dealer} · ${view.prevailingWind} round · ` +
      `wall ${view.wallRemaining} · turn ${view.turn} (${view.phase})`,
  );
  lines.push(`Scores: ${scoreLine(view.ledger)}`);
  if (view.ledger.length > 0) {
    const entries = view.ledger
      .map((entry) => `${entry.from}->${entry.to} ${entry.points === null ? "calculate" : entry.points} (${entry.reason})`)
      .join("; ");
    lines.push(`Ledger: ${entries}`);
  }

  for (const seat of SEATS) {
    const label = `${seat}${seat === view.dealer ? " (dealer)" : ""}${seat === view.seat ? " (you)" : ""}`;
    if (seat === view.seat) {
      const hand = view.player.hand.map((tile, index) => `${index + 1}:${tile}`).join(" ");
      lines.push(`${label}  hand: ${hand.length > 0 ? hand : "(empty)"}`);
      lines.push(
        `    melds: ${meldText(view.player.melds)} · discards: ${view.player.discards.join(" ") || "none"}` +
          ` · bonus: ${[...view.player.flowers, ...view.player.seasons].join(" ") || "none"}`,
      );
    } else {
      const opponent = view.opponents.find((entry) => entry.seat === seat);
      if (opponent === undefined) continue;
      lines.push(`${label}  hand: ${opponent.handCount} concealed`);
      lines.push(
        `    melds: ${meldText(opponent.melds)} · discards: ${opponent.discards.join(" ") || "none"}` +
          ` · bonus: ${[...opponent.flowers, ...opponent.seasons].join(" ") || "none"}`,
      );
    }
  }

  if (view.lastDiscard !== null) {
    lines.push(`Last discard: ${view.lastDiscard.seat} ${view.lastDiscard.tile}`);
  }
  if (view.claimWindow !== null) {
    lines.push(
      `Claim on ${view.claimWindow.discarder}'s ${view.claimWindow.tile}: ` +
        `${view.claimWindow.pending.join(", ")}`,
    );
  }
  for (const declaration of view.fishing) {
    lines.push(
      declaration.wait.length > 0
        ? `Fishing: ${declaration.seat} on ${declaration.wait.join(" ")} (${declaration.tier})`
        : `Fishing: ${declaration.seat}`,
    );
  }
  const result = resultText(view);
  if (result !== null) lines.push(result);
  return lines.join("\n");
}

export interface PlaySession {
  readonly seed: string;
  readonly state: GameState;
  readonly actions: readonly Action[];
  /** Indices in `actions` that were typed by the human, in order. */
  readonly humanActions: readonly number[];
  readonly events: readonly Event[];
}

export function startSession(seed: string): PlaySession {
  const { state, events } = newGame(seed);
  return { seed, state, actions: [], humanActions: [], events };
}

export function recordAction(
  session: PlaySession,
  action: Action,
  human: boolean,
): PlaySession {
  const result = apply(session.state, action);
  if (isApplyError(result)) throw new Error(result.error);
  const actions = [...session.actions, action];
  return {
    seed: session.seed,
    state: result.state,
    actions,
    humanActions: human ? [...session.humanActions, actions.length - 1] : session.humanActions,
    events: [...session.events, ...result.events],
  };
}

/** Drop the previous human decision and everything the bots did after it. */
export function undoLastDecision(session: PlaySession): PlaySession | null {
  const last = session.humanActions.at(-1);
  if (last === undefined) return null;
  const actions = session.actions.slice(0, last);
  const humanActions = session.humanActions.slice(0, -1);
  const replayed = replaySteps(session.seed, actions);
  return {
    seed: session.seed,
    state: replayed.state,
    actions,
    humanActions,
    events: replayed.events,
  };
}
