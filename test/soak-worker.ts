/**
 * One slice of the self-play soak, run in a worker thread.
 *
 * The policy is deliberately small and deterministic: it is a coverage
 * driver, not a strong player. Per decision it
 *   1. wins when a win is legal (self-drawn or on the discard);
 *   2. declares fishing whenever the engine offers it, because the declared
 *      wait is the only way the soak exercises fishing settlements;
 *   3. takes a concealed or added kong whenever one is legal;
 *   4. claims a pung/kong/chow on half of the opportunities (a seeded coin),
 *      so claim windows, precedence and losing claims all occur without
 *      turning every hand into an exposed meld race;
 *   5. otherwise draws, and discards the least useful tile.
 *
 * "Least useful" is the same shallow heuristic the console bot documents:
 * keep pairs, triplets and same-suit neighbours; throw the isolated tile.
 * Ties break on canonical tile order. No clock and no ambient RNG: the only
 * randomness is `createRng("policy-" + seed)` for the claim coin and a second
 * stream for the sampling points, so every run is reproducible.
 *
 * The worker asserts the invariants itself; a violation becomes a worker
 * error and therefore a test failure. It reports aggregate coverage so the
 * test can print what the run actually exercised.
 */

import assert from "node:assert/strict";
import { parentPort, workerData } from "node:worker_threads";

import {
  apply,
  deserialize,
  isApplyError,
  legalActions,
  ledgerTotals,
  newGame,
  replaySteps,
  serialize,
  SEATS,
  type Action,
  type Event,
  type GameState,
} from "../src/core/game/index.ts";
import { createRng } from "../src/core/rng.ts";
import { createTileSet, PLAY_TILE_KEYS, tileKey } from "../src/core/tiles.ts";

export interface SoakStats {
  hands: number;
  wins: number;
  drawn: number;
  selfDrawn: number;
  discardWins: number;
  claimAttempts: number;
  claims: number;
  kongDeclarations: number;
  fishingDeclarations: number;
  fishingSettlements: number;
  fishingPayments: number;
  replayChecked: number;
  deserializeChecks: number;
  steps: number;
}

interface WorkerInput {
  readonly from: number;
  readonly count: number;
  readonly replayEvery: number;
}

const EVENT_TYPES = new Set<string>([
  "Dealt",
  "Drew",
  "FlowerReplaced",
  "Discarded",
  "Promoted",
  "Claimed",
  "KongDeclared",
  "KongReplacementDrawn",
  "FishingDeclared",
  "WinDeclared",
  "HandScored",
  "Payments",
  "DrawnHand",
  "NextDeal",
]);

const KEY_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  PLAY_TILE_KEYS.map((key, index) => [key, index]),
);

/** Every key the 144-tile set contains, with its physical multiplicity. */
const EXPECTED_TILES = (() => {
  const counts = new Map<string, number>();
  for (const tile of createTileSet()) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 144);
  return counts;
})();

function addKeys(census: Map<string, number>, keys: readonly string[]): void {
  for (const key of keys) census.set(key, (census.get(key) ?? 0) + 1);
}

/**
 * The 144-tile conservation law: hands + melds + discards + bonus pools +
 * the live wall window must equal the physical set, tile by tile.
 */
function assertTileCensus(state: GameState, seed: string, step: number): void {
  const census = new Map<string, number>();
  for (const player of state.players) {
    addKeys(census, player.hand);
    addKeys(census, player.flowers);
    addKeys(census, player.seasons);
    addKeys(census, player.discards);
    for (const meld of player.melds) addKeys(census, meld.tiles);
  }
  addKeys(census, state.wall.tiles.slice(state.wall.front, state.wall.back + 1));

  const total = [...census.values()].reduce((sum, count) => sum + count, 0);
  assert.equal(total, 144, `${seed} step ${step}: ${total} tiles exist`);

  for (const [key, expected] of EXPECTED_TILES) {
    assert.equal(
      census.get(key) ?? 0,
      expected,
      `${seed} step ${step}: ${key} count drifted (expected ${expected})`,
    );
  }
  for (const key of census.keys()) {
    assert.ok(EXPECTED_TILES.has(key), `${seed} step ${step}: unknown tile ${key}`);
  }
}

