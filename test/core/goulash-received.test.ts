/**
 * The tiles each seat received in a Goulash exchange are named by the engine
 * (#163), so the table can mark them without inferring them from the hand. A
 * tile received that matches one the seat passed away must still be named.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newGame, viewFor } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

describe("Goulash received tiles (#163)", () => {
  it("names every tile a seat received, including one it also passed", () => {
    const state = fixture({
      goulash: true,
      goulashStage: 0,
      phase: "exchange",
      turn: "E",
      hands: {
        E: "c8 b1 b2 b3 b4 b5 b6 b7 b8 b9 o3 o4 o5",
        S: "c4 c5 c6 c7 c9 o6 o7 o8 o9 dR dG dW wE",
        W: "c8 o1 o2 wE wS wW wN dR dG dW c1 c2 c3",
        N: "wS wW wN c1 c2 c3 c4 c5 c6 o2 o3 o4 b1",
      },
    });
    // Stage 0 pairs E with W and S with N. E and W both pass a c8.
    const picks = [
      ["E", ["c8", "b1", "b2"]],
      ["S", ["c9", "o9", "dR"]],
      ["W", ["c8", "o1", "o2"]],
      ["N", ["wS", "wW", "wN"]],
    ] as const;
    let current = state;
    for (const [seat, tiles] of picks) {
      current = play(current, { type: "GoulashExchange", seat, tiles: [...tiles] }).state;
    }

    assert.equal(current.goulashStage, 1);
    // E passed c8 and received c8 from W: the received c8 is still named.
    assert.deepEqual(viewFor(current, "E").goulashReceived, { stage: 0, tiles: ["c8", "o1", "o2"] });
    assert.deepEqual(viewFor(current, "W").goulashReceived, { stage: 0, tiles: ["c8", "b1", "b2"] });
    assert.deepEqual(viewFor(current, "S").goulashReceived, { stage: 0, tiles: ["wS", "wW", "wN"] });
    assert.deepEqual(viewFor(current, "N").goulashReceived, { stage: 0, tiles: ["c9", "o9", "dR"] });
  });

  it("shows a seat only the tiles it received, never another seat's", () => {
    const state = fixture({
      goulash: true,
      goulashStage: 0,
      phase: "exchange",
      turn: "E",
      hands: {
        E: "c8 b1 b2 b3 b4 b5 b6 b7 b8 b9 o3 o4 o5",
        S: "c4 c5 c6 c7 c9 o6 o7 o8 o9 dR dG dW wE",
        W: "c8 o1 o2 wE wS wW wN dR dG dW c1 c2 c3",
        N: "wS wW wN c1 c2 c3 c4 c5 c6 o2 o3 o4 b1",
      },
    });
    let current = state;
    for (const [seat, tiles] of [
      ["E", ["c8", "b1", "b2"]],
      ["S", ["c9", "o9", "dR"]],
      ["W", ["c8", "o1", "o2"]],
      ["N", ["wS", "wW", "wN"]],
    ] as const) {
      current = play(current, { type: "GoulashExchange", seat, tiles: [...tiles] }).state;
    }
    const east = viewFor(current, "E").goulashReceived;
    assert.equal(east?.tiles.includes("c9"), false);
    assert.equal(east?.tiles.includes("wS"), false);
  });

  it("names nothing before any exchange has finished", () => {
    const state = newGame("received-none", { dealer: "E" }).state;
    assert.equal(viewFor(state, "E").goulashReceived, null);
  });
});
