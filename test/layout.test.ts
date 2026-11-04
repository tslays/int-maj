import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeLayout, HAND_TILE_COUNT } from "../web/layout.js";

type Rect = readonly [x: number, y: number, width: number, height: number];

const SIZES = [
  [1440, 900, "desktop"],
  [1280, 800, "desktop"],
  [1024, 768, "desktop"],
  [932, 430, "phone"],
  [844, 390, "phone"],
  [430, 932, "phone"],
  [390, 844, "phone"],
] as const;

const BREAKPOINTS = {
  desktop: { riverColumns: 6, handBandFraction: 0.12, minTileWidth: 26, maxTileWidth: 46 },
  landscape: { riverColumns: 4, handBandFraction: 0.24, minTileWidth: 18, maxTileWidth: 46 },
  portrait: { riverColumns: 3, handBandFraction: 0.18, minTileWidth: 18, maxTileWidth: 46 },
  phone: { riverColumns: 3, handBandFraction: 0.5, minTileWidth: 26, maxTileWidth: 46 },
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
      const phone = mode === "phone";
      if (phone) {
        assert.ok(result.handTileWidth >= 40, "hand floor");
        const ratio = result.handTileWidth / result.boardTileWidth!;
        assert.ok(ratio >= 1.5 && ratio <= 1.7, `hand ratio ${ratio}`);
        assert.ok(
          result.handWidth > width,
          `${width}: hand row does not overflow (${result.handWidth})`,
        );
        assert.equal(result.handWidth, HAND_TILE_COUNT * result.handTileWidth + 13 * result.handGap);
      } else {
        assert.ok(result.tileWidth >= BREAKPOINTS[mode].minTileWidth);
        assert.ok(result.tileWidth <= BREAKPOINTS[mode].maxTileWidth);
        assert.equal(result.handWidth, HAND_TILE_COUNT * result.tileWidth + 13 * result.gap);
      }

      const regions = phone
        ? [
            result.centre,
            result.rivers.top,
            result.rivers.left,
            result.rivers.right,
            result.rivers.bottom,
            result.seats.top,
            result.seats.left,
            result.seats.right,
          ]
        : [
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
      if (!phone) {
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
      }
    });
  }

  it("uses the independent hand scale and overflows on a phone", () => {
    const result = layout(390, 844, "phone");
    assert.ok(result.handTileWidth! >= 40);
    assert.ok(result.handTileWidth! / result.boardTileWidth! >= 1.5);
    assert.ok(result.handTileWidth! / result.boardTileWidth! <= 1.7);
    assert.ok(result.handWidth > 390);
    assert.equal(result.handTileWidth, 41.6);
  });

  it("states the smallest legal phone width at the 26px board floor", () => {
    const result = layout(390, 600, "phone");
    assert.ok(result.supported);
    assert.ok(result.handWidth > 390);
  });
});