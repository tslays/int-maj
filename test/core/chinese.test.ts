import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand } from "../../src/core/hand.ts";
import { scoreHand } from "../../src/core/score.ts";
import { legalActions, newGame, type GameState } from "../../src/core/game/index.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

function census(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const player of state.players) {
    for (const key of player.hand) add(key);
    for (const key of player.flowers) add(key);
    for (const key of player.seasons) add(key);
    for (const key of player.discards) add(key);
    for (const meld of player.melds) for (const key of meld.tiles) add(key);
  }
  for (const key of state.wall.tiles.slice(state.wall.front, state.wall.back + 1)) add(key);
  for (const key of state.wall.loose) add(key);
  for (const key of state.wall.dead ?? []) add(key);
  return counts;
}

function total(state: GameState): number {
  return [...census(state).values()].reduce((sum, count) => sum + count, 0);
}

describe("Chinese profile", () => {
  it("deals 136 tiles with a 14-tile dead wall and no flowers or seasons", () => {
    const { state } = newGame("chinese-deal", { variant: "chinese" });
    assert.equal(state.variant, "chinese");
    assert.equal(state.wall.tiles.length, 136);
    assert.equal(state.wall.dead?.length, 14);
    assert.equal(state.wall.loose.length, 0);
    assert.equal(state.wall.back - state.wall.front + 1, 136 - 14 - 53);
    assert.equal(state.players.reduce((sum, p) => sum + p.hand.length, 0), 53);
    for (const key of census(state).keys()) {
      assert.ok(!key.startsWith("f") && !key.startsWith("s"), key);
    }
    assert.equal(total(state), 136);
  });

  it("never draws from the dead wall on ordinary turns", () => {
    let { state } = newGame("chinese-draws", { variant: "chinese" });
    for (let step = 0; step < 12 && state.phase !== "finished"; step++) {
      const action = legalActions(state, state.turn)[0]!;
      state = play(state, action).state;
      assert.equal(state.wall.dead?.length, 14);
      assert.ok(state.wall.front <= state.wall.back + 1);
    }
    assert.equal(total(state), 136);
  });

  it("replaces a kong from the dead wall", () => {
    const state = fixture({
      variant: "chinese",
      hands: {
        E: "b1 b1 b1 b1 b2 b3 b4 b5 b6 c1 c2 c3 c4",
        S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
        W: "b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7 c8",
        N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      },
      wall: ["o1", "o2", "o3", "o4"],
      phase: "discard",
      turn: "E",
    });
    const before = state.wall.dead?.length ?? 0;
    const kong = play(state, { type: "ConcealedKong", seat: "E", tile: "b1" });
    assert.equal(kong.state.wall.dead?.length, before - 1);
  });

  it("matches a mixed-suit Chinese ordinary hand and scores 10 for four worth-less chows", () => {
    const hand = createHand({
      concealed: "b1 b2 b3 b4 b5 b6 b9 b9 c1 c2 c3 o1 o2 o3",
      variant: "chinese",
    });
    const result = scoreHand(hand);
    assert.equal(result.winning?.pattern.id, "chinese-ordinary");
    assert.equal(result.points, 10);
  });

  it("does not match a mixed-suit hand in the Western profile", () => {
    const hand = createHand({
      concealed: "b1 b2 b3 b4 b5 b6 b9 b9 c1 c2 c3 o1 o2 o3",
      variant: "western",
    });
    assert.equal(scoreHand(hand).winning, null);
  });

  it("keeps the Western profile as the default", () => {
    const { state } = newGame("western-default");
    assert.equal(state.variant, "western");
    assert.equal(state.wall.tiles.length, 144);
    assert.equal(state.wall.loose.length, 2);
    assert.equal(state.wall.dead, undefined);
  });
});
