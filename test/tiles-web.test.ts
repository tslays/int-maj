/**
 * The web table's face table is data, so the whole set can be checked without
 * a browser: every canonical key must have a face, no key may fall through to
 * the question-mark placeholder, and each suited rank must carry the printed
 * number of marks.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BONUS_NAMES,
  BONUS_TILE_KEYS,
  FACES_TABLE,
  PLAY_TILE_KEYS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  faceFor,
} from "../web/tiles.js";

interface Dot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

interface Stick {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly red: boolean;
}

interface Face {
  readonly kind: string;
  readonly rank?: number;
  readonly dots?: readonly Dot[];
  readonly sticks?: readonly Stick[];
  readonly bird?: boolean;
  readonly glyph?: string | null;
}

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

/** Validate the boundary once: the face table is plain JS data. */
function readFace(key: string): Face {
  const value: unknown = faceFor(key);
  if (typeof value !== "object" || value === null) {
    throw new Error(`${key} has no face`);
  }
  return value as Face;
}

describe("web tile faces", () => {
  it("lists the 34 playable keys and the 8 bonus keys", () => {
    assert.deepEqual([...playKeys], EXPECTED_PLAY_KEYS);
    assert.deepEqual([...bonusKeys], EXPECTED_BONUS_KEYS);
    assert.equal(new Set(allKeys).size, 42);
  });

  it("maps every canonical key to a face", () => {
    for (const key of allKeys) {
      assert.notEqual(faceFor(key), null, `${key} has no face`);
      assert.equal(
        FACES_TABLE[key],
        faceFor(key),
        `${key} is missing from the exported face table`,
      );
      assert.notEqual(readFace(key).kind, "placeholder", `${key} is a placeholder`);
    }
  });

  it("names every bonus mark for its tooltip and caption", () => {
    for (const key of bonusKeys) {
      const name = BONUS_NAMES[key];
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
    ]) {
      assert.equal(faceFor(key), null, `${key} should not have a face`);
    }
  });

  it("keeps all 42 faces visually distinct", () => {
    const signatures = new Set(
      allKeys.map((key) => JSON.stringify(faceFor(key))),
    );
    assert.equal(signatures.size, allKeys.length);
  });

  it("gives each circle rank its printed number of dots", () => {
    for (let rank = 1; rank <= 9; rank++) {
      const face = readFace(`o${rank}`);
      assert.equal(face.kind, "circles");
      assert.equal(face.rank, rank);
      const dots = face.dots ?? [];
      assert.equal(dots.length, rank, `o${rank} dot count`);
      for (const dot of dots) {
        assert.ok(dot.x - dot.r >= 0, `o${rank} dot leaves the left edge`);
        assert.ok(dot.x + dot.r <= VIEW_WIDTH, `o${rank} dot leaves the right edge`);
        assert.ok(dot.y - dot.r >= 0, `o${rank} dot leaves the top edge`);
        assert.ok(dot.y + dot.r <= VIEW_HEIGHT, `o${rank} dot leaves the bottom edge`);
      }
    }
  });

  it("gives each bamboo rank its printed number of sticks, or the bird", () => {
    for (let rank = 1; rank <= 9; rank++) {
      const face = readFace(`b${rank}`);
      assert.equal(face.kind, "bamboo");
      assert.equal(face.rank, rank);
      if (rank === 1) {
        assert.equal(face.bird, true, "b1 is the bird");
        assert.equal((face.sticks ?? []).length, 0);
        continue;
      }
      assert.equal(face.bird, false);
      const sticks = face.sticks ?? [];
      assert.equal(sticks.length, rank, `b${rank} stick count`);
      for (const stick of sticks) {
        assert.ok(stick.x - 1.7 >= 0, `b${rank} stick leaves the left edge`);
        assert.ok(stick.x + 1.7 <= VIEW_WIDTH, `b${rank} stick leaves the right edge`);
        assert.ok(stick.y >= 0, `b${rank} stick leaves the top edge`);
        assert.ok(stick.y + stick.h <= VIEW_HEIGHT, `b${rank} stick leaves the bottom edge`);
      }
    }
    const five = readFace("b5");
    assert.equal(
      (five.sticks ?? []).filter((stick) => stick.red).length,
      1,
      "b5 prints one red stick",
    );
  });

  it("uses the traditional glyphs for winds and dragons", () => {
    const glyphs = {
      wE: "東",
      wS: "南",
      wW: "西",
      wN: "北",
      dR: "中",
      dG: "發",
    };
    for (const [key, glyph] of Object.entries(glyphs)) {
      assert.equal(readFace(key).glyph, glyph);
    }
    assert.equal(readFace("dW").glyph, null);
  });
});
