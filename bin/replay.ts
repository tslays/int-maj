#!/usr/bin/env node
/**
 * Replay a hand from a seed plus an action list, or from a public event log.
 *
 *   npm run replay -- hand.json
 *   npm run replay -- --events hand.json
 *   npm run replay -- --seed table-7 < hand.json
 *   cat hand.json | npm run replay
 *
 * The input is JSON: { "seed": ..., "actions": [...] } for an action list,
 * or { "seed": ..., "events": [...] } with --events. The tool only prints;
 * the reducer in src/core/game stays pure and I/O-free.
 */

import { readFileSync } from "node:fs";

import {
  ledgerTotals,
  replaySteps,
  stepsFromEvents,
  describeEvent,
  type Action,
  type Event,
  type GameState,
  type LedgerEntry,
  type Seat,
  type ReplayStep,
} from "../src/core/game/index.ts";
import { isReportText, parseReport } from "../src/table/report.ts";
import { PACKED_BEGIN, unpackReport } from "../src/worker/pack.ts";

const USAGE = `Usage: npm run replay -- <file.json>
       npm run replay -- --events <file.json>
       npm run replay -- <problem-report.txt>
       cat <file.json> | npm run replay
Options:
  --events       treat the input's "events" as the replay source
  --seed <seed>  seed when the input has no seed field
  --json         machine-readable final state, event log and totals`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function printLedger(ledger: readonly LedgerEntry[], state: GameState): void {
  console.log("");
  console.log("Ledger:");
  if (ledger.length === 0) {
    console.log("  (empty)");
  } else {
    for (const entry of ledger) {
      console.log(
        `  ${entry.from} pays ${entry.to} ${entry.points === null ? "calculate" : entry.points} (${entry.reason})`,
      );
    }
  }
  const { totals, unknown } = ledgerTotals(state);
  const line = (["E", "S", "W", "N"] as const)
    .map((seat) => `${seat} ${signed(totals[seat])}`)
    .join("  ");
  console.log(`Totals: ${line}${unknown > 0 ? `  (${unknown} unscored Calculate entries)` : ""}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let eventsMode = false;
  let json = false;
  let seedArg: string | undefined;
  let path: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--events") eventsMode = true;
    else if (arg === "--json") json = true;
    else if (arg === "--seed") seedArg = args[++index];
    else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      return;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}\n${USAGE}`);
      process.exitCode = 2;
      return;
    } else {
      path = arg;
    }
  }

  const raw = path === undefined ? await readStdin() : readFileSync(path, "utf8");
  // A long game's report arrives with its replay block packed (src/worker/pack.ts).
  const text = raw.includes(PACKED_BEGIN) ? await unpackReport(raw) : raw;
  if (text.trim().length === 0) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  // A "Report a problem" text carries its own seed, dealer and decisions.
  let reportDealer: Seat | undefined;
  let reportExcluded: readonly string[] | undefined;
  let input: unknown;
  if (isReportText(text)) {
    const report = parseReport(text);
    if ("error" in report) {
      console.error(`replay failed: ${report.error}`);
      process.exitCode = 1;
      return;
    }
    reportDealer = report.dealer;
    reportExcluded = report.excludedHands;
    input = { seed: report.seed, actions: report.steps };
  } else {
    input = JSON.parse(text);
  }
  // Parsed JSON is an unchecked boundary; only the fields read below are used.
  const record: Record<string, unknown> = Array.isArray(input)
    ? { seed: seedArg, actions: input }
    : input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const seed = seedArg ?? record.seed;
  if (typeof seed !== "string" && typeof seed !== "number") {
    console.error("Replay input needs a seed (field or --seed)");
    process.exitCode = 2;
    return;
  }

  const source = eventsMode
    ? Array.isArray(input)
      ? input
      : record.events
    : Array.isArray(input)
      ? input
      : record.actions;
  if (!Array.isArray(source)) {
    console.error(eventsMode ? "Replay input has no events array" : "Replay input has no actions array");
    process.exitCode = 2;
    return;
  }

  const steps: ReplayStep[] = eventsMode
    ? stepsFromEvents(source as Event[])
    : (source as Action[]);

  let result;
  try {
    result = replaySteps(seed, steps, {
      ...(reportDealer === undefined ? {} : { dealer: reportDealer }),
      ...(reportExcluded === undefined ? {} : { excludedHands: reportExcluded }),
    });
  } catch (error) {
    console.error(`replay failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          seed,
          state: result.state,
          events: result.events,
          totals: ledgerTotals(result.state),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Hand ${result.state.handNumber} · dealer ${result.state.dealer} · seed ${JSON.stringify(seed)}`);
  for (const event of result.events) console.log(describeEvent(event));
  console.log("");
  const state = result.state;
  if (state.result !== null && state.result.kind === "win") {
    const winner = state.result;
    console.log(
      `Result: ${winner.winner} wins by ${winner.patternId}` +
        ` — ${winner.tier}${winner.points === null ? " (calculate)" : ` ${winner.points}`}` +
        (winner.selfDrawn ? " (self-drawn)" : ` (on ${winner.from}'s discard)`),
    );
  } else if (state.result !== null) {
    console.log(`Result: drawn hand — ${state.result.reason}`);
  } else {
    console.log(`Result: unfinished (phase ${state.phase}, turn ${state.turn})`);
  }
  printLedger(state.ledger, state);
}

await main();
