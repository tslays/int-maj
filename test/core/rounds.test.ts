import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimOptions,
  endsGame,
  legalActions,
  newGame,
  nextHand,
  type GameState,
  type Seat,
} from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

function finished(
  dealer: Seat,
  prevailingWind: GameState["prevailingWind"],
  nextDealer: Seat,
  kind: "win" | "drawn" = "win",
  roundDealer: Seat = "E",
): GameState {
  return fixture({
    dealer,
    prevailingWind,
    roundDealer,
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
  // R-032 [I p. 23]: "A round is finished when each player has completed a
  // turn as East Wind." The wind stays while the deal travels round the table.
  it("keeps the round wind until every seat has dealt", () => {
    for (const [dealer, next] of [["E", "S"], ["S", "W"], ["W", "N"]] as const) {
      const state = nextHand(finished(dealer, "E", next)).state;
      assert.equal(state.dealer, next);
      assert.equal(state.prevailingWind, "E", `${dealer} passing to ${next}`);
      assert.equal(state.roundDealer, "E");
    }
  });

  it("advances the wind when the deal returns to the round's first dealer", () => {
    const south = nextHand(finished("N", "E", "E")).state;
    assert.equal(south.dealer, "E");
    assert.equal(south.prevailingWind, "S");
    assert.equal(south.roundDealer, "E");
  });

  it("counts the round from whichever seat the dice made the first dealer", () => {
    const passing = nextHand(finished("N", "E", "E", "win", "S")).state;
    assert.equal(passing.prevailingWind, "E");
    const done = nextHand(finished("E", "E", "S", "win", "S")).state;
    assert.equal(done.prevailingWind, "S");
    assert.equal(done.roundDealer, "S");
  });

  it("ends the game when the North round is finished", () => {
    const last = finished("N", "N", "E");
    assert.equal(endsGame(last), true);
    assert.throws(() => nextHand(last), /game is over/);
    assert.equal(endsGame(finished("W", "N", "N")), false);
    assert.equal(endsGame(finished("N", "W", "E")), false);
  });

  it("starts the first round at the dealt seat", () => {
    assert.equal(newGame("rounds", { dealer: "W" }).state.roundDealer, "W");
  });

  it("keeps the round wind when the dealer repeats", () => {
    const next = nextHand(finished("E", "E", "E")).state;
    assert.equal(next.dealer, "E");
    assert.equal(next.prevailingWind, "E");
  });

  it("never advances the round wind out of order", () => {
    const winds = ["E", "S", "W", "N"] as const;
    for (let index = 0; index < winds.length - 1; index++) {
      const next = nextHand(finished("N", winds[index]!, "E")).state;
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

  // R-074 [I p. 21]: the hand is drawn only "before all tiles have been drawn
  // from the wall" - the loose pair is drawn down too, nothing is left over.
  it("draws the loose pair down before a Western hand is drawn", () => {
    let state = fixture({
      dealer: "E",
      wall: [],
      loose: ["b1", "b2"],
      phase: "draw",
      turn: "S",
    });
    state = play(state, { type: "Draw", seat: "S" }).state;
    assert.equal(state.wall.loose.length, 1);
    assert.equal(state.phase, "discard");
    const thrown = state.players[1]!.hand.find((key) => key !== "b1")!;
    state = play(state, { type: "Discard", seat: "S", tile: thrown }).state;
    while (state.phase === "claim") {
      state = play(state, { type: "Pass", seat: state.turn }).state;
    }
    state = play(state, { type: "Draw", seat: state.turn }).state;
    assert.equal(state.wall.loose.length, 0);
    assert.equal(state.result, null);
    const discarder = state.turn;
    const out = state.players[["E", "S", "W", "N"].indexOf(discarder)]!.hand[0]!;
    state = play(state, { type: "Discard", seat: discarder, tile: out }).state;
    while (state.phase === "claim") {
      state = play(state, { type: "Pass", seat: state.turn }).state;
    }
    assert.equal(state.result?.kind, "drawn");
    assert.equal(state.wall.loose.length, 0);
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
