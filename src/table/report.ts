/**
 * The "Report a problem" text: who sent it, plus everything needed to replay
 * the game to the same state.
 *
 * A report is plain text. The header lines are for a human; the block between
 * the BEGIN/END markers is JSON holding the seed, the first dealer (East of
 * hand 1, by the dice) and every decision (`ReplayStep`) in order, bots included. `bin/replay.ts` reads a
 * report as it is, and `replayReport` here is the same replay in code.
 *
 * Nothing else leaves the table: no `GameState`, no checkpoint, no hand or
 * wall tiles. The seed deals the wall, so replaying reconstructs the hands -
 * that is the one thing a replayable report must carry, and it is the same
 * data the saved game already holds.
 */

import { replaySteps, type ApplyOk, type ReplayStep } from "../core/game/index.ts";
import { SEATS, type Seat } from "../core/game/state.ts";
import { houseRulesOf, type WebSession } from "./session.ts";

export const REPORT_FORMAT = "int-maj-report/1";
export const REPLAY_BEGIN = "-----BEGIN REPLAY-----";
export const REPLAY_END = "-----END REPLAY-----";

/** What the app knows about itself and the tester; the table knows the rest. */
export interface ReportInfo {
  readonly version: string;
  /** The build id, as shown in the menu. */
  readonly build: string;
  readonly userAgent: string;
  readonly note?: string;
}

/** The replayable part of a report. */
export interface ReportReplay {
  readonly format: typeof REPORT_FORMAT;
  readonly seed: string | number;
  /** East of hand 1. For a game dealt by the dice this is what they chose. */
  readonly dealer: Seat;
  /** Hand 1 was dealt by the dice, so the seed decides the dealer when replayed. */
  readonly dice?: true;
  /** The house-rule exclusion list hand 1 was dealt with; absent means none. */
  readonly excludedHands?: readonly string[];
  readonly steps: readonly ReplayStep[];
  /** Indices in `steps` that the human chose. */
  readonly humanSteps: readonly number[];
}

const NOTE_LIMIT = 280;

/** One line, no control characters, bounded: the note cannot break the layout. */
function oneLine(text: string, limit: number): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim().slice(0, limit);
}

export function buildReport(session: WebSession, info: ReportInfo): string {
  const replay: ReportReplay = {
    format: REPORT_FORMAT,
    seed: session.seed,
    dealer: session.firstDealer ?? "E",
    ...(session.dealtByDice === true ? { dice: true as const } : {}),
    ...(session.excludedAtStart === undefined || session.excludedAtStart.length === 0
      ? {}
      : { excludedHands: session.excludedAtStart }),
    steps: session.steps,
    humanSteps: session.humanSteps,
  };
  const note = oneLine(info.note ?? "", NOTE_LIMIT);
  return [
    "int-maj problem report",
    `Version: ${oneLine(info.version, 40)}`,
    `Build: ${oneLine(info.build, 40)}`,
    `User agent: ${oneLine(info.userAgent, 300)}`,
    `Hand: ${session.state.handNumber} (${session.state.phase})`,
    `House rules: hand set ${houseRulesOf(session.state).handSet}`,
    `Decisions: ${session.steps.length} (yours: ${session.humanSteps.length})`,
    `Note: ${note === "" ? "(none)" : note}`,
    "",
    REPLAY_BEGIN,
    JSON.stringify(replay),
    REPLAY_END,
    "",
  ].join("\n");
}

export function isReportText(text: string): boolean {
  return text.includes(REPLAY_BEGIN);
}

/** Read the replay block back out of a report. */
export function parseReport(text: string): ReportReplay | { readonly error: string } {
  const start = text.indexOf(REPLAY_BEGIN);
  const end = text.indexOf(REPLAY_END);
  if (start < 0 || end < start) return { error: "no replay block in the report" };
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start + REPLAY_BEGIN.length, end));
  } catch {
    return { error: "the replay block is not valid JSON" };
  }
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  if (record.format !== REPORT_FORMAT) return { error: "unknown report format" };
  if (typeof record.seed !== "string" && typeof record.seed !== "number") return { error: "report has no seed" };
  if (!SEATS.includes(record.dealer as Seat)) return { error: "report has no dealer" };
  const { steps, humanSteps, excludedHands, dice } = record;
  if (dice !== undefined && dice !== true) return { error: "report has a malformed dice flag" };
  if (
    excludedHands !== undefined &&
    !(Array.isArray(excludedHands) && excludedHands.every((id) => typeof id === "string"))
  ) {
    return { error: "report has a malformed excluded-hands list" };
  }
  if (
    !Array.isArray(steps) ||
    !steps.every((step) => typeof step === "object" && step !== null && typeof (step as { type?: unknown }).type === "string")
  ) {
    return { error: "report has no step list" };
  }
  if (!Array.isArray(humanSteps) || !humanSteps.every((index) => Number.isInteger(index))) {
    return { error: "report has no human step list" };
  }
  return {
    format: REPORT_FORMAT,
    seed: record.seed,
    dealer: record.dealer as Seat,
    ...(dice === true ? { dice: true as const } : {}),
    ...(excludedHands === undefined ? {} : { excludedHands: excludedHands as string[] }),
    steps: steps as ReplayStep[],
    humanSteps: humanSteps as number[],
  };
}

/** Replay a report's decisions from its seed; throws if they no longer replay. */
export function replayReport(report: ReportReplay): ApplyOk {
  return replaySteps(report.seed, report.steps, {
    ...(report.dice === true ? {} : { dealer: report.dealer }),
    ...(report.excludedHands === undefined ? {} : { excludedHands: report.excludedHands }),
  });
}
