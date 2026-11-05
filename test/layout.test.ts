import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeLayout, HAND_OVERLAP, HAND_TILE_COUNT } from "../web/layout.js";

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
        // The row spans the screen with its tiles overlapping: fourteen
        // fronts, thirteen overlaps.
        assert.ok(
          Math.abs(result.handWidth - width) <= 1,
          `${width}: hand row spans the screen (${result.handWidth})`,
        );
        assert.equal(result.handGap, 0);
        assert.ok(
          Math.abs(
            result.handTileWidth -
              (width + (HAND_TILE_COUNT - 1) * result.handOverlap) / HAND_TILE_COUNT,
          ) <= 1,
          `${width}: hand tile covers its share plus the overlap`,
        );
        assert.ok(
          result.handWidth <= width + 0.5,
          `${width}: hand row fits (${result.handWidth})`,
        );
        assert.equal(result.handTileCount, 14);
        assert.equal(result.drawnTileIndex, 13);
      } else {
        assert.ok(result.tileWidth >= BREAKPOINTS[mode].minTileWidth);
        assert.ok(result.tileWidth <= BREAKPOINTS[mode].maxTileWidth);
        assert.ok(
          Math.abs(result.handWidth - (
            HAND_TILE_COUNT * result.tileWidth + 13 * result.gap
          )) <= 1,
          `${width}: the hand keeps its edge-to-edge footprint`,
        );
      }

      const capacity = result.riverColumns * result.riverRows;
      assert.deepEqual(
        [result.riverColumns, result.riverRows],
        mode === "phone"
          ? width > height
            ? [5, 5]
            : [4, 6]
          : [6, 4],
      );
      for (const [place, side] of [["top", false], ["bottom", false], ["left", true], ["right", true]] as const) {
        const region = result.rivers[place as keyof typeof result.rivers];
        const tileW = side ? result.riverSideTileWidth : result.riverFlatTileWidth;
        const tileH = side ? result.riverSideTileHeight : result.riverFlatTileHeight;
        assert.ok(
          tileW <= region[2] / result.riverColumns + 0.01,
          `${width}: ${place} tile exceeds regionWidth/columns`,
        );
        assert.ok(
          tileW <= region[3] / result.riverRows + 0.01,
          `${width}: ${place} tile exceeds regionHeight/rows`,
        );
        assert.ok(
          Math.abs(tileH / tileW - 4 / 3) <= 0.001,
          `${width}: ${place} river tile is not 3:4`,
        );
        const usedWidth = side
          ? result.riverColumns * tileH + (result.riverColumns - 1) * result.riverGap
          : result.riverColumns * tileW + (result.riverColumns - 1) * result.riverGap;
        const usedHeight = side
          ? result.riverRows * tileW + (result.riverRows - 1) * result.riverGap
          : result.riverRows * tileH + (result.riverRows - 1) * result.riverGap;
        assert.ok(usedWidth <= region[2] + 0.01, `${width}: ${place} river too wide`);
        assert.ok(usedHeight <= region[3] + 0.01, `${width}: ${place} river too tall`);
        assert.ok(capacity >= 18, `${width}: river capacity`);
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

  it("fits fourteen overlapping tiles across the screen on a phone", () => {
    const portrait = layout(390, 844, "phone");
    assert.ok(Math.abs(portrait.handTileWidth - 390 / (
      HAND_TILE_COUNT - (HAND_TILE_COUNT - 1) * HAND_OVERLAP
    )) <= 0.5);
    assert.equal(portrait.handGap, 0);
    assert.ok(Math.abs(portrait.handWidth - 390) <= 1);
    assert.ok(portrait.boardTileWidth! >= 26);

    const landscape = layout(844, 390, "phone");
    assert.equal(landscape.handGap, 0);
    assert.ok(Math.abs(landscape.handWidth - 844) <= 1);
    assert.ok(portrait.handOverlap > 0 && landscape.handOverlap > 0);
  });

  it("states the smallest supported phone width", () => {
    const result = layout(390, 600, "phone");
    assert.ok(result.supported);
    assert.ok(result.handWidth <= 390 + 0.5);
  });
});