function assertPayments(entries: readonly { from: string; to: string; points: number | null; reason: string }[], where: string): void {
  for (const entry of entries) {
    assert.ok((SEATS as readonly string[]).includes(entry.from), `${where}: bad payer ${entry.from}`);
    assert.ok((SEATS as readonly string[]).includes(entry.to), `${where}: bad payee ${entry.to}`);
    assert.notEqual(entry.from, entry.to, `${where}: a seat paid itself`);
    assert.ok(entry.reason.trim().length > 0, `${where}: payment has no reason`);
    if (entry.points !== null) {
      assert.ok(Number.isInteger(entry.points) && entry.points > 0, `${where}: bad points ${entry.points}`);
    }
  }
}

function assertEventLog(log: readonly Event[], state: GameState, seed: string): void {
  for (const [index, event] of log.entries()) {
    assert.ok(EVENT_TYPES.has(event.type), `${seed}: unknown event type ${event.type}`);
    assert.equal(event.seq, index, `${seed}: event ${index} has seq ${event.seq}`);
  }

  const wins = log.filter((event) => event.type === "WinDeclared");
  const scores = log.filter((event) => event.type === "HandScored");
  assert.equal(wins.length, scores.length, `${seed}: win/score event counts differ`);
  for (const [index, win] of wins.entries()) {
    const score = scores[index]!;
    assert.equal(score.seat, win.seat, `${seed}: HandScored seat does not follow WinDeclared`);
    assert.equal(score.patternId, win.patternId, `${seed}: HandScored pattern does not follow WinDeclared`);
    assert.equal(score.tier, win.tier, `${seed}: HandScored tier does not follow WinDeclared`);
  }

  const result = state.result;
  assert.notEqual(result, null, `${seed}: finished hand has no result`);
  if (result === null) return;
  assert.ok(result.kind === "win" || result.kind === "drawn", `${seed}: bad result ${result.kind}`);
  if (result.kind === "win") {
    assert.equal(wins.length, 1, `${seed}: a win must emit exactly one WinDeclared`);
    assert.equal(wins[0]!.seat, result.winner, `${seed}: WinDeclared seat differs from result`);
    assert.equal(scores.length, 1, `${seed}: a win must emit exactly one HandScored`);
  } else {
    assert.equal(wins.length, 0, `${seed}: a drawn hand emitted a win`);
    assert.equal(result.winner, null, `${seed}: a drawn hand has a winner`);
  }
}

function assertLedger(state: GameState, log: readonly Event[], seed: string): void {
  assertPayments(state.ledger, seed);
  const totals = ledgerTotals(state);
  const sum = SEATS.reduce((total, seat) => total + totals.totals[seat], 0);
  assert.equal(sum, 0, `${seed}: ledger does not sum to zero`);

  const paidEvents = log.filter((event) => event.type === "Payments");
  const eventEntries = paidEvents.flatMap((event) => event.entries);
  assert.equal(eventEntries.length, state.ledger.length, `${seed}: ledger and Payments events differ`);
  assertPayments(eventEntries, `${seed} Payments events`);
}

function keepScore(hand: readonly string[], tile: string): number {
  const copies = hand.filter((key) => key === tile).length;
  let score = (copies - 1) * 6;
  const ranked = /^[bco](\d)$/.exec(tile);
  if (ranked !== null) {
    const suit = tile[0]!;
    const rank = Number(ranked[1]);
    for (const distance of [-2, -1, 1, 2]) {
      const neighbour = rank + distance;
      if (neighbour < 1 || neighbour > 9) continue;
      if (hand.includes(`${suit}${neighbour}`)) score += Math.abs(distance) === 1 ? 3 : 1;
    }
  }
  return score;
}

function chooseDiscard(hand: readonly string[]): string {
  let best = hand[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of new Set(hand)) {
    const score = keepScore(hand, tile);
    if (
      score < bestScore ||
      (score === bestScore && (KEY_ORDER[tile] ?? 99) < (KEY_ORDER[best] ?? 99))
    ) {
      best = tile;
      bestScore = score;
    }
  }
  return best;
}

function chooseAction(state: GameState, claimCoin: () => boolean): Action | null {
  const legal = legalActions(state, state.turn);
  if (legal.length === 0) return null;

  const win = legal.find((action) => action.type === "Win");
  if (win !== undefined) return win;

  const fishing = legal.find((action) => action.type === "DeclareFishing");
  if (fishing !== undefined) return fishing;

  const kong = legal.find(
    (action) => action.type === "ConcealedKong" || action.type === "AddedKong",
  );
  if (kong !== undefined) return kong;

  const claims = legal.filter(
    (action) => action.type === "Claim" && action.kind !== "mahjong",
  );
  if (claims.length > 0 && claimCoin()) return claims[0]!;

  if (state.phase === "claim" || state.phase === "announce") {
    return legal.find((action) => action.type === "Pass") ?? legal[0]!;
  }

  const draw = legal.find((action) => action.type === "Draw");
  if (draw !== undefined) return draw;

  const discards = legal.filter((action) => action.type === "Discard");
  if (discards.length > 0) {
    const hand = state.players.find((player) => player.seat === state.turn)!.hand;
    const tile = chooseDiscard(hand);
    return discards.find((action) => action.type === "Discard" && action.tile === tile) ?? discards[0]!;
  }

  return legal[0]!;
}

