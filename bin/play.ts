#!/usr/bin/env node
/**
 * Play one seat against three bots at the console.
 *
 * This file is the only I/O in the feature: it reads terminal lines, prints
 * the pure rendering from src/cli/console.ts and calls the pure bot. The reducer
 * remains the authority on legality; an action is only ever taken through
 * `recordAction`, so a bad input cannot change the state.
 *
 *   npm run play -- --seed table-7
 *   npm run play -- --seat S --seed table-7
 *   npm run play -- --bot --events --seed table-7
 */

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

import { chooseAction } from "../src/core/game/bot.ts";
import {
  commandPrompt,
  parseCommand,
  parsePlayArgs,
  PLAY_USAGE,
  recordAction,
  renderTable,
  startSession,
  undoLastDecision,
  type PlaySession,
} from "../src/cli/console.ts";
import { describeEvent, formatAction } from "../src/core/game/describe.ts";
import { viewFor } from "../src/core/game/view.ts";
import type { Event } from "../src/core/game/events.ts";

const MAX_DECISIONS = 5000;

function printEvents(events: readonly Event[], from: number): void {
  for (const event of events.slice(from)) console.log(describeEvent(event));
}

function printBotAction(session: PlaySession, action: Parameters<typeof formatAction>[0], from: number, showEvents: boolean): void {
  if (showEvents) printEvents(session.events, from);
  else if (action.type !== "Pass") console.log(formatAction(action));
}

async function main(): Promise<void> {
  let options;
  try {
    options = parsePlayArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(PLAY_USAGE);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(PLAY_USAGE);
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const queued: string[] = [];
  let closed = false;
  let waiting: ((line: string | null) => void) | null = null;
  rl.on("line", (line) => {
    if (waiting !== null) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      queued.push(line);
    }
  });
  rl.on("close", () => {
    closed = true;
    if (waiting !== null) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });
  /** A line reader that also resolves null at EOF; readline/promises hangs there. */
  const ask = (prompt: string): Promise<string | null> => {
    stdout.write(prompt);
    const buffered = queued.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (closed) return Promise.resolve(null);
    const { promise, resolve } = Promise.withResolvers<string | null>();
    waiting = resolve;
    return promise;
  };

  let session = startSession(options.seed);
  let decisions = 0;

  try {
    while (session.state.phase !== "finished") {
      if (decisions++ > MAX_DECISIONS) throw new Error("the hand did not terminate");
      const actor = session.state.turn;
      const actorView = viewFor(session.state, actor);
      const human = !options.bot && actor === options.seat;

      if (!human) {
        const action = chooseAction(actorView, actor);
        if (action === null) throw new Error(`no action for ${actor} in ${actorView.phase}`);
        const before = session.events.length;
        session = recordAction(session, action, false);
        printBotAction(session, action, before, options.events);
        continue;
      }

      if (session.state.phase === "draw") {
        const draw = actorView.legalActions.find((action) => action.type === "Draw");
        if (draw === undefined) throw new Error(`${actor} cannot draw`);
        const before = session.events.length;
        session = recordAction(session, draw, false);
        if (options.events) printEvents(session.events, before);
        continue;
      }

      console.log("");
      console.log(renderTable(actorView));
      console.log(commandPrompt(actorView));

      const line = await ask("> ");
      if (line === null) break;

      const command = parseCommand(line, actorView);
      if (command.kind === "invalid") {
        console.log(command.message);
        console.log(commandPrompt(actorView));
        continue;
      }
      if (command.kind === "quit") break;
      if (command.kind === "help") {
        console.log(PLAY_USAGE);
        continue;
      }
      if (command.kind === "undo") {
        const undone = undoLastDecision(session);
        if (undone === null) console.log("Nothing to undo.");
        else {
          session = undone;
          console.log("Undid the previous decision.");
        }
        continue;
      }

      if (command.action.type === "DeclareFishing") {
        console.log(`Fishing on ${command.action.wait.join(" ")}.`);
      }
      const before = session.events.length;
      session = recordAction(session, command.action, true);
      if (options.events) printEvents(session.events, before);
    }
  } finally {
    rl.close();
  }

  if (session.state.phase === "finished") {
    console.log("");
    console.log(renderTable(viewFor(session.state, options.seat)));
  } else {
    console.log("Quit.");
  }
}

await main();
