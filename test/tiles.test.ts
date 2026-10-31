import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLAY_TILE_KEYS,
  createTileSet,
  formatTile,
  isBonus,
  isHonour,
  isSuited,
  parseTile,
  parseTiles,
  tileKey,
} from "../src/core/tiles.ts";

describe("tile model", () => {
  it("builds the assumed 144-tile set", () => {
    const set = createTileSet();
    assert.equal(set.length, 144);
    for (const key of PLAY_TILE_KEYS) {
      assert.equal(set.filter((tile) => tileKey(tile) === key).length, 4, key);
    }
    assert.equal(set.filter((tile) => tile.kind === "flower").length, 4);
    assert.equal(set.filter((tile) => tile.kind === "season").length, 4);
  });

  it("round-trips canonical keys", () => {
    for (const key of [...PLAY_TILE_KEYS, "f1", "f4", "s1", "s4"]) {
      assert.equal(tileKey(parseTile(key)), key);
    }
  });

  it("classifies tiles", () => {
    assert.equal(isSuited(parseTile("b5")), true);
    assert.equal(isHonour(parseTile("wE")), true);
    assert.equal(isHonour(parseTile("dG")), true);
    assert.equal(isBonus(parseTile("f3")), true);
    assert.equal(isBonus(parseTile("s2")), true);
    assert.equal(isBonus(parseTile("b1")), false);
  });

  it("formats tiles for diagnostics", () => {
    assert.equal(formatTile(parseTile("b1")), "1 bamboo");
    assert.equal(formatTile(parseTile("wS")), "South wind");
    assert.equal(formatTile(parseTile("dR")), "Red dragon");
    assert.equal(formatTile(parseTile("f2")), "flower 2");
  });

  it("rejects malformed keys", () => {
    assert.throws(() => parseTile("z9"), /Bad tile key/);
    assert.throws(() => parseTiles("b1 b10"), /Bad tile key/);
  });
});
