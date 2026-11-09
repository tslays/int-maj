/**
 * The final standings: ranking and ties, on the totals of real engine hands.
 * The book gives no tie-break (Illustrated p. 16), so ties are shown as ties.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ledgerTotals } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

// @ts-expect-error - a plain browser module without type declarations
const { rankSeats, winnerLine } = await import("../../app/src/standings.js");

const NAMES: Record<string, string> = { E: "East", S: "South", W: "West", N: "North" };
const name = (seat: string) => NAMES[seat];
const START = 16000;

function wonHand() {
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
  });
  return play(state, { type: "Win", seat: "S", kind: "self-drawn" }).state;
}

describe("final standings", () => {
  it("ranks the seats of a real won hand, best first, the winner named", () => {
    const { totals } = ledgerTotals(wonHand());
    const scores = Object.fromEntries(Object.entries(totals).map(([seat, delta]) => [seat, START + delta]));
    const ranking = rankSeats(scores);
    assert.equal(ranking[0].seat, "S");
    assert.equal(ranking[0].winner, true);
    assert.deepEqual(ranking.map((entry) => entry.rank).slice(0, 1), [1]);
    assert.equal(ranking.reduce((sum, entry) => sum + entry.total, 0), START * 4);
    for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].total >= ranking[i].total);
    assert.equal(winnerLine(ranking, name), "South wins the game");
  });

  it("shows equal totals as tied, sharing a rank, with no tie-break", () => {
    const ranking = rankSeats({ E: 16000, S: 17000, W: 15000, N: 16000 });
    assert.deepEqual(
      ranking.map((entry) => [entry.seat, entry.rank, entry.tied]),
      [
        ["S", 1, false],
        ["E", 2, true],
        ["N", 2, true],
        ["W", 4, false],
      ],
    );
  });

  it("names every seat tied for first as a winner", () => {
    const ranking = rankSeats({ E: 18000, S: 18000, W: 14000, N: 14000 });
    assert.deepEqual(ranking.filter((entry) => entry.winner).map((entry) => entry.seat), ["E", "S"]);
    assert.equal(winnerLine(ranking, name), "East and South tie for the win");
    const three = rankSeats({ E: 17000, S: 17000, W: 17000, N: 13000 });
    assert.equal(winnerLine(three, name), "East, South and West tie for the win");
  });

  it("handles a four-way tie (nothing moved)", () => {
    const ranking = rankSeats({ E: 16000, S: 16000, W: 16000, N: 16000 });
    assert.ok(ranking.every((entry) => entry.rank === 1 && entry.tied && entry.winner));
  });
});
