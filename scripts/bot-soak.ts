/**
 * Bot-only self-play: how the real table bots play against each other.
 *
 *   node scripts/bot-soak.ts [hands] [workers]
 *
 * Every seat is played by `chooseAction` over its own `viewFor` projection,
 * exactly as on the web table. Each hand is the first hand of a fresh game
 * seeded "bots-<n>", so a run is reproducible and two runs with the same
 * count compare like for like. It prints the drawn rate, the special-hand
 * share of the wins, the hands won, how many calls and fishing declarations
 * the bots made, and the time per decision.
 *
 * This is a measurement, not a test: `npm test` keeps to the fast coverage
 * soak (test/core/soak.test.ts). Defaults: 200 hands on every core.
 */

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import { chooseAction } from "../src/core/game/bot.ts";
import { apply, isApplyError, newGame } from "../src/core/game/reduce.ts";
import { viewFor } from "../src/core/game/view.ts";
import { PATTERNS } from "../src/core/patterns/table.ts";

interface Tally {
  hands: number;
  drawn: number;
  selfDrawn: number;
  specialWins: number;
  patterns: Record<string, number>;
  claims: number;
  fishing: number;
  decisions: number;
  ms: number;
  wallLeftAtWin: number;
}

const TIER_OF = new Map(PATTERNS.map((pattern) => [pattern.id, pattern.tier]));

function playHand(seed: string, tally: Tally): void {
  let { state } = newGame(seed);
  for (let step = 0; step < 3000 && state.phase !== "finished"; step++) {
    const actor = state.turn;
    const started = performance.now();
    const action = chooseAction(viewFor(state, actor), actor);
    tally.ms += performance.now() - started;
    tally.decisions += 1;
    if (action === null) throw new Error(`${seed}: ${actor} has no action in ${state.phase}`);
    const result = apply(state, action);
    if (isApplyError(result)) throw new Error(`${seed}: illegal bot action: ${result.error}`);
    state = result.state;
    for (const event of result.events) {
      if (event.type === "Claimed" && event.kind !== "mahjong") tally.claims += 1;
      if (event.type === "FishingDeclared") tally.fishing += 1;
      if (event.type === "WinDeclared") {
        tally.patterns[event.patternId] = (tally.patterns[event.patternId] ?? 0) + 1;
        if (event.selfDrawn) tally.selfDrawn += 1;
        if (TIER_OF.get(event.patternId) !== "calculate") tally.specialWins += 1;
        tally.wallLeftAtWin += state.wall.back - state.wall.front + 1;
      }
    }
  }
  if (state.phase !== "finished") throw new Error(`${seed}: hand did not finish`);
  tally.hands += 1;
  if (state.result?.kind === "drawn") tally.drawn += 1;
}

function emptyTally(): Tally {
  return {
    hands: 0,
    drawn: 0,
    selfDrawn: 0,
    specialWins: 0,
    patterns: {},
    claims: 0,
    fishing: 0,
    decisions: 0,
    ms: 0,
    wallLeftAtWin: 0,
  };
}

if (!isMainThread) {
  const { from, count } = workerData as { from: number; count: number };
  const tally = emptyTally();
  for (let index = from; index < from + count; index++) playHand(`bots-${index}`, tally);
  parentPort!.postMessage(tally);
} else {
  const hands = Number(process.argv[2] ?? 200);
  const workers = Math.min(hands, Number(process.argv[3] ?? availableParallelism()));
  const started = performance.now();
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, index) => {
      const from = Math.floor((hands * index) / workers);
      const to = Math.floor((hands * (index + 1)) / workers);
      return new Promise<Tally>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { from, count: to - from } });
        worker.once("message", resolve);
        worker.once("error", reject);
      });
    }),
  );
  const total = emptyTally();
  for (const part of parts) {
    for (const key of Object.keys(total) as (keyof Tally)[]) {
      if (key === "patterns") {
        for (const [id, n] of Object.entries(part.patterns)) total.patterns[id] = (total.patterns[id] ?? 0) + n;
      } else {
        total[key] += part[key];
      }
    }
  }
  const wins = total.hands - total.drawn;
  const percent = (n: number, of: number) => (of === 0 ? "-" : `${((100 * n) / of).toFixed(0)} %`);
  console.log(`${total.hands} bot-only hands in ${((performance.now() - started) / 1000).toFixed(0)} s`);
  console.log(`  drawn         ${total.drawn} (${percent(total.drawn, total.hands)})`);
  console.log(`  wins          ${wins}: ${total.selfDrawn} self-drawn, ${total.specialWins} special (${percent(total.specialWins, wins)} of wins)`);
  console.log(`  wall at win   ${wins === 0 ? "-" : (total.wallLeftAtWin / wins).toFixed(0)} tiles left on average`);
  console.log(`  per hand      ${(total.claims / total.hands).toFixed(1)} calls, ${(total.fishing / total.hands).toFixed(2)} fishing declarations`);
  console.log(`  per decision  ${(total.ms / total.decisions).toFixed(1)} ms`);
  for (const [id, n] of Object.entries(total.patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${id}`);
  }
}
