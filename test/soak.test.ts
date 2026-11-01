/**
 * Seeded self-play soak: many complete hands, asserting the table-wide
 * invariants the focused unit tests cannot cover.
 *
 * The policy and the per-hand assertions live in soak-worker.ts so that the
 * default `npm test` run spreads a couple of dozen hands over worker threads
 * in the same minute as the rest of the suite. `npm run soak` runs the full
 * 300; `SOAK_SEEDS` sets the count; `SOAK_WORKERS` overrides the thread count;
 * `SOAK_REPLAY_EVERY` controls how often the recorded action list is replayed
 * from the seed (default every twentieth hand, because replay doubles a
 * hand's cost).
 *
 * Every worker reports what it actually exercised. The test fails if a
 * category that should occur in a table of this size is always zero.
 */

import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { it } from "node:test";
import { Worker } from "node:worker_threads";

import type { SoakStats } from "./soak-worker.ts";

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  assert.ok(Number.isInteger(parsed) && parsed > 0, `expected a positive integer, got ${value}`);
  return parsed;
}

const SOAK_SEEDS = positiveInteger(process.env.SOAK_SEEDS, 24);
const SOAK_WORKERS = positiveInteger(
  process.env.SOAK_WORKERS,
  Math.max(1, Math.min(12, availableParallelism())),
);
const REPLAY_EVERY = positiveInteger(process.env.SOAK_REPLAY_EVERY, 20);

interface Slice {
  readonly from: number;
  readonly count: number;
}

function slices(total: number, workers: number): Slice[] {
  const out: Slice[] = [];
  const base = Math.floor(total / workers);
  const extra = total % workers;
  let from = 0;
  for (let index = 0; index < workers; index++) {
    const count = base + (index < extra ? 1 : 0);
    if (count > 0) out.push({ from, count });
    from += count;
  }
  return out;
}

function runSlice(slice: Slice): Promise<SoakStats> {
  const { promise, resolve, reject } = Promise.withResolvers<SoakStats>();
  const worker = new Worker(new URL("./soak-worker.ts", import.meta.url), {
    workerData: { ...slice, replayEvery: REPLAY_EVERY },
  });
  let settled = false;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    reject(error instanceof Error ? error : new Error(String(error)));
  };
  worker.once("message", (message: SoakStats) => {
    if (settled) return;
    settled = true;
    resolve(message);
  });
  worker.once("error", fail);
  worker.once("exit", (code) => {
    if (code !== 0) fail(new Error(`soak worker exited with code ${code}`));
  });
  return promise;
}

it(`self-plays ${SOAK_SEEDS} seeded hands and asserts the table invariants`, async () => {
  const started = performance.now();
  const parts = await Promise.all(slices(SOAK_SEEDS, SOAK_WORKERS).map(runSlice));
  const elapsed = performance.now() - started;

  const totals: SoakStats = {
    hands: 0,
    wins: 0,
    drawn: 0,
    selfDrawn: 0,
    discardWins: 0,
    claimAttempts: 0,
    claims: 0,
    kongDeclarations: 0,
    fishingDeclarations: 0,
    fishingSettlements: 0,
    fishingPayments: 0,
    replayChecked: 0,
    deserializeChecks: 0,
    steps: 0,
  };
  for (const part of parts) {
    for (const key of Object.keys(totals) as (keyof SoakStats)[]) totals[key] += part[key];
  }

  assert.equal(totals.hands, SOAK_SEEDS);
  assert.equal(totals.wins + totals.drawn, totals.hands);
  assert.equal(totals.selfDrawn + totals.discardWins, totals.wins);
  assert.ok(totals.claims <= totals.claimAttempts);
  assert.equal(totals.replayChecked, Math.ceil(SOAK_SEEDS / REPLAY_EVERY));
  assert.ok(totals.deserializeChecks > 0);
  assert.ok(totals.steps > 0);

  // At the default size every kind of event should have occurred. A zero is
  // a finding, not a flake: the policy is deterministic, so the test refuses
  // to call the soak green until a targeted seed covers the gap.
  if (SOAK_SEEDS >= 100) {
    for (const key of ["wins", "drawn", "selfDrawn", "discardWins", "claims", "fishingDeclarations", "fishingSettlements"] as const) {
      assert.ok(totals[key] > 0, `soak never exercised ${key}; add a targeted seed`);
    }
  }

  console.log("");
  console.log(`soak: ${totals.hands} hands, ${totals.steps} actions, ${(elapsed / 1000).toFixed(1)}s, ${SOAK_WORKERS} workers`);
  console.log(
    `  results      ${totals.wins} wins (${totals.selfDrawn} self-drawn, ${totals.discardWins} on a discard), ` +
      `${totals.drawn} drawn`,
  );
  console.log(`  claims       ${totals.claims} claimed (${totals.claimAttempts} attempts), ${totals.kongDeclarations} kongs declared`);
  console.log(
    `  fishing      ${totals.fishingDeclarations} declarations, ${totals.fishingSettlements} settlements ` +
      `(${totals.fishingPayments} payments)`,
  );
  console.log(
    `  checks       ${totals.replayChecked} event-log replays, ${totals.deserializeChecks} mid-hand round-trips`,
  );
});
