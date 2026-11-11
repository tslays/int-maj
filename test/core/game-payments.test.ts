import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  claimOptions,
  fishingDeclarationFor,
  fishingValueFor,
  isApplyError,
  legalActions,
  ledgerTotals,
  newGame,
  nextHand,
  replayEventLog,
  roundTo100,
  serialize,
  type Action,
  type GameState,
  viewFor,
} from "../../src/core/game/index.ts";
import { fixture, handOf, play, playError } from "../helpers/game-fixture.ts";

function zeroSum(state: GameState): void {
  const { totals } = ledgerTotals(state);
  assert.equal(totals.E + totals.S + totals.W + totals.N, 0);
}

const FILLER = {
  S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
  W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};

describe("payments", () => {
  it("pays a self-drawn dealer win from all three with East receiving double", () => {
    const state = fixture({
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        ...FILLER,
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.result?.points, 1500);
    assert.equal(won.state.result?.nextDealer, "E");
    assert.deepEqual(
      won.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["S", "E", 3000],
        ["W", "E", 3000],
        ["N", "E", 3000],
      ],
    );
    assert.deepEqual(ledgerTotals(won.state).totals, { E: 9000, S: -3000, W: -3000, N: -3000 });
    zeroSum(won.state);
  });

  it("makes the dealer pay double on a non-dealer self-drawn win", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "b5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "S", kind: "self-drawn" });
    assert.deepEqual(
      won.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["E", "S", 3000],
        ["W", "S", 1500],
        ["N", "S", 1500],
      ],
    );
    assert.match(won.state.ledger[0]!.reason, /dealer double/);
    assert.equal(won.state.result?.nextDealer, "S");
    zeroSum(won.state);
  });

  it("makes all three losers pay a win on a discard, East double", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        ...FILLER,
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5",
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const won = play(discarded.state, {
      type: "Claim",
      seat: "S",
      kind: "mahjong",
      tiles: ["b5"],
    });
    assert.equal(won.state.result?.from, "E");
    assert.equal(won.state.result?.selfDrawn, false);
    assert.deepEqual(
      won.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["E", "S", 3000],
        ["W", "S", 1500],
        ["N", "S", 1500],
      ],
    );
    assert.equal(won.state.result?.nextDealer, "S");
    zeroSum(won.state);
  });

  it("settles a fishing declaration independently when the fisher loses", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 b7 b8",
        S: "c1 c1 c2 c2 c3 c3 c4 c4 c5 c5 c6 c6 c7",
        W: "o1 o1 o2 o2 o3 o3 o4 o4 o5 o5 o6 o6 o7",
        N: "wE wE wS wS wW wW wN wN dR dR dG dG dW",
      },
      wall: ["c7", "o8", "o9", "b9", "c8", "c9", "o1", "o2", "o3"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b8" });
    assert.equal(discarded.state.phase, "announce");
    const declaration = legalActions(discarded.state, "E").find(
      (action) => action.type === "DeclareFishing",
    );
    assert.ok(declaration);
    const fished = play(discarded.state, declaration);
    assert.equal(fished.state.fishing[0]?.tier, "limit");
    assert.ok(fished.state.fishing[0]?.wait.includes("b7"));

    const drawn = play(fished.state, { type: "Draw", seat: "S" });
    const won = play(drawn.state, { type: "Win", seat: "S", kind: "self-drawn" });
    assert.equal(won.state.result?.winner, "S");
    const fishingEntries = won.state.ledger.filter((entry) => entry.reason.startsWith("fishing"));
    assert.deepEqual(
      fishingEntries.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["W", "E", 800],
        ["N", "E", 800],
      ],
    );
    assert.deepEqual(ledgerTotals(won.state).totals, { E: -400, S: 4000, W: -1800, N: -1800 });
    zeroSum(won.state);
  });

  it("does not pay a fishing player who is the winner", () => {
    const state = fixture({
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 o9",
        S: "b1 b2 b3 c1 c2 c3 c7 c8 c9 wE wS wW b5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o1", "o2", "o3"],
      phase: "discard",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b5"], tier: "middle" }],
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o9" });
    const drawn = play(discarded.state, { type: "Draw", seat: "S" });
    const sDiscard = play(drawn.state, { type: "Discard", seat: "S", tile: "b5" });
    const won = play(sDiscard.state, {
      type: "Claim",
      seat: "E",
      kind: "mahjong",
      tiles: ["b5"],
    });
    assert.equal(won.state.result?.winner, "E");
    assert.ok(!won.state.ledger.some((entry) => entry.reason.startsWith("fishing")));
    assert.deepEqual(
      won.state.ledger
        .map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["S", "E", 3000],
        ["W", "E", 3000],
        ["N", "E", 3000],
      ],
    );
    // East had nothing exposed, so no exposed tiles indicated b5: South's
    // discard was not careless (I p. 22), whatever East had announced.
    assert.equal(won.state.ledger.some((entry) => entry.reason.startsWith("careless")), false);
    zeroSum(won.state);
  });

  it("reproduces the book's worked example: 84 x 2^5, East 2000 / others 1000", () => {
    const state = fixture({
      hands: {
        E: FILLER.S,
        S: FILLER.W,
        N: FILLER.N,
        W: "b3 b3 b3 wE wE",
      },
      melds: {
        W: [
          { kind: "pung", tiles: ["wW", "wW", "wW"], exposed: true },
          { kind: "kong", tiles: ["dG", "dG", "dG", "dG"], exposed: true },
          { kind: "kong", tiles: ["b1", "b1", "b1", "b1"], exposed: false },
        ],
      },
      flowers: { W: "f3" },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "W",
      lastDraw: { seat: "W", tile: "b3", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "W", kind: "self-drawn" });
    assert.equal(won.state.result?.points, 1000);
    assert.equal(won.state.result?.ground, 84);
    assert.equal(won.state.result?.doubles, 5);
    assert.equal(won.state.result?.raw, 2688);
    assert.equal(won.state.result?.limit, 1000);
    const view = viewFor(won.state, "W");
    assert.equal(view.result?.ground, 84);
    assert.equal(view.result?.doubles, 5);
    assert.equal(view.result?.raw, 2688);
    assert.equal(view.result?.points, 1000);
    assert.equal(view.result?.limit, 1000);
    assert.deepEqual(
      won.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["E", "W", 2000],
        ["S", "W", 1000],
        ["N", "W", 1000],
      ],
    );
    assert.deepEqual(ledgerTotals(won.state).totals, {
      E: -2000,
      S: -1000,
      W: 4000,
      N: -1000,
    });
    zeroSum(won.state);
  });

  it("rounds each payment to the nearest 100, over 50 up", () => {
    assert.equal(roundTo100(288), 300);
    assert.equal(roundTo100(250), 200);
    assert.equal(roundTo100(251), 300);
    assert.equal(roundTo100(1000), 1000);

    const state = fixture({
      hands: {
        E: FILLER.S,
        W: FILLER.W,
        N: FILLER.N,
        S: "c6 c6 c6 c7 c7 c7 c9 c9 c9 c5 c5",
      },
      melds: {
        S: [{ kind: "chow", tiles: ["c1", "c2", "c3"], exposed: true }],
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "c5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "S", kind: "self-drawn" });
    assert.equal(won.state.result?.points, 320);
    assert.deepEqual(
      won.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["E", "S", 600],
        ["W", "S", 300],
        ["N", "S", 300],
      ],
    );
    zeroSum(won.state);
  });

  it("scores a Calculate hand from the ground score instead of a flat tier", () => {
    const state = fixture({
      hands: {
        E: "c1 c2 c3 c6 c6 c6 c7 c7 c7 c9 c9 c9 c5 c5",
        ...FILLER,
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "c5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.result?.tier, "calculate");
    assert.equal(won.state.result?.points, 1000);
    assert.ok(won.state.ledger.every((entry) => entry.points === 2000));
    assert.equal(ledgerTotals(won.state).unknown, 0);
    assert.deepEqual(ledgerTotals(won.state).totals, { E: 6000, S: -2000, W: -2000, N: -2000 });
    assert.ok(won.events.some((event) => event.type === "HandScored" && event.points === 1000));
  });
});

describe("dealer rotation", () => {
  const finishedSelfDrawn = () => {
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
    return play(state, { type: "Win", seat: "E", kind: "self-drawn" }).state;
  };

  it("keeps the deal when the dealer wins", () => {
    const won = finishedSelfDrawn();
    assert.equal(won.result?.nextDealer, "E");
    const next = nextHand(won);
    assert.equal(next.state.dealer, "E");
    assert.equal(next.state.handNumber, 2);
    assert.equal(next.events[0]?.type, "NextDeal");
  });

  it("passes the deal when a non-dealer wins", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        ...FILLER,
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5",
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const won = play(discarded.state, {
      type: "Claim",
      seat: "S",
      kind: "mahjong",
      tiles: ["b5"],
    });
    assert.equal(won.state.result?.nextDealer, "S");
    assert.equal(nextHand(won.state).state.dealer, "S");
  });

  it("keeps the deal after a drawn hand", () => {
    const state = fixture({
      hands: {
        E: "b2 b2 b2 c1 c2 c3 c7 c8 c9 wE wS wW o5 o9",
        ...FILLER,
      },
      wall: [],
      phase: "draw",
      turn: "S",
    });
    const drawn = play(state, { type: "Draw", seat: "S" });
    assert.equal(drawn.state.result?.kind, "drawn");
    assert.equal(drawn.state.result?.nextDealer, "E");
    assert.ok(drawn.events.some((event) => event.type === "DrawnHand"));
    assert.equal(nextHand(drawn.state).state.dealer, "E");
  });

  it("pays nothing to a fishing player when the hand is drawn (I p. 21 #22, #26)", () => {
    const state = fixture({
      hands: {
        E: "o5 o5 b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b7",
        S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: [],
      phase: "draw",
      turn: "S",
      fishing: [{ seat: "E", wait: ["b7"], tier: "limit" }],
    });
    const drawn = play(state, { type: "Draw", seat: "S" });
    assert.equal(drawn.state.result?.kind, "drawn");
    assert.equal(drawn.state.fishing.length, 1, "E is still fishing when the wall runs out");
    assert.deepEqual(
      drawn.state.ledger.filter((entry) => entry.reason.startsWith("fishing")),
      [],
    );
    assert.deepEqual(ledgerTotals(drawn.state).totals, { E: 0, S: 0, W: 0, N: 0 });
  });
});

describe("ledger entries say why", () => {
  it("tags every payment with its kind, East's double and the fishing tier", () => {
    const state = fixture({
      hands: {
        E: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3",
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6"],
      phase: "discard",
      turn: "S",
      lastDraw: { seat: "S", tile: "b5", end: "front" },
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });
    const won = play(state, { type: "Win", seat: "S", kind: "self-drawn" });
    const summary = won.state.ledger.map((entry) => ({
      from: entry.from,
      to: entry.to,
      kind: entry.kind,
      doubled: entry.doubled,
      tier: entry.tier,
    }));
    assert.deepEqual(summary, [
      { from: "E", to: "S", kind: "win", doubled: true, tier: undefined },
      { from: "W", to: "S", kind: "win", doubled: false, tier: undefined },
      { from: "N", to: "S", kind: "win", doubled: false, tier: undefined },
      { from: "W", to: "E", kind: "fishing", doubled: true, tier: "half" },
      { from: "N", to: "E", kind: "fishing", doubled: true, tier: "half" },
    ]);
  });
});

describe("fishing restrictions", () => {
  const fishingState = () =>
    fixture({
      hands: {
        E: "o5 o5 b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b7",
        S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 wE wS wW o5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6", "o7", "o8", "o9"],
      phase: "discard",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });

  it("still offers a fishing player pung and kong claims", () => {
    const state = fishingState();
    const options = claimOptions(state, "E", "o5", "S");
    assert.ok(options.some((option) => option.kind === "pung"));
  });

  it("accepts a fishing player's pung claim", () => {
    const state = fixture({
      hands: {
        E: "o5 o5 b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b7",
        S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 wE wS wW o5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6"],
      phase: "claim",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
      claimWindow: {
        discarder: "S",
        tile: "o5",
        pending: ["E"],
        claims: [],
      },
    });
    const claimed = play(state, {
      type: "Claim",
      seat: "E",
      kind: "pung",
      tiles: ["o5", "o5", "o5"],
    });
    assert.deepEqual(claimed.state.players[0]!.melds, [
      { kind: "pung", tiles: ["o5", "o5", "o5"], exposed: true },
    ]);
  });

  it("keeps a concealed kong legal and the fixed wait unchanged", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b7 b8",
        S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 wE wS wW o5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6", "o7", "o8", "o9"],
      phase: "discard",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });
    assert.ok(
      legalActions(state, "E").some(
        (action) => action.type === "ConcealedKong" && action.tile === "b1",
      ),
    );
    const kong = play(state, { type: "ConcealedKong", seat: "E", tile: "b1" });
    assert.deepEqual(kong.state.fishing, [{ seat: "E", wait: ["b7"], tier: "half" }]);
    assert.equal(kong.state.phase, "discard");
  });

  it("keeps an added kong to a concealed pung legal", () => {
    const state = fixture({
      hands: {
        E: "b1 b2 b2 b3 b3 b4 b4 b5 b5 b7 b8",
        S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 wE wS wW o5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      melds: {
        E: [{ kind: "pung", tiles: ["b1", "b1", "b1"], exposed: false }],
      },
      wall: ["o6", "o7", "o8", "o9"],
      phase: "discard",
      turn: "E",
      fishing: [{ seat: "E", wait: ["b7"], tier: "half" }],
    });
    assert.ok(
      legalActions(state, "E").some(
        (action) => action.type === "AddedKong" && action.tile === "b1",
      ),
    );
    const kong = play(state, { type: "AddedKong", seat: "E", tile: "b1" });
    assert.deepEqual(kong.state.players[0]!.melds, [
      { kind: "kong", tiles: ["b1", "b1", "b1", "b1"], exposed: false },
    ]);
    assert.deepEqual(kong.state.fishing, [{ seat: "E", wait: ["b7"], tier: "half" }]);
  });

  it("scores an ordinary fishing hand from the ground score without the Mah Jong 20", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b5 b5 b5 b6 b7 b8 b9 b9 b9 wE",
        S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 wE wS wW o5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
    });
    const value = fishingValueFor(state, "E", ["wE"]);
    assert.deepEqual(value, { tier: "calculate", value: 224 });
  });

  it("allows fishing when every copy of the wait is already dead", () => {
    const state = fixture({
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 o9",
        S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      discards: { S: ["b5"], W: ["b5"], N: ["b5"] },
      wall: ["o6", "o7", "o8", "o9"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "o9" });
    assert.equal(discarded.state.phase, "announce");
    assert.notEqual(fishingDeclarationFor(discarded.state, "E"), null);
  });
});

describe("event-log replay", () => {
  it("reproduces a full hand from the seed and the recorded actions", () => {
    const seed = "replay-hand";
    const start = newGame(seed);
    const actions: Action[] = [];
    let state = start.state;
    const events = [...start.events];

    while (state.phase !== "finished") {
      const legal = legalActions(state, state.turn);
      const action =
        legal.find((candidate) => candidate.type === "Draw") ??
        legal.find((candidate) => candidate.type === "Discard") ??
        legal.find((candidate) => candidate.type === "Pass");
      assert.ok(action, `no deterministic action in ${state.phase}`);
      const result = apply(state, action);
      assert.ok(!isApplyError(result), isApplyError(result) ? result.error : "");
      actions.push(action);
      state = result.state;
      events.push(...result.events);
    }

    assert.equal(state.result?.kind, "drawn");
    assert.equal(actions.length > 100, true);

    const replay = newGame(seed);
    let replayed = replay.state;
    const replayedEvents = [...replay.events];
    for (const action of actions) {
      const result = apply(replayed, action);
      assert.ok(!isApplyError(result), isApplyError(result) ? result.error : "");
      replayed = result.state;
      replayedEvents.push(...result.events);
    }
    assert.equal(JSON.stringify(replayedEvents), JSON.stringify(events));
    assert.equal(serialize(replayed), serialize(state));
    assert.deepEqual(handOf(replayed, "E"), handOf(state, "E"));

    // The event log alone is enough: no action list is needed.
    const fromEvents = replayEventLog(seed, events);
    assert.equal(JSON.stringify(fromEvents.events), JSON.stringify(events));
    assert.equal(serialize(fromEvents.state), serialize(state));
  });
});
