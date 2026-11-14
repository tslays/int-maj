/**
 * The counter sticks on the result card (`app/src/sticks.js`): the
 * Illustrated's Western counters (p. 23) in the Companion's colours (p. 55),
 * a payment shown in the fewest sticks, and the exchange planned from a real
 * engine hand's ledger.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ledgerTotals } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

// @ts-expect-error - a plain browser module without type declarations
const { STICKS, exchangePlan, stickColor, sticksFor } = await import("../../app/src/sticks.js");

type Stick = { value: number; color: string; count: number };
type Phase = { kind: string; transfers: { from: string; to: string; points: number; sticks: number[] }[] };

describe("the counter sticks", () => {
  it("are the Illustrated's counters in the Companion's colours", () => {
    assert.deepEqual(
      (STICKS as Stick[]).map(({ value, color, count }) => [value, color, count]),
      [
        [4000, "red", 1],
        [1000, "blue", 7],
        [500, "green", 8],
        [100, "yellow", 10],
      ],
    );
    const start = (STICKS as Stick[]).reduce((sum, stick) => sum + stick.value * stick.count, 0);
    // A player's starting points (STARTING_POINTS in app/src/shared.js).
    assert.equal(start, 16000);
    assert.equal(stickColor(500), "green");
    assert.throws(() => stickColor(200));
  });

  it("show a payment in the fewest sticks, largest first", () => {
    assert.deepEqual(sticksFor(0), []);
    assert.deepEqual(sticksFor(100), [100]);
    assert.deepEqual(sticksFor(300), [100, 100, 100]);
    assert.deepEqual(sticksFor(1200), [1000, 100, 100]);
    assert.deepEqual(sticksFor(1500), [1000, 500]);
    assert.deepEqual(sticksFor(4000), [4000]);
    assert.deepEqual(sticksFor(8800), [4000, 4000, 500, 100, 100, 100]);
    for (let points = 0; points <= 20000; points += 100) {
      assert.equal((sticksFor(points) as number[]).reduce((a, b) => a + b, 0), points);
    }
  });

  it("refuse a payment the counters cannot make", () => {
    assert.throws(() => sticksFor(150));
    assert.throws(() => sticksFor(-100));
    assert.throws(() => sticksFor(Number.NaN));
  });
});

describe("the exchange of counters", () => {
  it("flies the winner's payments together, then the fishing payments, adding up to the ledger", () => {
    const state = fixture({
      hands: {
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        E: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6"],
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "b5", end: "front" },
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });
    const won = play(state, { type: "Win", seat: "S", kind: "self-drawn" }).state;
    const phases = exchangePlan(won.ledger) as Phase[];
    assert.deepEqual(
      phases.map((phase) => phase.kind),
      ["win", "fishing"],
    );
    assert.deepEqual(
      phases[0]!.transfers.map((t) => [t.from, t.to, t.points, t.sticks]),
      [
        ["E", "S", 3000, [1000, 1000, 1000]],
        ["W", "S", 1500, [1000, 500]],
        ["N", "S", 1500, [1000, 500]],
      ],
    );
    const net: Record<string, number> = { E: 0, S: 0, W: 0, N: 0 };
    for (const phase of phases) {
      for (const transfer of phase.transfers) {
        assert.equal(transfer.sticks.reduce((a, b) => a + b, 0), transfer.points);
        net[transfer.from]! -= transfer.points;
        net[transfer.to]! += transfer.points;
      }
    }
    assert.deepEqual(net, { ...ledgerTotals(won).totals });
  });

  it("merges payments between the same seats, and leaves out entries with no points", () => {
    const phases = exchangePlan([
      { kind: "difference", from: "W", to: "N", points: 200 },
      { kind: "difference", from: "W", to: "N", points: 300 },
      { kind: "difference", from: "E", to: "N", points: null },
      { kind: "goulash", from: "E", to: "S", points: 250 },
    ]) as Phase[];
    assert.deepEqual(phases, [
      { kind: "difference", transfers: [{ from: "W", to: "N", points: 500, sticks: [500] }] },
      { kind: "goulash", transfers: [{ from: "E", to: "S", points: 250, sticks: [100, 100] }] },
    ]);
    assert.deepEqual(exchangePlan([]), []);
    assert.deepEqual(exchangePlan([{ kind: "win", from: "E", to: "S", points: null }]), []);
  });
});
