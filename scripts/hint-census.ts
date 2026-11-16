/**
 * What does the closest-hands panel suggest, and how often? A census of the
 * panel over seeded games, to see whether some hands (the flexible ones:
 * Knitting, Triple Knitting, the seven-pair family) crowd the others out.
 *
 *   node scripts/hint-census.ts [games] [seed-prefix] [--exclude=id,id,...]
 *
 * `--exclude` deals the games with those hands left out (a house rule), as
 * the bot soak does.
 *
 * Each game is a fresh deal seeded "<prefix>-<n>", played by the hard bots
 * in every seat. At each of East's discard decisions the script asks for the
 * panel (top 3) and the eight likeliest hands, and records which hands and
 * which families appeared, the chances, and how long the panel took.
 * Nothing here changes a game: East plays as a bot and only looks.
 */

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import type { Action } from "../src/core/game/actions.ts";
import { chooseAction } from "../src/core/game/bot.ts";
import { closestHands, handIndex } from "../src/core/game/closest.ts";
import { newGame } from "../src/core/game/deal.ts";
import { isApplyError } from "../src/core/game/draft.ts";
import { apply } from "../src/core/game/reduce.ts";
import { viewFor } from "../src/core/game/view.ts";

const EAST = "E";

/** What one game gave: per decision, the top three and the top eight with chances. */
interface Decision {
  game: number;
  top: string[];
  eight: [string, number][];
  ms: number;
}

function family(): Map<string, string> {
  // The first book heading a hand is filed under: a hand's family.
  const out = new Map<string, string>();
  for (const group of handIndex().groups) for (const id of group.hands) if (!out.has(id)) out.set(id, group.id);
  return out;
}

function playGame(seed: string, game: number, out: Decision[], excludedHands: readonly string[]): void {
  let { state } = newGame(seed, excludedHands.length > 0 ? { excludedHands } : {});
  for (let step = 0; step < 3000 && state.phase !== "finished"; step++) {
    const actor = state.turn;
    const view = viewFor(state, actor);
    if (actor === EAST && view.phase === "discard") {
      const started = performance.now();
      const eight = closestHands(view, 8);
      const ms = performance.now() - started;
      out.push({ game, top: eight.slice(0, 3).map((hand) => hand.pattern), eight: eight.map((hand) => [hand.pattern, hand.chance]), ms });
    }
    const action: Action | null = chooseAction(view, actor, "hard");
    if (action === null) throw new Error(`${seed}: no action for ${actor}`);
    const result = apply(state, action);
    if (isApplyError(result)) throw new Error(`${seed}: illegal ${JSON.stringify(action)}`);
    state = result.state;
  }
}

if (!isMainThread) {
  const { from, count, prefix, excluded } = workerData as { from: number; count: number; prefix: string; excluded: string[] };
  const out: Decision[] = [];
  for (let index = from; index < from + count; index++) playGame(`${prefix}-${index}`, index, out, excluded);
  parentPort!.postMessage(out);
} else {
  const flag = process.argv.find((arg) => arg.startsWith("--exclude="));
  const excluded = (flag?.slice("--exclude=".length) ?? "").split(",").filter((id) => id !== "");
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const games = Number(args[0] ?? 100);
  const prefix = args[1] ?? "census";
  const workers = Math.min(games, availableParallelism());
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, index) => {
      const from = Math.floor((games * index) / workers);
      const to = Math.floor((games * (index + 1)) / workers);
      return new Promise<Decision[]>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { from, count: to - from, prefix, excluded } });
        worker.once("message", resolve);
        worker.once("error", reject);
      });
    }),
  );
  const all = parts.flat();
  const families = family();
  const pct = (n: number, of: number): string => `${((100 * n) / of).toFixed(1)} %`;
  const tally = (pick: (decision: Decision) => string[]): [string, number][] => {
    const counts = new Map<string, number>();
    for (const decision of all) for (const id of new Set(pick(decision))) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  console.log(`${games} games ("${prefix}-n"), ${all.length} East decisions${excluded.length > 0 ? `, left out: ${excluded.join(", ")}` : ""}`);

  console.log("\nHands in the panel (top 3), share of decisions");
  for (const [id, n] of tally((d) => d.top).slice(0, 15)) console.log(`  ${id.padEnd(24)} ${pct(n, all.length).padStart(7)}  [${families.get(id) ?? "?"}]`);
  console.log("\nHands in first place");
  for (const [id, n] of tally((d) => d.top.slice(0, 1)).slice(0, 10)) console.log(`  ${id.padEnd(24)} ${pct(n, all.length).padStart(7)}`);
  console.log("\nFamilies in the panel (top 3), share of decisions");
  for (const [id, n] of tally((d) => d.top.map((hand) => families.get(hand) ?? "?")).slice(0, 10)) console.log(`  ${id.padEnd(24)} ${pct(n, all.length).padStart(7)}`);

  const flexible = (id: string): boolean => /knitting|seven-twins|all-pair|heavenly|^pair/.test(id) || families.get(id) === "pairs";
  const stacked = all.filter((d) => d.top.filter(flexible).length >= 2).length;
  const three = all.filter((d) => d.top.filter(flexible).length === 3).length;
  console.log(`\nTwo or more pair/knitting hands in one panel: ${pct(stacked, all.length)} (all three: ${pct(three, all.length)})`);
  const places = all.reduce((sum, d) => sum + d.top.filter(flexible).length, 0);
  console.log(`Share of panel places held by pair/knitting hands: ${pct(places, all.length * 3)}`);

  const seen = new Map<number, Set<string>>();
  for (const d of all) seen.set(d.game, (seen.get(d.game) ?? new Set()).add(d.top.join()).add(""));
  const distinct = new Map<number, Set<string>>();
  for (const d of all) for (const id of d.top) distinct.set(d.game, (distinct.get(d.game) ?? new Set()).add(id));
  const mean = [...distinct.values()].reduce((sum, set) => sum + set.size, 0) / Math.max(1, distinct.size);
  console.log(`Distinct hands one game's panels show (mean): ${mean.toFixed(1)}`);

  const buckets = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];
  console.log("\nChance of the eight likeliest (share of listed hands)");
  const chances = all.flatMap((d) => d.eight.map(([, c]) => c));
  for (let at = 0; at + 1 < buckets.length; at++) {
    const n = chances.filter((c) => c >= buckets[at]! && c < buckets[at + 1]!).length;
    console.log(`  ${Math.round(buckets[at]! * 100)}-${Math.min(100, Math.round(buckets[at + 1]! * 100))} %  ${pct(n, chances.length)}`);
  }
  const times = all.map((d) => d.ms).sort((a, b) => a - b);
  console.log(`\nPanel time (ms, top 8): median ${times[Math.floor(times.length / 2)]!.toFixed(0)}, p95 ${times[Math.floor(times.length * 0.95)]!.toFixed(0)}, max ${times[times.length - 1]!.toFixed(0)}`);
}
