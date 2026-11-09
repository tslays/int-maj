/**
 * The eight audit rows closed after the printed pages: payer, Goulash,
 * penalties, careless discard, reshuffle, settlement levels and tournament.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apply,
  exposureIndicates,
  isApplyError,
  isFeaturelessHand,
  legalActions,
  ledgerTotals,
  newGame,
  nextHand,
  serialize,
  type Action,
  type GameState,
} from "../../src/core/game/index.ts";
import { fixture, handOf, play, playError } from "../helpers/game-fixture.ts";

function zeroSum(state: GameState): void {
  assert.equal(ledgerTotals(state).totals.E + ledgerTotals(state).totals.S + ledgerTotals(state).totals.W + ledgerTotals(state).totals.N, 0);
}

const FILLER = {
  S: "b1 b1 b1 b3 b3 b3 b4 b4 b4 b6 b6 b6 b7",
  W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};

describe("A7 fishing payer", () => {
  // I p. 21 #24: the winner "does not pay anyone"; the other players "total
  // their scores and settle the differences". I p. 24: intermediate scores and
  // pays the winning and the fishing hands. I p. 32: the fishing figures, East
  // paying or receiving double.
  const FISH_WINNER_HAND = "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5";
  const winBy = (seat: "E" | "S", fishing: GameState["fishing"], hands: Record<string, string>) => {
    const state = fixture({
      hands: { [seat]: FISH_WINNER_HAND, ...hands } as Record<"E" | "S" | "W" | "N", string>,
      wall: ["o6"],
      phase: "discard",
      turn: seat,
      lastDraw: { seat, tile: "b5", end: "front" },
      fishing,
    });
    return play(state, { type: "Win", seat, kind: "self-drawn" });
  };
  const fishingOf = (state: GameState) =>
    state.ledger
      .filter((entry) => entry.reason.startsWith("fishing"))
      .map((entry) => [entry.from, entry.to, entry.points]);

  it("settles a fishing hand against the other two losers, the winner paying nothing, East double", () => {
    const won = winBy("S", [{ seat: "E", wait: ["b7"], tier: "half" }], {
      E: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3",
      W: FILLER.W,
      N: FILLER.N,
    });
    assert.deepEqual(fishingOf(won.state), [
      ["W", "E", 400],
      ["N", "E", 400],
    ]);
    zeroSum(won.state);
  });

  it("does not double a fishing hand when East is not involved", () => {
    const won = winBy("E", [{ seat: "W", wait: ["b7"], tier: "limit" }], {
      S: FILLER.S,
      W: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3",
      N: FILLER.N,
    });
    assert.deepEqual(fishingOf(won.state), [
      ["S", "W", 400],
      ["N", "W", 400],
    ]);
    zeroSum(won.state);
  });

  it("settles two fishing hands by their difference", () => {
    const won = winBy(
      "E",
      [
        { seat: "W", wait: ["b7"], tier: "limit" },
        { seat: "N", wait: ["b7"], tier: "half" },
      ],
      { S: FILLER.S, W: FILLER.W, N: FILLER.N },
    );
    assert.deepEqual(fishingOf(won.state), [
      ["S", "W", 400],
      ["S", "N", 200],
      ["N", "W", 200],
    ]);
    zeroSum(won.state);
  });

  it("pays a fishing player a declared figure over the tier table", () => {
    const won = winBy("E", [{ seat: "W", wait: ["b7"], tier: "double", value: 800 }], {
      S: FILLER.S,
      W: FILLER.W,
      N: FILLER.N,
    });
    assert.deepEqual(fishingOf(won.state), [
      ["S", "W", 800],
      ["N", "W", 800],
    ]);
  });
});

describe("A24/A27 settlement levels", () => {
  it("beginner pays only the winning hand", () => {
    const state = fixture({
      settlement: "beginner",
      fishing: [{ seat: "W", wait: ["b5"], tier: "half" }],
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        ...FILLER,
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    assert.equal(won.state.ledger.some((entry) => entry.reason.startsWith("fishing")), false);
    assert.equal(won.state.ledger.length, 3);
    zeroSum(won.state);
  });

  it("advanced settles the differences between the losers' hands", () => {
    const state = fixture({
      settlement: "advanced",
      fishing: [{ seat: "W", wait: ["b5"], tier: "half" }],
      hands: {
        E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        S: FILLER.S,
        W: FILLER.W,
        N: "b2 b4 b7 c2 c4 c7 o2 o4 o7 wE wS wW b9",
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    const won = play(state, { type: "Win", seat: "E", kind: "self-drawn" });
    const differences = won.state.ledger.filter((entry) =>
      entry.reason.startsWith("losing hand difference"),
    );
    assert.ok(differences.length > 0);
    assert.equal(won.state.ledger.some((entry) => entry.reason.startsWith("fishing")), false);
    zeroSum(won.state);
  });
});

describe("A13 Goulash", () => {
  it("deals into three chosen exchanges and reaches a discard", () => {
    const state = fixture({
      goulash: true,
      goulashStage: 0,
      phase: "exchange",
      turn: "E",
      hands: {
        E: "b1 b2 b3 b4 b5 c1 c2 c3 c4 c5 o1 o2 o3 o4",
        S: "b6 b7 b8 b9 c6 c7 c8 c9 o5 o6 o7 o8 o9",
        W: "wE wS wW wN dR dG dW b1 b2 b3 c1 c2 c3",
        N: "dR dG dW b4 b5 b6 c4 c5 c6 o2 o3 o4 wS",
      },
    });
    let current = state;
    for (const stage of [0, 1, 2]) {
      for (const seat of ["E", "S", "W", "N"] as const) {
        const tiles = current.players.find((player) => player.seat === seat)!.hand.slice(0, 3);
        current = play(current, {
          type: "GoulashExchange",
          seat,
          tiles,
        }).state;
      }
    }
    assert.equal(current.phase, "discard");
    assert.equal(current.turn, "E");
    assert.equal(current.goulashStage, undefined);
    // Stage 0 swaps E/W and S/N.
    assert.equal(current.players.every((player) => player.hand.length === 13 || player.seat === "E"), true);
    assert.equal(current.players.find((player) => player.seat === "E")!.hand.length, 14);
    zeroSum(current);
  });

  it("forbids chows and pays the agreed pool to the winner", () => {
    const state = fixture({
      goulash: true,
      goulashPool: 200,
      hands: {
        E: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 o1 o2 o3 o4",
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
        W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
        N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
      },
      phase: "claim",
      turn: "E",
      claimWindow: { discarder: "S", tile: "b2", pending: ["E"], claims: [] },
    });
    assert.equal(
      legalActions(state, "E").some(
        (action) => action.type === "Claim" && action.kind === "chow",
      ),
      false,
    );
    const won = play(
      fixture({
        goulash: true,
        goulashPool: 200,
        hands: {
          E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
          ...FILLER,
        },
        wall: ["o6"],
        phase: "discard",
        turn: "E",
        lastDraw: { seat: "E", tile: "b5", end: "front" },
      }),
      { type: "Win", seat: "E", kind: "self-drawn" },
    );
    const pool = won.state.ledger.filter((entry) => entry.reason === "goulash pool");
    assert.deepEqual(
      pool.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["S", "E", 200],
        ["W", "E", 200],
        ["N", "E", 200],
      ],
    );
    zeroSum(won.state);
  });
});

describe("A15 penalties", () => {
  it("a false Mah Jong pays half a limit to every other exposed hand", () => {
    const state = fixture({
      phase: "discard",
      turn: "E",
      melds: { S: [{ kind: "pung", tiles: ["b1", "b1", "b1"], exposed: true }] },
    });
    const penalised = play(state, { type: "FalseMahJong", seat: "E" });
    assert.deepEqual(
      penalised.state.ledger.map((entry) => [entry.from, entry.to, entry.points]),
      [
        ["E", "S", 500],
        ["E", "W", 500],
        ["E", "N", 500],
      ],
    );
    zeroSum(penalised.state);
  });

  it("a drawn hand makes a too-many-tiles player pay all others", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5 b5 b5",
        ...FILLER,
      },
      wall: [],
      phase: "draw",
      turn: "S",
    });
    const drawn = play(state, { type: "Draw", seat: "S" });
    const penalties = drawn.state.ledger.filter((entry) => entry.reason.startsWith("too many"));
    assert.equal(penalties.length, 3);
    assert.ok(penalties.every((entry) => entry.from === "E" && entry.points === 500));
    zeroSum(drawn.state);
  });

  it("does not let a passed discard be claimed later", () => {
    const state = fixture({
      hands: {
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5",
        ...FILLER,
      },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    let current = play(state, { type: "Discard", seat: "E", tile: "b5" }).state;
    assert.equal(current.phase, "claim");
    while (current.phase === "claim") {
      current = play(current, { type: "Pass", seat: current.turn }).state;
    }
    current = play(current, { type: "Draw", seat: current.turn }).state;
    assert.equal(current.phase, "discard");
    assert.equal(
      legalActions(current, "S").some((action) => action.type === "Claim"),
      false,
    );
  });

  it("lets play continue after a false declaration when no hand was exposed", () => {
    const state = fixture({ phase: "discard", turn: "E" });
    playError(state, { type: "FalseMahJong", seat: "E" }, /play continues/);
  });

  it("does not offer a win to a hand with too few or too many tiles", () => {
    const tooFew = fixture({
      hands: { E: "dG dG dG dR dR dR dW dW dW b2 b2 b2", ...FILLER },
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b2", end: "front" },
    });
    assert.equal(
      legalActions(tooFew, "E").some((action) => action.type === "Win"),
      false,
    );
    const tooMany = fixture({
      hands: { E: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5 b5", ...FILLER },
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    assert.equal(
      legalActions(tooMany, "E").some((action) => action.type === "Win"),
      false,
    );
  });
});

describe("A16 careless discard", () => {
  // South's three exposed bamboo pungs show a one-suit hand: its exposed
  // tiles indicate that it needs bamboo or honours (I p. 22).
  const BAMBOO_SHOWN = [
    { kind: "pung" as const, tiles: ["b7", "b7", "b7"], exposed: true },
    { kind: "pung" as const, tiles: ["b8", "b8", "b8"], exposed: true },
    { kind: "pung" as const, tiles: ["b9", "b9", "b9"], exposed: true },
  ];

  function winOnB5(melds: typeof BAMBOO_SHOWN, fishing: { seat: "E"; wait: string[]; tier: "half" }[] = []) {
    const state = fixture({
      hands: {
        ...FILLER,
        E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
        S: melds.length === 3 ? "b2 b2 b2 b5" : "b2 b2 b2 b6 b6 b6 b5",
      },
      melds: { S: melds },
      fishing,
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    return play(discarded.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b5"] });
  }

  it("makes the discarder pay the other losers when exposed tiles indicated the tile", () => {
    const won = winOnB5(BAMBOO_SHOWN);
    assert.equal(won.state.result?.winner, "S");
    const careless = won.state.ledger.filter((entry) => entry.reason.startsWith("careless"));
    assert.equal(careless.length, 2);
    assert.ok(careless.every((entry) => entry.from === "E" && entry.to === "S"));
    zeroSum(won.state);
  });

  it("does not apply while fewer than three sets are exposed", () => {
    const won = winOnB5(BAMBOO_SHOWN.slice(0, 2));
    assert.equal(won.state.result?.winner, "S");
    assert.equal(won.state.ledger.some((entry) => entry.reason.startsWith("careless")), false);
  });

  it("exempts a discarder who was fishing", () => {
    const won = winOnB5(BAMBOO_SHOWN, [{ seat: "E", wait: ["o9"], tier: "half" }]);
    assert.equal(won.state.result?.winner, "S");
    assert.equal(won.state.ledger.some((entry) => entry.reason.startsWith("careless")), false);
  });

  it("reads the indication from exposed sets, never from an announced wait", () => {
    assert.equal(exposureIndicates(BAMBOO_SHOWN, "b5"), true);
    assert.equal(exposureIndicates(BAMBOO_SHOWN, "dR"), true);
    assert.equal(exposureIndicates(BAMBOO_SHOWN, "c5"), false);
    assert.equal(exposureIndicates(BAMBOO_SHOWN.slice(0, 2), "b5"), false);
    const honours = [
      { kind: "pung" as const, tiles: ["dR", "dR", "dR"], exposed: true },
      { kind: "pung" as const, tiles: ["dG", "dG", "dG"], exposed: true },
      { kind: "pung" as const, tiles: ["wE", "wE", "wE"], exposed: true },
    ];
    assert.equal(exposureIndicates(honours, "wN"), true);
    assert.equal(exposureIndicates(honours, "b5"), false);
    const mixed = [...BAMBOO_SHOWN.slice(0, 2), { kind: "pung" as const, tiles: ["c1", "c1", "c1"], exposed: true }];
    assert.equal(exposureIndicates(mixed, "b5"), false);
  });
});

describe("A17 reshuffle", () => {
  it("offers and performs a reshuffle for a featureless deal", () => {
    const featureless = "b2 b3 b5 b8 c2 c3 c5 c8 o2 o3 o5 o8 b6 c6";
    const state = fixture({
      hands: { E: featureless, ...FILLER },
      phase: "discard",
      turn: "E",
    });
    assert.equal(isFeaturelessHand(state, "E"), true);
    assert.ok(
      legalActions(state, "E").some((action) => action.type === "RequestReshuffle"),
    );
    const before = serialize(state);
    const dealt = play(state, { type: "RequestReshuffle", seat: "E" });
    assert.ok(dealt.events.some((event) => event.type === "Reshuffled"));
    assert.notEqual(serialize(dealt.state), before);
  });
});

describe("A25 tournament options", () => {
  it("removes flowers and seasons, keeps the limit at 1000 and passes East", () => {
    const started = newGame("tournament-1", { tournament: true });
    const state = started.state;
    assert.equal(state.limit, 1000);
    assert.equal(state.tournament, true);
    for (const player of state.players) {
      assert.deepEqual(player.flowers, []);
      assert.deepEqual(player.seasons, []);
    }
    assert.equal(
      state.wall.tiles.some((tile) => /^[fs]/.test(tile)),
      false,
    );
    const won = play(
      fixture({
        tournament: true,
        hands: {
          E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b5 o9",
          ...FILLER,
          S: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5",
        },
        wall: ["o6"],
        phase: "discard",
        turn: "E",
      }),
      { type: "Discard", seat: "E", tile: "b5" },
    );
    const win = play(won.state, {
      type: "Claim",
      seat: "S",
      kind: "mahjong",
      tiles: ["b5"],
    });
    assert.equal(win.state.result?.nextDealer, "S");
    assert.equal(nextHand(win.state).state.dealer, "S");
  });

  it("does not make a tournament drawn hand a Goulash", () => {
    const state = fixture({
      tournament: true,
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
    assert.equal(drawn.state.result?.goulash, false);
  });

  it("limits special hands to the selected list and three consecutive wins", () => {
    const state = fixture({
      specialHands: ["seven-twins"],
      recentSpecialHands: ["seven-twins", "seven-twins"],
      hands: {
        E: "b1 b1 b2 b2 b3 b3 c1 c1 c2 c2 o1 o1 wE wE",
        ...FILLER,
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b5", end: "front" },
    });
    assert.equal(
      legalActions(state, "E").some((action) => action.type === "Win"),
      false,
    );
    const allowed = fixture({
      specialHands: ["seven-twins"],
      hands: {
        E: "b1 b1 b2 b2 b3 b3 c1 c1 c2 c2 o1 o1 wE wE",
        ...FILLER,
      },
      wall: ["o6"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "wE", end: "front" },
    });
    assert.equal(
      legalActions(allowed, "E").some((action) => action.type === "Win"),
      true,
    );
  });

  it("rejects more than fourteen selected special hands", () => {
    assert.throws(
      () =>
        newGame("too-many", {
          specialHands: Array.from({ length: 15 }, (_, index) => `hand-${index}`),
        }),
      /fourteen/,
    );
  });
});
