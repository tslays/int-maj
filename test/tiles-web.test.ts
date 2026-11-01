/**
 * The table renders one SVG file per canonical key. These tests walk the
 * mapping, the asset directory and the tile name table without a browser:
 * every key must resolve to a real, non-empty SVG, no key may fall through
 * to the missing-art placeholder, and the back must ship too.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  artFile,
  artUrl,
  BACK_ART,
  BONUS_NAMES,
  BONUS_TILE_KEYS,
  PLAY_TILE_KEYS,
  TILE_ART,
} from "../web/tiles.js";

const TILE_DIR = fileURLToPath(new URL("../web/tiles/", import.meta.url));

const playKeys = PLAY_TILE_KEYS as readonly string[];
const bonusKeys = BONUS_TILE_KEYS as readonly string[];
const allKeys = [...playKeys, ...bonusKeys];

const EXPECTED_PLAY_KEYS = [
  ...Array.from({ length: 9 }, (_, i) => `b${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `c${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `o${i + 1}`),
  "wE",
  "wS",
  "wW",
  "wN",
  "dR",
  "dG",
  "dW",
];

const EXPECTED_BONUS_KEYS = [
  "f1",
  "f2",
  "f3",
  "f4",
  "s1",
  "s2",
  "s3",
  "s4",
];

function readAsset(file: string): string {
  return readFileSync(`${TILE_DIR}${file}`, "utf8");
}

describe("web tile art", () => {
  it("lists the 34 playable keys and the 8 bonus keys", () => {
    assert.deepEqual([...playKeys], EXPECTED_PLAY_KEYS);
    assert.deepEqual([...bonusKeys], EXPECTED_BONUS_KEYS);
    assert.equal(new Set(allKeys).size, 42);
  });

  it("maps every canonical key to a file that exists on disk", () => {
    for (const key of allKeys) {
      const file = artFile(key);
      assert.equal(file, `${key}.svg`, `${key} has no art file`);
      assert.equal(artUrl(key), `/tiles/${key}.svg`, `${key} art URL`);
      assert.ok(statSync(`${TILE_DIR}${file}`).isFile(), `${file} is missing`);
      assert.ok(statSync(`${TILE_DIR}${file}`).size > 0, `${file} is empty`);
    }
  });

  it("never falls through to the missing-art placeholder", () => {
    for (const key of allKeys) {
      assert.notEqual(artUrl(key), null, `${key} would render a placeholder`);
    }
    assert.equal(new Set(allKeys.map((key) => artFile(key))).size, allKeys.length);
  });

  it("ships the tile back named by the table", () => {
    assert.equal(BACK_ART, "back.svg");
    assert.ok(statSync(`${TILE_DIR}${BACK_ART}`).isFile());
  });

  it("has no orphaned SVG files in web/tiles", () => {
    const onDisk = readdirSync(TILE_DIR)
      .filter((name) => name.endsWith(".svg"))
      .sort();
    const mapped = [...allKeys.map((key) => TILE_ART[key]), BACK_ART].sort();
    assert.deepEqual(onDisk, mapped);
  });

  it("keeps every asset a 3:4 SVG with a matching viewBox", () => {
    for (const file of [...allKeys.map((key) => TILE_ART[key]), BACK_ART]) {
      const source = readAsset(file);
      assert.match(source, /<svg\b/, `${file} is not SVG`);
      assert.match(source, /viewBox="0 0 300 400"/, `${file} viewBox`);
      assert.match(source, /width="300"/, `${file} width`);
      assert.match(source, /height="400"/, `${file} height`);
    }
  });

  it("names every bonus mark for its tooltip and caption", () => {
    for (const key of bonusKeys) {
      const name = BONUS_NAMES[key as keyof typeof BONUS_NAMES];
      assert.equal(typeof name, "string");
      assert.ok(name.length > 0, `${key} has no name`);
    }
  });

  it("returns null for keys that are not tiles", () => {
    for (const key of [
      "",
      "x1",
      "b0",
      "b10",
      "c0",
      "o10",
      "wX",
      "dX",
      "f0",
      "f5",
      "s0",
      "s5",
      "B1",
      "back",
    ]) {
      assert.equal(artFile(key), null, `${key} should not have art`);
      assert.equal(artUrl(key), null, `${key} should not have a URL`);
    }
  });
});
