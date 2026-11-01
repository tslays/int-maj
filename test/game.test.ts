import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  deserialize,
  isApplyError,
  legalActions,
  newGame,
  nextHand,
  serialize,
  viewFor,
  wallRemaining,
  type Action,
  type GameState,
  type Seat,
} from "../src/core/game/index.ts";
import { fixture, handOf, play, playError } from "./game-fixture.ts";

const DEAL_SEED = "game-tests";

function counts(state: GameState): Map<string, number> {
  const map = new Map<string, number>();
  const add = (key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const player of state.players) {
    for (const key of player.hand) add(key);
    for (const key of player.flowers) add(key);
    for (const key of player.seasons) add(key);
    for (const meld of player.melds) for (const key of meld.tiles) add(key);
    for (const key of player.discards) add(key);
  }
  for (const key of state.wall.tiles.slice(state.wall.front, state.wall.back + 1)) add(key);
  return map;
}

describe("seeded deal", () => {
  it("deals 13 to each seat and leaves the rest of the 144 tiles in the wall", () => {
    const { state, events } = newGame(DEAL_SEED);
    assert.equal(state.players.length, 4);
    for (const player of state.players) assert.equal(player.hand.length, 13);
    assert.equal(
      wallRemaining(state) +
        state.players.reduce(
          (sum, player) =>
            sum + player.hand.length + player.flowers.length + player.seasons.length,
          0,
        ),
      144,
    );
    assert.deepEqual(
      events.slice(0, 4).map((event) => event.type),
      ["Dealt", "Dealt", "Dealt", "Dealt"],
    );
    assert.equal(events.filter((event) => event.type === "Dealt").length, 4);
    assert.equal(state.phase, "draw");
    assert.equal(state.turn, state.dealer);
  });

  it("never holds more than four copies of a tile after the deal", () => {
    const { state } = newGame(DEAL_SEED);
    for (const [key, count] of counts(state)) assert.ok(count <= 4, `${key}: ${count}`);
  });

  it("reproduces the same state and event log from the same seed", () => {
    const first = newGame("repeatable");
    const second = newGame("repeatable");
    assert.equal(serialize(first.state), serialize(second.state));
    assert.deepEqual(first.events, second.events);
  });

  it("changes the deal when the seed changes", () => {
    const first = newGame("repeatable");
    const second = newGame("different");
    assert.notEqual(serialize(first.state), serialize(second.state));
  });

  it("advances the RNG by exactly one shuffle and continues from that step", () => {
    const first = newGame("rng-step");
    assert.equal(first.state.rngSteps, 143);
    const finished = fixture({
      phase: "finished",
      result: {
        kind: "drawn",
        winner: null,
        from: null,
        selfDrawn: false,
        patternId: null,
        patternName: null,
        tier: null,
        points: null,
        nextDealer: "E",
        reason: "test",
      },
    });
    const next = nextHand(finished);
    assert.equal(next.state.rngSteps, 286);
    assert.notDeepEqual(next.state.wall.tiles, first.state.wall.tiles);
  });

  it("lets only the dealer draw first", () => {
    const { state } = newGame(DEAL_SEED);
    assert.deepEqual(legalActions(state, state.dealer), [
      { type: "Draw", seat: state.dealer },
    ]);
    for (const seat of ["S", "W", "N"] as const) {
      assert.deepEqual(legalActions(state, seat), []);
    }
  });
});

describe("draw and replacement", () => {
  it("draws from the front and moves to the discard phase", () => {
    const { state } = newGame(DEAL_SEED);
    const front = state.wall.tiles[state.wall.front];
    const result = play(state, { type: "Draw", seat: "E" });
    assert.equal(handOf(result.state, "E").length, 14);
    assert.equal(result.state.phase, "discard");
    assert.equal(result.state.turn, "E");
    assert.equal(result.state.lastDraw?.tile, front);
    assert.equal(result.events[0]?.type, "Drew");
  });

  it("replaces a flower immediately from the loose end", () => {
    const state = fixture({
      hands: {
        E: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["f1", "o1", "o2", "o3", "s1", "s2"],
    });
    const result = play(state, { type: "Draw", seat: "E" });
    assert.deepEqual(
      result.events.map((event) => event.type),
      ["Drew", "FlowerReplaced", "FlowerReplaced", "FlowerReplaced"],
    );
    assert.deepEqual(result.state.players[0]!.flowers, ["f1"]);
    assert.deepEqual(result.state.players[0]!.seasons, ["s2", "s1"]);
    assert.equal(handOf(result.state, "E").length, 14);
    assert.equal(result.state.wall.front, 1);
    assert.equal(result.state.wall.back, 2);
  });

  it("keeps the last bonus tile when the wall cannot replace it", () => {
    const state = fixture({
      hands: {
        E: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["f1"],
      phase: "draw",
      turn: "E",
    });
    const result = play(state, { type: "Draw", seat: "E" });
    assert.equal(result.state.phase, "finished");
    assert.equal(result.state.result?.kind, "drawn");
    assert.deepEqual(result.state.players[0]!.flowers, ["f1"]);
    assert.deepEqual(
      result.events.map((event) => event.type),
      ["Drew", "DrawnHand"],
    );
  });

  it("takes a kong replacement from the back while ordinary draws use the front", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7 c8",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o9"],
      phase: "discard",
      turn: "E",
    });
    const result = play(state, { type: "ConcealedKong", seat: "E", tile: "b1" });
    assert.equal(result.state.wall.front, 0);
    assert.equal(result.state.wall.back, 2);
    assert.ok(handOf(result.state, "E").includes("o9"));
    assert.equal(result.state.lastDraw?.end, "back");
    assert.deepEqual(result.state.players[0]!.melds, [
      { kind: "kong", tiles: ["b1", "b1", "b1", "b1"], exposed: false },
    ]);
    assert.deepEqual(
      result.events.map((event) => event.type),
      ["KongDeclared", "KongReplacementDrawn"],
    );
  });
});

