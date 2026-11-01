/**
 * The console bot's contract: it acts only from the view's legal actions,
 * wins when it can, and is blind to the other three concealed hands.
 *
 * The self-play case is deliberately short: the soak test is the broad
 * exercise, while these cases pin the policy's observable promises.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  isApplyError,
  legalActions,
  newGame,
  viewFor,
  type Action,
  type GameState,
} from "../src/core/game/index.ts";
import { chooseAction } from "../src/core/game/bot.ts";
import { fixture, play } from "./game-fixture.ts";

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe("bot self-play", () => {
  for (const seed of ["bot-table-a", "bot-table-b"]) {
    it(`returns only legal actions for every decision (${seed})`, () => {
      let state = newGame(seed).state;
      let steps = 0;
      while (state.phase !== "finished" && steps < 500) {
        const seat = state.turn;
        const view = viewFor(state, seat);
        const action = chooseAction(view, seat);
        assert.notEqual(action, null, `${seat} had no action in ${view.phase}`);
        assert.ok(
          view.legalActions.some((candidate) => sameAction(candidate, action!)),
          `${seat} chose ${JSON.stringify(action)} outside legalActions`,
        );
        const result = apply(state, action!);
        assert.ok(!isApplyError(result), `${seed}: ${isApplyError(result) ? result.error : ""}`);
        if (isApplyError(result)) return;
        state = result.state;
        steps += 1;
      }
      assert.equal(state.phase, "finished", `${seed} did not terminate`);
    });
  }
});

describe("bot policy", () => {
  it("takes a self-drawn win when it is legal", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    const view = viewFor(state, "E");
    assert.ok(view.legalActions.some((action) => action.type === "Win"));
    const action = chooseAction(view, "E");
    assert.equal(action?.type, "Win");
  });

  it("takes a mahjong claim when it completes on another seat's discard", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE b5",
        S: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5",
        W: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    assert.equal(discarded.state.phase, "claim");
    const view = viewFor(discarded.state, "S");
    assert.ok(view.legalActions.some((action) => action.type === "Win"));
    assert.equal(chooseAction(view, "S")?.type, "Win");
  });

  it("declares fishing when the engine offers it", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3"],
      phase: "announce",
      turn: "E",
    });
    const view = viewFor(state, "E");
    const fishing = view.legalActions.find((action) => action.type === "DeclareFishing");
    assert.notEqual(fishing, undefined);
    const action = chooseAction(view, "E");
    assert.equal(action?.type, "DeclareFishing");
  });

  it("claims a pung when another pair remains", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE o5",
        S: "o5 o5 b2 b2 b3 c2 c3 c4 c5 c6 c7 dR dG",
        W: "b7 b8 b9 c7 c8 c9 o2 o3 o4 wE wS wW wN",
        N: "b7 b8 b9 c7 c8 c9 o1 o6 o7 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o5" });
    const view = viewFor(discarded.state, "S");
    const action = chooseAction(view, "S");
    assert.equal(action?.type, "Claim");
    assert.equal(action?.type === "Claim" ? action.kind : null, "pung");
  });

  it("declines a claim that would spend the hand's last pair", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE o5",
        S: "o5 o5 b2 b3 b4 b5 c2 c3 c4 c5 c6 c7 dR",
        W: "b7 b8 b9 c7 c8 c9 o2 o3 o4 wE wS wW wN",
        N: "b7 b8 b9 c7 c8 c9 o1 o6 o7 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o5" });
    const view = viewFor(discarded.state, "S");
    const action = chooseAction(view, "S");
    assert.equal(action?.type, "Pass");
  });

  it("is blind to the other seats' concealed tiles", () => {
    const shared = {
      hands: {
        E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE dG",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4"],
      phase: "discard" as const,
      turn: "E" as const,
    };
    const first = fixture({
      ...shared,
      hands: { ...shared.hands, S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN" },
    });
    const second = fixture({
      ...shared,
      hands: { ...shared.hands, S: "b1 b2 b3 c1 c2 c3 o4 o5 o6 wW wW wW wE" },
    });

    assert.notDeepEqual(first.players, second.players);
    assert.deepEqual(viewFor(first, "E"), viewFor(second, "E"));
    assert.deepEqual(
      chooseAction(viewFor(first, "E"), "E"),
      chooseAction(viewFor(second, "E"), "E"),
    );
  });

  it("never discards a fixed fishing wait", () => {
    const state = fixture({
      hands: {
        E: "b1 b2 b3 b5 c1 c2 c4 c5 o1 o4 o7 wS dR dW",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3"],
      phase: "discard",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b5"], tier: "calculate" }],
    });
    const action = chooseAction(viewFor(state, "E"), "E");
    assert.equal(action?.type, "Discard");
    assert.notEqual(action?.type === "Discard" ? action.tile : "", "b5");
  });

  it("rejects a view for a different seat", () => {
    const state = fixture({ phase: "discard", turn: "E" });
    assert.throws(
      () => chooseAction(viewFor(state, "E"), "S"),
      /view for E, not S/,
    );
  });
});
