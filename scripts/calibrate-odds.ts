/**
 * Is the closest-hands chance calibrated? Of the hands shown at 30 %, about
 * 30 % should be completed.
 *
 *   node scripts/calibrate-odds.ts [hands] [seed-prefix] [race]
 *
 * Each hand is the first of a fresh game seeded "<prefix>-<n>". East commits
 * to the hand at the top of its closest-hands panel at its first discard and
 * then plays only for it, by the same rule the simulation assumes
 * (`targetDiscard`, and every claim the hand can use); the other seats are
 * the hard bots. At each of East's discards the script records the chance
 * the panel would show for that hand (`handChance`), and the old quick
 * estimate beside it, and at the end whether East went out.
 *
 * The chance answers "can I complete it before the wall runs out", so by
 * default no other seat may go out: a bot's win is turned into its next best
 * move. Pass "race" as the third argument to let them win, which measures how
 * far the race against the other three pulls the real outcome below the
 * figure.
 *
 * It prints a reliability table (predicted bucket against the share
 * completed) and the Brier score of both figures. Defaults: 400 hands,
 * prefix "odds", on every core.
 */

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import type { Action } from "../src/core/game/actions.ts";
import { chooseAction } from "../src/core/game/bot.ts";
import { closestHands, handTarget } from "../src/core/game/closest.ts";
import { newGame } from "../src/core/game/deal.ts";
import { isApplyError } from "../src/core/game/draft.ts";
import { handChance, tableOf, targetClaim, targetDiscard, unseenOf } from "../src/core/game/odds.ts";
import { apply } from "../src/core/game/reduce.ts";
import { PATTERNS } from "../src/core/patterns/table.ts";
import { viewFor, type GameView } from "../src/core/game/view.ts";

const EAST = "E";

/** One prediction: the panel's figure, the old quick one, and whether East went out. */
type Sample = [chance: number, quick: number, won: 0 | 1, claims: string];

function isWin(action: Action): boolean {
  return action.type === "Win" || (action.type === "Claim" && action.kind === "mahjong");
}

/** East's move: go out when it may, claim what the target uses, throw what it does not. */
function eastAction(view: GameView, pattern: string): Action | null {
  const legal = view.legalActions;
  const win = legal.find(isWin);
  if (win !== undefined) return win;
  const found = handTarget(view, pattern);
  if (found === null) return chooseAction(view, EAST, "hard");
  const { target } = found;
  if (view.phase === "claim" && view.claimWindow !== null) {
    if (target.claims === "any") {
      const tile = view.claimWindow.tile;
      for (const action of legal) {
        if (action.type !== "Claim" || (action.kind !== "pung" && action.kind !== "chow")) continue;
        const own = [...action.tiles];
        own.splice(own.indexOf(tile), 1);
        if (targetClaim(view.player.hand, target, unseenOf(view), tile, own)) return action;
      }
    }
    return legal.find((action) => action.type === "Pass") ?? chooseAction(view, EAST, "hard");
  }
  if (view.phase === "discard") {
    const tile = targetDiscard(view.player.hand, target, unseenOf(view));
    const discard = legal.find((action) => action.type === "Discard" && action.tile === tile);
    if (discard !== undefined) return discard;
  }
  return chooseAction(view, EAST, "hard");
}

