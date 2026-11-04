import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRng } from "../src/core/rng.ts";
import {
  WALL_COUNT,
  WALL_HEIGHT,
  WALL_LENGTH,
  WALL_TILES,
  buildWall,
  buildWalls,
  deal,
  shuffledWall,
} from "../src/core/wall.ts";
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

  it("deals East 14 and the others 13, four at a time, deterministically", () => {
    const a = deal("table-7");
    const b = deal("table-7");
    assert.equal(a.hands.length, 4);
    assert.equal(a.hands[0]!.length, 14);
    for (const hand of a.hands.slice(1)) assert.equal(hand.length, 13);
    assert.equal(a.wall.loose.length, 2);
    assert.equal(a.wall.front, 53);
    assert.deepEqual(
      a.hands.map((hand) => hand.map(tileKey)),
      b.hands.map((hand) => hand.map(tileKey)),
    );
  });

  it("deals four at a time for three rounds, then one each and East's extra", () => {
    const { wall } = shuffledWall("printed-deal");
    let front = 0;
    const hands: string[][] = [[], [], [], []];
    for (let round = 0; round < 3; round++) {
      for (let seat = 0; seat < 4; seat++) {
        for (let tile = 0; tile < 4; tile++) hands[seat]!.push(tileKey(wall[front++]!));
      }
    }
    for (let seat = 0; seat < 4; seat++) hands[seat]!.push(tileKey(wall[front++]!));
    hands[0]!.push(tileKey(wall[front++]!));

    const dealt = deal("printed-deal");
    assert.deepEqual(
      dealt.hands.map((hand) => hand.map(tileKey)),
      hands,
    );
  });

  it("builds four 18 x 2 walls from the same 144 tiles", () => {
    const { walls } = buildWalls("walls");
    assert.equal(walls.length, WALL_COUNT);
    for (const wall of walls) {
      assert.equal(wall.length, WALL_LENGTH * WALL_HEIGHT);
    }
    assert.equal(WALL_COUNT * WALL_LENGTH * WALL_HEIGHT, WALL_TILES);
    assert.equal(WALL_TILES, 144);
  });

  it("never deals more than four copies of a tile", () => {
    const { hands, wall } = deal("copy-check");
    const keys = [
      ...hands.flat(),
      ...wall.tiles.slice(wall.front, wall.back + 1),
      ...wall.loose,
    ].map(tileKey);
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) assert.ok(count <= 4, key);
  });

  it("builds an unshuffled 144-tile wall", () => {
    assert.equal(buildWall().length, 144);
  });
});