describe("claims", () => {
  const chowState = () =>
    fixture({
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

  it("lists every legal chow variant separately", () => {
    const discarded = play(chowState(), { type: "Discard", seat: "E", tile: "o5" });
    assert.equal(discarded.state.phase, "claim");
    const chows = legalActions(discarded.state, "S").filter(
      (action) => action.type === "Claim" && action.kind === "chow",
    );
    assert.deepEqual(
      chows.map((action) => (action.type === "Claim" ? action.tiles : [])),
      [
        ["o3", "o4", "o5"],
        ["o4", "o5", "o6"],
        ["o5", "o6", "o7"],
      ],
    );
  });

  it("refuses a chow from a seat that is not on the discarder's left", () => {
    const discarded = play(chowState(), { type: "Discard", seat: "E", tile: "o5" });
    const afterPass = play(discarded.state, { type: "Pass", seat: "S" });
    const wActions = legalActions(afterPass.state, "W");
    assert.ok(wActions.some((action) => action.type === "Claim" && action.kind === "pung"));
    assert.ok(!wActions.some((action) => action.type === "Claim" && action.kind === "chow"));
    playError(
      afterPass.state,
      { type: "Claim", seat: "W", kind: "chow", tiles: ["o4", "o5", "o6"] },
      /on your left/,
    );
  });

  it("never lets a chow complete the hand", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW o5 o9",
        S: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o6 o9 o9",
        W: "b2 b2 b2 c4 c5 c6 c7 c8 c9 wS wS wS dR",
        N: "b3 b3 b3 c4 c5 c6 c7 c8 c9 wN wN wN dG",
      },
      wall: ["o1", "o2", "o3", "o4", "o5", "o6"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o5" });
    const sActions = legalActions(discarded.state, "S");
    assert.ok(sActions.some((action) => action.type === "Claim" && action.kind === "mahjong"));
    assert.ok(
      !sActions.some(
        (action) =>
          action.type === "Claim" &&
          action.kind === "chow" &&
          action.tiles.join(" ") === "o4 o5 o6",
      ),
    );
    playError(
      discarded.state,
      { type: "Claim", seat: "S", kind: "chow", tiles: ["o4", "o5", "o6"] },
      /illegal chow claim/,
    );
  });

  it("resolves an all-pass claim window by advancing the turn", () => {
    const discarded = play(chowState(), { type: "Discard", seat: "E", tile: "o5" });
    const first = play(discarded.state, { type: "Pass", seat: "S" });
    assert.equal(first.state.phase, "claim");
    const passed = play(first.state, { type: "Pass", seat: "W" });
    assert.equal(passed.state.phase, "draw");
    assert.equal(passed.state.turn, "S");
    assert.equal(passed.state.claimWindow, null);
    assert.ok(!passed.events.some((event) => event.type === "Claimed"));
  });

  it("resolves pung above chow when two seats claim", () => {
    const discarded = play(chowState(), { type: "Discard", seat: "E", tile: "o5" });
    const chow = play(discarded.state, {
      type: "Claim",
      seat: "S",
      kind: "chow",
      tiles: ["o4", "o5", "o6"],
    });
    const pung = play(chow.state, {
      type: "Claim",
      seat: "W",
      kind: "pung",
      tiles: ["o5", "o5", "o5"],
    });
    assert.equal(pung.state.phase, "discard");
    assert.equal(pung.state.turn, "W");
    assert.deepEqual(pung.state.players[2]!.melds, [
      { kind: "pung", tiles: ["o5", "o5", "o5"], exposed: true },
    ]);
    assert.deepEqual(
      pung.events.map((event) => event.type),
      ["Promoted", "Claimed"],
    );
  });

  it("resolves mahjong above pung when two seats claim", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW o5 o9",
        S: "o5 o5 b2 b3 b4 c1 c2 c3 c4 c5 c6 dR dG",
        W: "dG dG dG dR dR dR dW dW dW o1 o1 o1 o5",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4", "o5", "o6"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o5" });
    const pung = play(discarded.state, {
      type: "Claim",
      seat: "S",
      kind: "pung",
      tiles: ["o5", "o5", "o5"],
    });
    const win = play(pung.state, {
      type: "Claim",
      seat: "W",
      kind: "mahjong",
      tiles: ["o5"],
    });
    assert.equal(win.state.result?.winner, "W");
    assert.equal(win.state.players[2]!.melds.length, 0);
  });

  it("awards the same discard to only one mahjong claimant", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5",
        W: "b3 b3 b3 b4 b4 b4 b6 b6 b6 b7 b7 b7 b5",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4", "o5", "o6"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const first = play(discarded.state, {
      type: "Claim",
      seat: "S",
      kind: "mahjong",
      tiles: ["b5"],
    });
    const second = play(first.state, {
      type: "Claim",
      seat: "W",
      kind: "mahjong",
      tiles: ["b5"],
    });
    assert.equal(second.state.result?.winner, "S");
    assert.equal(
      second.events.filter((event) => event.type === "WinDeclared").length,
      1,
    );
    assert.deepEqual(
      second.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [["E", "S", 1500]],
    );
  });
});

