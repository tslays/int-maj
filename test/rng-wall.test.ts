import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../src/core/rng.ts";
import { buildWall, deal, shuffledWall } from "../src/core/wall.ts";
import { tileKey } from "../src/core/tiles.ts";

describe("seeded RNG", () => {
  it("is reproducible for a numeric or string seed", () => {
    const a = createRng("table-7");
    const b = createRng("table-7");
    const c = createRng("table-8");
    const streamA = Array.from({ length: 8 }, () => a.next());
    const streamB = Array.from({ length: 8 }, () => b.next());
    const streamC = Array.from({ length: 8 }, () => c.next());
    assert.deepEqual(streamA, streamB);
    assert.notDeepEqual(streamA, streamC);
  });

  it("returns floats in [0, 1) and integers in range", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      assert.ok(value >= 0 && value < 1);
      const index = rng.int(7);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 7);
    }
  });

  it("shuffles without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const rng = createRng(1);
    const output = rng.shuffle(input);
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
    assert.deepEqual(output.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });
});

describe("wall and deal", () => {
  it("produces a stable wall from a seed", () => {
    const first = shuffledWall("round-1").wall.map(tileKey);
    const second = shuffledWall("round-1").wall.map(tileKey);
    const other = shuffledWall("round-2").wall.map(tileKey);
    assert.deepEqual(first, second);
    assert.notDeepEqual(first, other);
    assert.equal(first.length, 144);
  });

  it("deals four 13-tile hands deterministically", () => {
    const a = deal("table-7");
    const b = deal("table-7");
    assert.equal(a.hands.length, 4);
    for (const hand of a.hands) assert.equal(hand.length, 13);
    assert.equal(a.wall.length, 144 - 52);
    assert.deepEqual(
      a.hands.map((hand) => hand.map(tileKey)),
      b.hands.map((hand) => hand.map(tileKey)),
    );
  });

  it("never deals more than four copies of a tile", () => {
    const { hands, wall } = deal("copy-check");
    const keys = [...hands.flat(), ...wall].map(tileKey);
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) assert.ok(count <= 4, key);
  });

  it("builds an unshuffled 144-tile wall", () => {
    assert.equal(buildWall().length, 144);
  });
});