function playHand(seed: string, race: boolean, samples: Sample[]): void {
  let { state } = newGame(seed);
  let pattern: string | null = null;
  const mine: [number, number, string][] = [];
  const trace: string[] = [];
  for (let step = 0; step < 3000 && state.phase !== "finished"; step++) {
    const actor = state.turn;
    let view = viewFor(state, actor);
    let action: Action | null;
    if (actor === EAST) {
      if (view.phase === "discard") {
        pattern ??= closestHands(view)[0]?.pattern ?? null;
        if (pattern !== null) {
          const found = handTarget(view, pattern);
          const chance = found === null ? 0 : (handChance(tableOf(view), found.target, { salt: pattern }) ?? 0);
          mine.push([chance, found === null ? 0 : found.quick, found?.target.claims ?? "-"]);
          if (process.env.CALIBRATE_DEBUG) {
            trace.push(`${chance.toFixed(2)} ${view.player.hand.join(" ")} | ${view.player.melds.map((meld) => meld.tiles.join("")).join(" ")} | ${view.legalActions.map((candidate) => candidate.type).join(",")}`);
          }
        }
      }
      action = pattern === null ? chooseAction(view, EAST, "hard") : eastAction(view, pattern);
    } else {
      if (!race) view = { ...view, legalActions: view.legalActions.filter((candidate) => !isWin(candidate)) };
      action = chooseAction(view, actor, "hard");
    }
    if (action === null) throw new Error(`${seed}: ${actor} has no action in ${state.phase}`);
    const result = apply(state, action);
    if (isApplyError(result)) throw new Error(`${seed}: illegal action ${JSON.stringify(action)}: ${result.error}`);
    state = result.state;
  }
  if (state.phase !== "finished") throw new Error(`${seed}: hand did not finish`);
  // Only the committed hand counts: a scoring variant is the same card.
  const card = (id: string | null | undefined): string | null => {
    const found = PATTERNS.find((entry) => entry.id === id);
    return found === undefined ? null : (found.variantOf ?? found.id);
  };
  const won = state.result?.winner === EAST && card(state.result.patternId) === card(pattern) ? 1 : 0;
  if (process.env.CALIBRATE_DEBUG && won === 0 && mine.some(([chance]) => chance > 0.9)) {
    console.error(`${seed} ${pattern} ${state.result?.kind} ${state.result?.winner}\n  ${trace.join("\n  ")}`);
  }
  for (const [chance, quick, claims] of mine) samples.push([chance, quick, won, claims]);
}

if (!isMainThread) {
  const { from, count, prefix, race } = workerData as { from: number; count: number; prefix: string; race: boolean };
  const samples: Sample[] = [];
  for (let index = from; index < from + count; index++) playHand(`${prefix}-${index}`, race, samples);
  parentPort!.postMessage(samples);
} else {
  const hands = Number(process.argv[2] ?? 400);
  const prefix = process.argv[3] ?? "odds";
  const race = process.argv[4] === "race";
  const workers = Math.min(hands, availableParallelism());
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, index) => {
      const from = Math.floor((hands * index) / workers);
      const to = Math.floor((hands * (index + 1)) / workers);
      return new Promise<Sample[]>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { from, count: to - from, prefix, race } });
        worker.once("message", resolve);
        worker.once("error", reject);
      });
    }),
  );
  const all = parts.flat();
  const edges = [0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98, 1.0001];
  const report = (label: string, pick: (sample: Sample) => number, samples: readonly Sample[] = all): void => {
    let brier = 0;
    for (const sample of samples) brier += (pick(sample) - sample[2]) ** 2;
    console.log(`\n${label}: Brier ${(brier / samples.length).toFixed(4)} over ${samples.length} predictions`);
    console.log("  predicted      n   mean   actual");
    for (let at = 0; at + 1 < edges.length; at++) {
      const bucket = samples.filter((sample) => pick(sample) >= edges[at]! && pick(sample) < edges[at + 1]!);
      if (bucket.length === 0) continue;
      const mean = bucket.reduce((sum, sample) => sum + pick(sample), 0) / bucket.length;
      const actual = bucket.reduce((sum, sample) => sum + sample[2], 0) / bucket.length;
      const range = `${Math.round(edges[at]! * 100)}-${Math.min(100, Math.round(edges[at + 1]! * 100))} %`;
      console.log(`  ${range.padEnd(10)} ${String(bucket.length).padStart(6)}  ${(mean * 100).toFixed(1).padStart(5)}  ${(actual * 100).toFixed(1).padStart(6)}`);
    }
  };
  console.log(`${hands} hands ("${prefix}-n"), ${race ? "the others may win" : "no other seat goes out"}`);
  report("Simulated chance (new)", (sample) => sample[0]);
  report("Quick estimate (old)", (sample) => sample[1]);
  for (const rule of ["any", "win", "none"]) {
    const some = all.filter((sample) => sample[3] === rule);
    if (some.length > 0) report(`Simulated, hands that claim ${rule === "any" ? "melds" : rule === "win" ? "only the last tile" : "nothing"}`, (sample) => sample[0], some);
  }
}
