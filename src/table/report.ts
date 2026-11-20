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
import { SEATS, type GameState, type Seat } from "../core/game/state.ts";
import { houseRulesOf, type HouseRules, type WebSession } from "./session.ts";

export const REPORT_FORMAT = "int-maj-report/1";
export const REPLAY_BEGIN = "-----BEGIN REPLAY-----";
export const REPLAY_END = "-----END REPLAY-----";

/**
 * Every choice the player has made on the device, as the app keeps it: the
 * table cannot see these, and a bug often turns on one of them. Values are the
 * app's own ids (`medium`, `pile`), printed as they are.
 */
export interface ReportSettings {
  /** Bot level: easy, medium or hard. */
  readonly botLevel: string;
  /** Pace: slower, normal or faster. */
  readonly pace: string;
  /** Hint style: likeliest, mixed or discovery. */
  readonly hintStyle: string;
  /** Table animations (dice, dealing, thrown counters) on or skipped. */
  readonly animations: boolean;
  /** Sound on, or muted. */
  readonly sound: boolean;
  /** Large discards on: the phone's switch, reported whichever device filed the report. */
  readonly largeDiscards: boolean;
  readonly tileNumbers: boolean;
  /** Discards laid out in rows or in a pile. */
  readonly discards: string;
  /** The Hints toggle: the closest-hands panel shown. */
  readonly hints: boolean;
  /** Tips shown on this device; "No more tips" turns them off. */
  readonly tips: boolean;
  /** Sort: the game keeps the hand in order; off, the tiles stay where the player put them. */
  readonly sort: boolean;
  /** The look (Settings, Style): the theme, or the felt, backs, fronts, room and buttons chosen. */
  readonly look: string;
  /** The hands pinned to the panel, in pin order. */
  readonly pinned: readonly string[];
  /** The house rules chosen for the next deal; they differ from the hand's in force when pending. */
  readonly rules: HouseRules;
}

/** What the app knows about itself and the tester; the table knows the rest. */
export interface ReportInfo {
  readonly version: string;
  /** The build id, as shown in the menu. */
  readonly build: string;
  readonly userAgent: string;
  readonly note?: string;
  /** The player's stored choices; absent, the report carries no Settings lines. */
  readonly settings?: ReportSettings;
}

/** Most pinned hands the panel holds; the report lists no more. */
const MAX_PINNED = 3;

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

/** The three house rules in words; the same wording serves the hand in force and the choice. */
function rulesText(rules: HouseRules): string {
  return [
    `hand set ${oneLine(rules.handSet, 30)}`,
    `half-limit hands in a Goulash ${rules.goulashNoHalfLimit ? "barred" : "allowed"}`,
    `a win ${rules.winNeedsFish ? "needs the fish shown" : "needs no announcement"}`,
  ].join(", ");
}

/**
 * The Settings, Pinned hands and Rules chosen lines: the player's choices as
 * they stand when the report is filed. The rules line says whether the choice
 * is the one in force in the hand, or waits for the next deal.
 */
function settingsLines(settings: ReportSettings, inForce: HouseRules): string[] {
  const word = (value: string) => oneLine(value, 30);
  const onOff = (on: boolean) => (on ? "on" : "off");
  const pinned = settings.pinned.slice(0, MAX_PINNED).map((id) => oneLine(id, 60));
  const chosen = settings.rules;
  const same =
    chosen.handSet === inForce.handSet &&
    chosen.goulashNoHalfLimit === inForce.goulashNoHalfLimit &&
    chosen.winNeedsFish === inForce.winNeedsFish;
  return [
    `Settings: bot level ${word(settings.botLevel)}, pace ${word(settings.pace)}, hint style ${word(settings.hintStyle)}, animations ${onOff(settings.animations)}, sound ${onOff(settings.sound)}, large discards ${onOff(settings.largeDiscards)}, tile numbers ${onOff(settings.tileNumbers)}, discards ${word(settings.discards)}, hints ${onOff(settings.hints)}, tips ${onOff(settings.tips)}, sort ${onOff(settings.sort)}, look ${oneLine(settings.look, 90)}`,
    `Pinned hands: ${pinned.length === 0 ? "none" : pinned.join(", ")}`,
    `Rules chosen: ${rulesText(chosen)} (${same ? "in force in this hand" : "change starts next hand"})`,
  ];
}

/**
 * Whether the hand in play is a Goulash, and if so whether the table bars
 * half-limit hands in it. Logged per hand, so a report shows the hand it was
 * filed from, not only the table's house-rule setting.
 */
function goulashWord(state: GameState): string {
  if (state.goulash !== true) return "no (this hand is not a Goulash)";
  const barred = houseRulesOf(state).goulashNoHalfLimit;
  return `yes, half-limit hands ${barred ? "barred" : "allowed"} in this hand`;
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
  const inForce = houseRulesOf(session.state);
  return [
    "int-maj problem report",
    `Version: ${oneLine(info.version, 40)}`,
    `Build: ${oneLine(info.build, 40)}`,
    `User agent: ${oneLine(info.userAgent, 300)}`,
    `Hand: ${session.state.handNumber} (${session.state.phase})`,
    `Goulash: ${goulashWord(session.state)}`,
    `House rules: ${rulesText(inForce)}`,
    `Decisions: ${session.steps.length} (yours: ${session.humanSteps.length})`,
    ...(info.settings === undefined ? [] : settingsLines(info.settings, inForce)),
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