describe("illegal actions", () => {
  const base = () =>
    fixture({
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

  const cases: Array<{ name: string; state: () => GameState; action: Action; pattern: RegExp }> = [
    {
      name: "not your turn",
      state: base,
      action: { type: "Discard", seat: "S", tile: "o3" },
      pattern: /not your turn/,
    },
    {
      name: "tile not in hand",
      state: base,
      action: { type: "Discard", seat: "E", tile: "b9" },
      pattern: /not in hand/,
    },
    {
      name: "draw in the discard phase",
      state: base,
      action: { type: "Draw", seat: "E" },
      pattern: /cannot draw in phase discard/,
    },
    {
      name: "pass with no window open",
      state: base,
      action: { type: "Pass", seat: "E" },
      pattern: /cannot pass in phase discard/,
    },
    {
      name: "claim with no window open",
      state: base,
      action: { type: "Claim", seat: "S", kind: "pung", tiles: ["o5", "o5", "o5"] },
      pattern: /no claim window/,
    },
    {
      name: "concealed kong with three copies",
      state: () =>
        fixture({
          hands: {
            E: "b1 b1 b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6",
            S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
            W: "b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7 c8",
            N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
          },
          wall: ["o1", "o2", "o3", "o9"],
          phase: "discard",
          turn: "E",
        }),
      action: { type: "ConcealedKong", seat: "E", tile: "b1" },
      pattern: /four copies/,
    },
    {
      name: "added kong without a concealed pung",
      state: base,
      action: { type: "AddedKong", seat: "E", tile: "b1" },
      pattern: /concealed pung/,
    },
    {
      name: "self-drawn win with an incomplete hand",
      state: base,
      action: { type: "Win", seat: "E", kind: "self-drawn" },
      pattern: /needs a tile drawn this turn|does not complete/,
    },
    {
      name: "fishing declaration outside the announce phase",
      state: base,
      action: { type: "DeclareFishing", seat: "E", wait: ["b5"] },
      pattern: /cannot declare fishing/,
    },
  ];

  for (const entry of cases) {
    it(`rejects ${entry.name} without changing state`, () => {
      const state = entry.state();
      const snapshot = serialize(state);
      const result = apply(state, entry.action);
      assert.ok(isApplyError(result), entry.name);
      assert.match(result.error, entry.pattern);
      assert.equal(serialize(result.state), snapshot);
    });
  }

  it("rejects a claim from a seat that is not answering next", () => {
    const state = base();
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o5" });
    playError(
      discarded.state,
      { type: "Claim", seat: "W", kind: "pung", tiles: ["o5", "o5", "o5"] },
      /not your claim/,
    );
  });
});

describe("purity", () => {
  it("does not mutate the input state on a legal action", () => {
    const { state } = newGame(DEAL_SEED);
    const before = serialize(state);
    play(state, { type: "Draw", seat: "E" });
    assert.equal(serialize(state), before);
  });
});

describe("serialisation and views", () => {
  it("round-trips a state mid-hand exactly", () => {
    let { state } = newGame(DEAL_SEED);
    for (let step = 0; step < 9; step++) {
      const action = legalActions(state, state.turn)[0]!;
      state = play(state, action).state;
    }
    const json = serialize(state);
    const restored = deserialize(json);
    assert.equal(serialize(restored), json);
    assert.deepEqual(restored, state);
  });

  it("hides the other three hands in a seat view", () => {
    const { state } = newGame(DEAL_SEED);
    const view = viewFor(state, "E");
    assert.deepEqual(view.player.hand, handOf(state, "E"));
    assert.equal(view.opponents.length, 3);
    for (const opponent of view.opponents) {
      assert.equal("hand" in opponent, false);
      assert.equal(opponent.handCount, 13);
    }
    assert.equal(view.wallRemaining, wallRemaining(state));
    assert.deepEqual(view.legalActions, legalActions(state, "E"));
    assert.deepEqual(viewFor(state, "S").legalActions, []);
  });
});
