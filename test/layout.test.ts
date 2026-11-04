import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeLayout, HAND_TILE_COUNT } from "../web/layout.js";

type Rect = readonly [x: number, y: number, width: number, height: number];

const SIZES = [
  [1440, 900, "desktop"],
  [1280, 800, "desktop"],
  [1024, 768, "desktop"],
  [932, 430, "landscape"],
  [844, 390, "landscape"],
  [430, 932, "portrait"],
  [390, 844, "portrait"],
] as const;

const BREAKPOINTS = {
  desktop: { riverColumns: 6, handBandFraction: 0.12, minTileWidth: 26, maxTileWidth: 46 },
  landscape: { riverColumns: 4, handBandFraction: 0.24, minTileWidth: 18, maxTileWidth: 46 },
  portrait: { riverColumns: 3, handBandFraction: 0.18, minTileWidth: 18, maxTileWidth: 46 },
} as const;

function layout(width: number, height: number, mode: keyof typeof BREAKPOINTS) {
  return computeLayout({ width, height, mode, ...BREAKPOINTS[mode] });
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 1 &&
    Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 1
  );
}

function assertInside(rect: Rect, board: Rect): void {
  assert.ok(rect[0] >= board[0] - 1, "left outside");
  assert.ok(rect[1] >= board[1] - 1, "top outside");
  assert.ok(rect[0] + rect[2] <= board[0] + board[2] + 1, "right outside");
  assert.ok(rect[1] + rect[3] <= board[1] + board[3] + 1, "bottom outside");
}

describe("computeLayout", () => {
  for (const [width, height, mode] of SIZES) {
    it(`${width}x${height} computes one consistent board`, () => {
      const result = layout(width, height, mode);
      assert.ok(result.tileWidth >= BREAKPOINTS[mode].minTileWidth);
      assert.ok(result.tileWidth <= BREAKPOINTS[mode].maxTileWidth);
      assert.equal(result.handWidth, HAND_TILE_COUNT * result.tileWidth + 13 * result.gap);

      const regions = [
        result.handBand,
        result.centre,
        result.rivers.top,
        result.rivers.left,
        result.rivers.right,
        result.rivers.bottom,
        result.seats.top,
        result.seats.left,
        result.seats.right,
        result.controls,
      ];
      for (const rect of regions) {
        assertInside(rect, result.board);
      }
      for (let i = 0; i < regions.length; i++) {
        for (let j = i + 1; j < regions.length; j++) {
          assert.equal(
            overlaps(regions[i]!, regions[j]!),
            false,
            `${width}x${height}: region ${i} overlaps ${j}`,
          );
        }
      }

      // Badge gap and centring are the same formula for all four seats.
      const seatRects = [
        result.seats.top,
        result.seats.left,
        result.seats.right,
        result.hand,
      ];
      for (const [index, seat] of seatRects.entries()) {
        const key = ["top", "left", "right", "self"][index] as keyof typeof result.badges;
        const badge = result.badges[key];
        const gap =
          seat[0] >= badge[0] + badge[2]
            ? seat[0] - (badge[0] + badge[2])
            : badge[0] - (seat[0] + seat[2]);
        const offset = Math.abs(
          badge[1] + badge[3] / 2 - (seat[1] + seat[3] / 2),
        );
        assert.ok(Math.abs(gap - result.gap) <= 0.51, `${key} gap`);
        assert.ok(offset <= 0.51, `${key} centre`);
      }
    });
  }

  it("shrinks the gap before dropping below a legal phone tile", () => {
    const result = layout(390, 844, "portrait");
    assert.ok(result.tileWidth >= 18);
    assert.equal(result.gap, 1);
    assert.ok(
      result.handWidth + 2 * (result.badges.self[2] + result.gap) <= 390,
    );
  });

  it("states the smallest legal portrait viewport from the same formula", () => {
    // 14 x 18px tiles plus the four badges need 340px; one more pixel of
    // height keeps the mode portrait. Anything narrower drops below 18px.
    const result = layout(340, 341, "portrait");
    assert.ok(result.tileWidth >= 18);
    assert.equal(result.gap, 1);
  });
});
