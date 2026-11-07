/**
 * The 3D table's discard pinwheel: however long the hand runs, no two
 * discards overlap, every discard stays inside the walls, and none covers the
 * centre console. `app/src/layout.js` is plain numbers, so this needs no
 * browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { discardRect, discardSlot, TABLE, WALL_INNER, W, H } from "../../app/src/layout.js";

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const EPSILON = 1e-6;
// A whole hand rarely gives a seat more than about 23 discards; the corner
// row has room for 29 before it would reach the wall.
const MOST = 29;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.minX < b.maxX - EPSILON &&
    b.minX < a.maxX - EPSILON &&
    a.minZ < b.maxZ - EPSILON &&
    b.minZ < a.maxZ - EPSILON
  );
}

const all: { rel: number; index: number; rect: Rect }[] = [];
for (let rel = 0; rel < 4; rel++) {
  for (let index = 0; index < MOST; index++) all.push({ rel, index, rect: discardRect(rel, index) });
}

describe("3D table discard layout", () => {
  it("never overlaps two discards, within a seat or between seats", () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        assert.equal(
          overlaps(all[i]!.rect, all[j]!.rect),
          false,
          `seat ${all[i]!.rel} discard ${all[i]!.index + 1} overlaps seat ${all[j]!.rel} discard ${all[j]!.index + 1}`,
        );
      }
    }
  });

  it("keeps every discard inside the walls and off the console", () => {
    const console: Rect = {
      minX: -TABLE.CENTER_HALF,
      maxX: TABLE.CENTER_HALF,
      minZ: -TABLE.CENTER_HALF,
      maxZ: TABLE.CENTER_HALF,
    };
    for (const { rel, index, rect } of all) {
      const label = `seat ${rel} discard ${index + 1}`;
      assert.ok(Math.max(Math.abs(rect.minX), Math.abs(rect.maxX)) <= WALL_INNER, `${label} reaches the wall`);
      assert.ok(Math.max(Math.abs(rect.minZ), Math.abs(rect.maxZ)) <= WALL_INNER, `${label} reaches the wall`);
      assert.equal(overlaps(rect, console), false, `${label} covers the console`);
    }
  });

  it("fills three rows of six, then runs the fourth row on to the right", () => {
    const first = discardSlot(0);
    const sixth = discardSlot(5);
    const seventh = discardSlot(6);
    assert.ok(sixth.x > first.x && Math.abs(sixth.z - first.z) < EPSILON, "a row runs left to right");
    assert.ok(seventh.z > first.z && Math.abs(seventh.x - first.x) < EPSILON, "the next row starts below");
    const nineteenth = discardSlot(18);
    const twentyFifth = discardSlot(24);
    assert.ok(Math.abs(twentyFifth.z - nineteenth.z) < EPSILON, "the fourth row stays one row");
    assert.ok(twentyFifth.x > discardSlot(17).x, "and continues past the sixth column");
  });

  it("keeps the walls clear of each other and of the opponents' hands", () => {
    assert.ok(TABLE.WALL_R >= TABLE.WALL_STACKS / 2 + H / 2, "pinwheel walls touch at the corners");
    assert.ok(TABLE.HAND_Z - D_HALF > TABLE.WALL_R + H / 2, "a hand stands on its wall");
    assert.ok(TABLE.HAND_Z + 0.2 + (H / 2) < TABLE.TABLE_HALF, "a meld hangs over the rail");
    assert.ok(W > 0);
  });
});

const D_HALF = 0.39;
