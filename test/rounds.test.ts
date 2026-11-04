import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimOptions,
  legalActions,
  nextHand,
  type GameState,
  type Seat,
} from "../src/core/game/index.ts";
import { fixture, play } from "./game-fixture.ts";

function finished(
  dealer: Seat,
  prevailingWind: GameState["prevailingWind"],
  nextDealer: Seat,
  kind: "win" | "drawn" = "win",
): GameState {
  return fixture({
    dealer,
    prevailingWind,
    phase: "finished",
    result: {
      kind,
      winner: kind === "win" ? dealer : null,
      from: null,
      selfDrawn: false,
      patternId: null,
      patternName: null,
      tier: null,
      points: null,
      nextDealer,
      reason: "test",
      goulash: kind === "drawn",
    },
  });
}

describe("rounds and the Wind of the Round", () => {
  it("advances East, South, West, North and then ends the game", () => {
    const east = nextHand(finished("E", "E", "S")).state;
    assert.equal(east.dealer, "S");
    assert.equal(east.prevailingWind, "S");
    const south = nextHand(finished("S", "S", "W")).state;
    assert.equal(south.dealer, "W");
    assert.equal(south.prevailingWind, "W");
    const west = nextHand(finished("W", "W", "N")).state;
    assert.equal(west.dealer, "N");
    assert.equal(west.prevailingWind, "N");
    assert.throws(() => nextHand(finished("N", "N", "E")), /game is over/);
  });

  it("keeps the round wind when the dealer repeats", () => {
    const next = nextHand(finished("E", "E", "E")).state;
    assert.equal(next.dealer, "E");
    assert.equal(next.prevailingWind, "E");
  });

  it("never advances the round wind out of order", () => {
    const winds = ["E", "S", "W", "N"] as const;
    for (let index = 0; index < winds.length - 1; index++) {
      const next = nextHand(
        finished(winds[index]!, winds[index]!, winds[index + 1]!),
      ).state;
      assert.equal(next.prevailingWind, winds[index + 1]);
    }
  });
});

describe("drawn hands", () => {
  it("repeats the dealer once on a drawn Western hand", () => {
    const first = fixture({
      dealer: "E",
      wall: [],
      phase: "draw",
      turn: "S",
      drawRepeatUsed: false,
    });
    const drawn = play(first, { type: "Draw", seat: "S" }).state;
    assert.equal(drawn.result?.kind, "drawn");
    assert.equal(drawn.result?.nextDealer, "E");
    assert.equal(drawn.result?.goulash, true);

    const second = fixture({
      dealer: "E",
      wall: [],
      phase: "draw",
      turn: "S",
      drawRepeatUsed: true,
    });
    assert.equal(play(second, { type: "Draw", seat: "S" }).state.result?.nextDealer, "S");
  });

  it("marks the next Western hand as a Goulash", () => {
    const drawn = fixture({
      dealer: "E",
      wall: [],
      phase: "draw",
      turn: "S",
    });
    const result = play(drawn, { type: "Draw", seat: "S" }).state;
    const next = nextHand(result).state;
    assert.equal(next.goulash, true);
  });

  it("adds to the kitty and keeps East in the Chinese drawn hand", () => {
    const drawn = fixture({
      dealer: "E",
      variant: "chinese",
      kitty: 2,
      wall: [],
      phase: "draw",
      turn: "S",
    });
    const result = play(drawn, { type: "Draw", seat: "S" }).state;
    assert.equal(result.kitty, 3);
    assert.equal(result.result?.goulash, false);
    assert.equal(result.result?.nextDealer, "E");
  });

  it("does not offer a chow claim in a Goulash hand", () => {
    const state = fixture({
      goulash: true,
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW o5 o9",
        S: "o3 o4 o6 o7 b1 b3 b5 c2 c4 c6 dR dG dW",
        W: "o5 o5 o3 o4 o6 o7 b2 b4 b6 c1 c3 c5 dR",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4", "o5", "o6"],
      phase: "discard",
      turn: "E",
    });
    assert.ok(
      claimOptions(state, "S", "o5", "E").every((option) => option.kind !== "chow"),
    );
    assert.equal(legalActions(state, "E").some((action) => action.type === "Discard"), true);
  });
});
