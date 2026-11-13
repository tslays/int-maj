/**
 * One bot level against three of another: is a level actually stronger?
 *
 *   node scripts/bot-duel.ts [hands] [challenger] [field] [seed-prefix]
 *
 * South plays at the challenger level, the other three seats at the field
 * level; every seat decides from its own `viewFor` projection, as on the web
 * table. Each hand is the first of a fresh game seeded "<prefix>-<n>", so a
 * run is reproducible. It prints South's wins, the share of all wins, how
 * often South fed a winner, and South's net points. Use a fresh prefix to
 * confirm a tuning on deals that were not used to choose it (#120).
 * Defaults: 400 hands, hard against hard, prefix "duel", on every core.
 */

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import { chooseAction, isBotLevel, type BotLevel } from "../src/core/game/bot.ts";
import { isApplyError } from "../src/core/game/draft.ts";
import { newGame } from "../src/core/game/deal.ts";
import { apply } from "../src/core/game/reduce.ts";
import { viewFor } from "../src/core/game/view.ts";

interface Tally {
  hands: number;
  drawn: number;
  wins: number;
  fed: number;
  net: number;
}

const SOUTH = "S";

function playHand(seed: string, challenger: BotLevel, field: BotLevel, tally: Tally): void {
  let { state } = newGame(seed);
  for (let step = 0; step < 3000 && state.phase !== "finished"; step++) {
    const actor = state.turn;
    const action = chooseAction(viewFor(state, actor), actor, actor === SOUTH ? challenger : field);
    if (action === null) throw new Error(`${seed}: ${actor} has no action in ${state.phase}`);
    const result = apply(state, action);
    if (isApplyError(result)) throw new Error(`${seed}: illegal bot action: ${result.error}`);
    state = result.state;
    for (const event of result.events) {
      if (event.type !== "WinDeclared") continue;
      if (event.seat === SOUTH) tally.wins += 1;
      else if (event.from === SOUTH) tally.fed += 1;
    }
  }
  if (state.phase !== "finished") throw new Error(`${seed}: hand did not finish`);
  tally.hands += 1;
  if (state.result?.kind === "drawn") tally.drawn += 1;
  for (const entry of state.ledger) {
    if (entry.to === SOUTH) tally.net += entry.points ?? 0;
    if (entry.from === SOUTH) tally.net -= entry.points ?? 0;
  }
}

if (!isMainThread) {
  const { from, count, challenger, field, prefix } = workerData as {
    from: number;
    count: number;
    challenger: BotLevel;
    field: BotLevel;
    prefix: string;
  };
  const tally: Tally = { hands: 0, drawn: 0, wins: 0, fed: 0, net: 0 };
  for (let index = from; index < from + count; index++) playHand(`${prefix}-${index}`, challenger, field, tally);
  parentPort!.postMessage(tally);
} else {
  const hands = Number(process.argv[2] ?? 400);
  const challenger = process.argv[3] ?? "hard";
  const field = process.argv[4] ?? "hard";
  const prefix = process.argv[5] ?? "duel";
  if (!isBotLevel(challenger) || !isBotLevel(field)) throw new Error("levels are easy, medium or hard");
  const workers = Math.min(hands, availableParallelism());
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, index) => {
      const from = Math.floor((hands * index) / workers);
      const to = Math.floor((hands * (index + 1)) / workers);
      return new Promise<Tally>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { from, count: to - from, challenger, field, prefix },
        });
        worker.once("message", resolve);
        worker.once("error", reject);
      });
    }),
  );
  const total: Tally = { hands: 0, drawn: 0, wins: 0, fed: 0, net: 0 };
  for (const part of parts) for (const key of Object.keys(total) as (keyof Tally)[]) total[key] += part[key];
  const won = total.hands - total.drawn;
  console.log(`South ${challenger} against three ${field}, ${total.hands} hands ("${prefix}-n")`);
  console.log(`  drawn   ${total.drawn}`);
  console.log(`  South   ${total.wins} wins (${won === 0 ? "-" : ((100 * total.wins) / won).toFixed(0)} % of wins), fed ${total.fed}, net ${total.net}`);
}
