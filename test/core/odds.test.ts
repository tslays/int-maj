/**
 * The chance of completing a hand (`src/core/game/odds.ts`): exact where the
 * answer has a closed form, blind to everything the seat cannot see, and
 * ordered the way the rules order it (a claimable meld helps, a dead tile
 * hurts).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestHands, viewFor } from "../../src/core/game/index.ts";
import { handChance, tableOf, type ClaimRule, type Table } from "../../src/core/game/odds.ts";
import { PLAY_TILE_KEYS } from "../../src/core/tiles.ts";
import { fixture } from "../helpers/game-fixture.ts";

const KINDS = PLAY_TILE_KEYS.length;
const INDEX = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));

function counts(keys: string): Int8Array {
  const out = new Int8Array(KINDS);
  for (const key of keys.split(" ").filter((word) => word.length > 0)) out[INDEX.get(key)!]! += 1;
  return out;
}

/**
 * A table where the viewer is about to draw, holds `hand`, and has seen
 * nothing else: every other copy is hidden, the opponents hold 13 each and
 * the wall is the rest. `unseen` sets some hidden counts lower, as if those
 * copies had been discarded.
 */
function table(hand: string, unseen: Record<string, number> = {}): Table {
  const held = counts(hand);
  const hidden = new Int8Array(KINDS);
  for (let index = 0; index < KINDS; index++) hidden[index] = 4 - held[index]!;
  for (const [key, copies] of Object.entries(unseen)) hidden[INDEX.get(key)!] = copies;
  return {
    held,
    unseen: hidden,
    bonus: 0,
    handCounts: [0, 13, 13, 13],
    draws: poolOf(hidden) - 39,
    start: { kind: "draw", seat: 0 },
    seed: `test|${hand}|${JSON.stringify(unseen)}`,
  };
}

function poolOf(hidden: ArrayLike<number>): number {
  let pool = 0;
  for (let index = 0; index < KINDS; index++) pool += hidden[index]!;
  return pool;
}

/** P(none of `copies` tiles among `draws` taken from `pool`). */
function none(pool: number, copies: number, draws: number): number {
  let p = 1;
  for (let index = 0; index < draws; index++) p *= (pool - copies - index) / (pool - index);
  return p;
}

const TRIALS = 20000;

function close(actual: number, expected: number, label: string): void {
  const error = Math.sqrt((expected * (1 - expected)) / TRIALS);
  assert.ok(
    Math.abs(actual - expected) <= 4 * error + 0.005,
    `${label}: simulated ${actual.toFixed(4)}, exact ${expected.toFixed(4)}`,
  );
}

function chance(t: Table, want: string, claims: ClaimRule, trials = TRIALS): number {
  const result = handChance(t, { versions: [counts(want)], claims }, { trials });
  assert.notEqual(result, null);
  return result!;
}

// Four pungs and a pair in bamboo: the hand below needs one more 5.
const PUNGS = "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5";
const PUNGS_DONE = "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5";

describe("hand chance", () => {
  it("is 1 for a complete hand and 0 when a needed tile has no copy left", () => {
    const done = table(PUNGS_DONE.split(" ").slice(0, 13).join(" "));
    assert.equal(handChance({ ...done, held: counts(PUNGS_DONE) }, { versions: [counts(PUNGS_DONE)], claims: "any" }), 1);
    assert.equal(chance(table(PUNGS, { b5: 0 }), PUNGS_DONE, "any"), 0);
  });

  it("is null when no hand is in play", () => {
    assert.equal(handChance({ ...table(PUNGS), start: null }, { versions: [counts(PUNGS_DONE)], claims: "any" }), null);
  });

  it("matches the exact draw odds for a self-drawn hand needing one tile", () => {
    const t = table(PUNGS);
    const mine = Math.ceil(t.draws / 4); // the viewer draws first, then every fourth tile
    close(chance(t, PUNGS_DONE, "none"), 1 - none(poolOf(t.unseen), 3, mine), "one tile, three copies");
    const few = table(PUNGS, { b5: 1 });
    close(chance(few, PUNGS_DONE, "none"), 1 - none(poolOf(few.unseen), 1, Math.ceil(few.draws / 4)), "one tile, one copy");
  });

  it("matches the exact draw odds for a self-drawn hand needing two different tiles", () => {
    const hand = "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 c1 c2";
    const want = "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 c1 c1";
    const t = table(hand);
    const pool = poolOf(t.unseen);
    const mine = Math.ceil(t.draws / 4);
    // b4: two unseen; c1: three unseen.
    const exact = 1 - none(pool, 2, mine) - none(pool, 3, mine) + none(pool, 5, mine);
    close(chance(t, want, "none"), exact, "two tiles");
  });

  it("is higher when a pung may be claimed off any discard", () => {
    const hand = "b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5";
    const want = "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5";
    const t = table(hand, { b1: 1 });
    const drawn = chance(t, want, "none", 4000);
    const claimed = chance(t, want, "any", 4000);
    assert.ok(claimed > drawn + 0.05, `claimed ${claimed} vs drawn ${drawn}`);
  });

  it("is higher when a chow may be claimed off the left player's discard than only the last tile", () => {
    // Missing a 3 for the 1-2-3 and a second 9 for the pair: the chow can come off a discard.
    const hand = "b1 b2 c4 c5 c6 o4 o5 o6 c7 c8 c9 o9 b7";
    const want = "b1 b2 b3 c4 c5 c6 o4 o5 o6 c7 c8 c9 o9 o9";
    const t = table(hand);
    const lastOnly = chance(t, want, "win", 4000);
    const any = chance(t, want, "any", 4000);
    assert.ok(any > lastOnly + 0.02, `any ${any} vs last only ${lastOnly}`);
  });

  it("does not fall when more copies of the needed tile are unseen", () => {
    let previous = -1;
    for (const copies of [1, 2, 3]) {
      const now = chance(table(PUNGS, { b5: copies }), PUNGS_DONE, "any", 4000);
      assert.ok(now >= previous - 0.02, `${copies} copies: ${now} after ${previous}`);
      previous = now;
    }
  });

  it("gives one answer for one view", () => {
    const t = table(PUNGS);
    assert.equal(chance(t, PUNGS_DONE, "any", 1000), chance(t, PUNGS_DONE, "any", 1000));
  });
});

describe("hand chance sees only the viewer's table", () => {
  const S = "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG";
  const W = "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7";
  const WALL = Array.from({ length: 60 }, (_, index) => ["c6", "o9", "dW", "c3", "o5", "wN"][index % 6]!);
  const E = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5";
  const N = "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW";

  it("is the same whatever the opponents hold and however the wall is ordered", () => {
    const one = viewFor(fixture({ hands: { E, S, W, N }, wall: WALL, phase: "draw", turn: "E" }), "E");
    const two = viewFor(fixture({ hands: { E, S: W, W: N, N: S }, wall: [...WALL].reverse(), phase: "draw", turn: "E" }), "E");
    assert.deepEqual(tableOf(one), tableOf(two));
    assert.deepEqual(closestHands(one), closestHands(two));
  });
});