const MAX_STEPS = 2000;

function playHand(seed: string, replayEvery: number): SoakStats {
  const policyRng = createRng(`policy-${seed}`);
  const checkRng = createRng(`checks-${seed}`);
  const start = newGame(seed);
  let state = start.state;
  const log: Event[] = [...start.events];
  const actions: Action[] = [];
  const stats: SoakStats = {
    hands: 1,
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

  assertTileCensus(state, seed, 0);

  while (state.phase !== "finished") {
    assert.ok(stats.steps < MAX_STEPS, `${seed}: hand did not terminate in ${MAX_STEPS} actions`);

    if (state.phase === "claim") {
      const window = state.claimWindow;
      assert.notEqual(window, null, `${seed}: claim phase without a window`);
      assert.ok((window?.pending.length ?? 0) > 0, `${seed}: empty claim window`);
      assert.equal(state.turn, window?.pending[0], `${seed}: claim turn is not the next pending seat`);
    }

    if (checkRng.int(25) === 0) {
      const json = serialize(state);
      const restored = deserialize(json);
      assert.equal(serialize(restored), json, `${seed} step ${stats.steps}: serialisation differs`);
      assert.deepEqual(restored, state, `${seed} step ${stats.steps}: deserialised state differs`);
      stats.deserializeChecks += 1;
    }

    const action = chooseAction(state, () => policyRng.int(2) === 0);
    assert.notEqual(action, null, `${seed} step ${stats.steps}: no action in phase ${state.phase}`);
    const seat = action!.seat;
    const legal = legalActions(state, seat);
    assert.ok(
      legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action!)),
      `${seed} step ${stats.steps}: policy chose an illegal ${action!.type} for ${seat}`,
    );

    const result = apply(state, action!);
    assert.ok(!isApplyError(result), `${seed} step ${stats.steps}: apply rejected a legal action`);
    if (isApplyError(result)) throw new Error(result.error);

    state = result.state;
    log.push(...result.events);
    actions.push(action!);
    stats.steps += 1;
    if (action!.type === "Claim") stats.claimAttempts += 1;

    assertTileCensus(state, seed, stats.steps);
  }

  assert.equal(state.result?.kind === "win" || state.result?.kind === "drawn", true, `${seed}: no result`);
  assertEventLog(log, state, seed);
  assertLedger(state, log, seed);

  const result = state.result!;
  if (result.kind === "win") {
    stats.wins += 1;
    if (result.selfDrawn) stats.selfDrawn += 1;
    else stats.discardWins += 1;
  } else {
    stats.drawn += 1;
  }
  stats.claims = log.filter((event) => event.type === "Claimed").length;
  stats.kongDeclarations = log.filter((event) => event.type === "KongDeclared").length;
  stats.fishingDeclarations = log.filter((event) => event.type === "FishingDeclared").length;
  stats.fishingPayments = state.ledger.filter((entry) => entry.reason.startsWith("fishing")).length;
  assert.equal(
    stats.fishingPayments % 3,
    0,
    `${seed}: a fishing award must name three payers`,
  );
  stats.fishingSettlements = stats.fishingPayments / 3;

  const index = Number(seed.slice("soak-".length));
  if (index % replayEvery === 0) {
    const replayed = replaySteps(seed, actions);
    assert.equal(
      JSON.stringify(replayed.events),
      JSON.stringify(log),
      `${seed}: replay produced a different event log`,
    );
    assert.equal(serialize(replayed.state), serialize(state), `${seed}: replay produced a different state`);
    stats.replayChecked += 1;
  }

  return stats;
}

if (parentPort === null) throw new Error("soak-worker.ts must run as a worker");

const input = workerData as WorkerInput;
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

for (let index = input.from; index < input.from + input.count; index++) {
  const slice = playHand(`soak-${index}`, input.replayEvery);
  for (const key of Object.keys(slice) as (keyof SoakStats)[]) totals[key] += slice[key];
}

parentPort.postMessage(totals);
