/**
 * The result card's account of the points: who pays whom and why, and why
 * nothing moved when nothing did. The wording lives in `app/src/settlement.js`
 * (plain words from the tagged ledger), tried here on real engine hands.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ledgerTotals, type GameState } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

// @ts-expect-error - a plain browser module without type declarations
const { explainSettlement } = await import("../../app/src/settlement.js");

const NAMES: Record<string, string> = { E: "East", S: "South", W: "West", N: "North" };
const FILLER = {
  S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
  W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};

function account(state: GameState, you = "E") {
  const result = state.result!;
  return explainSettlement({
    outcome: {
      kind: result.kind,
      winner: result.winner,
      from: result.from,
      selfDrawn: result.selfDrawn,
      ledger: state.ledger,
    },
    you,
    dealer: state.dealer,
    name: (seat: string) => NAMES[seat],
    fishing: state.fishing.map((entry) => entry.seat),
  }) as {
    summary: string[];
    seats: Record<string, { lines: { dir: string; text: string; why: string }[] }>;
  };
}

const linesOf = (seats: ReturnType<typeof account>["seats"], seat: string) =>
  seats[seat].lines.map((line) => `${line.text} | ${line.why}`);

describe("the result card's account of the points", () => {
  it("explains a win, East's double, and a fishing hand paid by the losers", () => {
    const state = fixture({
      hands: {
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        E: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3",
        W: FILLER.W,
        N: FILLER.N,
      },
      wall: ["o6"],
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "b5", end: "front" },
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });
    const won = play(state, { type: "Win", seat: "S", kind: "self-drawn" }).state;
    const { summary, seats } = account(won, "W");

    assert.match(summary[0]!, /^South won by drawing the winning tile\./);
    assert.match(summary[0]!, /pays the winner 1,000, except East, who pays double: 2,000\./);
    assert.match(summary[1]!, /fishing hand is paid by the other losing players.*the winner pays nothing/);

    // East pays double as dealer, and is also the fishing player paid by W and N.
    assert.deepEqual(linesOf(seats, "E"), [
      "Pays South 2,000 | winning hand · East pays double",
      "Receives 400 from you | fishing: East was one tile short of a half-limit hand · East receives double",
      "Receives 400 from North | fishing: East was one tile short of a half-limit hand · East receives double",
    ]);
    // The viewer is West: "you", and the winner never appears as a fishing payer.
    assert.deepEqual(linesOf(seats, "W"), [
      "Pays South 1,000 | winning hand",
      "Pays East 400 | fishing: East was one tile short of a half-limit hand · East receives double",
    ]);
    assert.ok(!linesOf(seats, "S").some((line) => line.includes("fishing")));

    // The lines add up to the net change the card shows for every seat.
    const totals = ledgerTotals(won).totals;
    for (const seat of ["E", "S", "W", "N"]) {
      const net = seats[seat]!.lines.reduce((sum, line) => {
        const amount = Number(line.text.match(/[\d,]+$|[\d,]+(?= from)/)?.[0].replace(/,/g, "") ?? 0);
        return sum + (line.dir === "get" ? amount : line.dir === "pay" ? -amount : 0);
      }, 0);
      assert.equal(net, totals[seat as "E"], `${seat}: the lines add up to the net change`);
    }
  });

  it("says nothing was exchanged on a drawn hand, and why a fishing player got nothing", () => {
    const state = fixture({
      hands: {
        E: "o5 o5 b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b7",
        ...FILLER,
      },
      wall: [],
      phase: "draw",
      turn: "S",
      fishing: [{ seat: "E", wait: ["b7"], tier: "limit" }],
    });
    const drawn = play(state, { type: "Draw", seat: "S" }).state;
    const { summary, seats } = account(drawn, "E");
    assert.equal(
      summary[0],
      "Nobody went Mah Jong before the wall ran out, so nobody pays and nobody scores (p. 21).",
    );
    assert.equal(
      summary[1],
      "You were fishing, but fishing only pays when another player goes Mah Jong (p. 21, 32).",
    );
    assert.deepEqual(linesOf(seats, "E"), [
      "Nothing paid or received | you were fishing, but a drawn hand pays no fishing (p. 21)",
    ]);
    assert.deepEqual(linesOf(seats, "S"), ["Nothing paid or received | "]);
  });

  it("explains a careless discard that makes the discarder pay the other losers' shares", () => {
    const state = fixture({
      hands: {
        ...FILLER,
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        S: "b2 b2 b2 b5",
      },
      melds: {
        S: [
          { kind: "pung", tiles: ["b7", "b7", "b7"], exposed: true },
          { kind: "pung", tiles: ["b8", "b8", "b8"], exposed: true },
          { kind: "pung", tiles: ["b9", "b9", "b9"], exposed: true },
        ],
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const won = play(discarded.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b5"] }).state;
    const { summary, seats } = account(won, "E");
    assert.match(summary[0]!, /^South won on your discard\./);
    const east = linesOf(seats, "E");
    assert.ok(east.some((line) => line.includes("careless discard, also paying West's share (p. 22)")));
    assert.ok(east.some((line) => line.includes("careless discard, also paying North's share (p. 22)")));
    assert.ok(east.some((line) => line.startsWith("Pays South") && line.includes("winning hand")));
  });

  it("says East won, so every loser pays double", () => {
    const state = fixture({
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        ...FILLER,
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" }).state;
    const { summary, seats } = account(won, "S");
    assert.match(summary[0]!, /^East won by drawing the winning tile\. East won, so each of the other players pays double: /);
    assert.ok(linesOf(seats, "E").every((line) => line.startsWith("Receives") && line.includes("East receives double")));
  });
});
