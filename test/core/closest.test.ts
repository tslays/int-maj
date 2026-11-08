/**
 * The "closest hands" helper: the catalogue hands a seat's own tiles are
 * nearest to, from its view alone.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestHands, viewFor } from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};

/** A wall long enough that the seat still expects to draw for a while. */
const LONG_WALL: readonly string[] = Array.from(
  { length: 60 },
  (_, index) => ["c6", "o9", "dW", "c3", "o5", "wN"][index % 6]!,
);

// Wriggly Snake (I pp. 10, 27): one to nine in a suit and one of each wind, one tile paired.
const SNAKE_LESS_NORTH = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5";

describe("closest hands", () => {
  it("names the hand one tile away and the tile it needs", () => {
    const state = fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
    const hands = closestHands(viewFor(state, "E"));
    assert.ok(hands.length > 0 && hands.length <= 3);
    const snake = hands.find((hand) => hand.pattern === "wriggly-snake");
    assert.ok(snake, `expected Wriggly Snake among ${hands.map((hand) => hand.pattern).join(", ")}`);
    assert.equal(snake.away, 1);
    assert.deepEqual(snake.need, ["wN"]);
    assert.equal(snake.tier, "limit");
    assert.equal(snake.points, 1000);
    assert.ok(snake.chance > 0 && snake.chance <= 1);
    assert.equal(hands[0]!.away, 1, "nothing is nearer than one tile");
    for (let index = 1; index < hands.length; index++) {
      assert.ok(hands[index - 1]!.away <= hands[index]!.away, "sorted nearest first");
    }
  });

  it("drops a hand whose missing tile is all in sight", () => {
    const state = fixture({
      hands: { E: SNAKE_LESS_NORTH, ...OTHERS },
      discards: { S: ["wN", "wN"], N: ["wN", "wN"] },
      wall: LONG_WALL.filter((key) => key !== "wN"),
      phase: "draw",
      turn: "E",
    });
    const hands = closestHands(viewFor(state, "E"), 50);
    assert.ok(!hands.some((hand) => hand.pattern === "wriggly-snake"));
    assert.ok(hands.every((hand) => !hand.need.includes("wN")));
  });

  it("reports a complete hand as no tiles away", () => {
    const state = fixture({
      hands: { E: `${SNAKE_LESS_NORTH} wN`, ...OTHERS },
      wall: LONG_WALL,
      phase: "discard",
      turn: "E",
    });
    const [first] = closestHands(viewFor(state, "E"));
    assert.equal(first?.pattern, "wriggly-snake");
    assert.equal(first?.away, 0);
    assert.deepEqual(first?.need, []);
  });

  it("reads only the seat's own view", () => {
    const a = fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
    const b = fixture({
      hands: { E: SNAKE_LESS_NORTH, S: OTHERS.N, W: OTHERS.S, N: OTHERS.W },
      wall: LONG_WALL,
      phase: "draw",
      turn: "E",
    });
    assert.deepEqual(closestHands(viewFor(a, "E")), closestHands(viewFor(b, "E")));
  });
});
