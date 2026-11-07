import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeLayout,
  DISCARD_CAPACITY,
  discardGap,
  wallBackSize,
  wallCells,
  WALL_CAPACITY,
  discardTileSize,
  nextFreeCell,
  HAND_OVERLAP,
  HAND_TILE_COUNT,
} from "../web/layout.js";

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
  landscape: { riverColumns: 4, handBandFraction: 0.15, minTileWidth: 18, maxTileWidth: 46 },
  portrait: { riverColumns: 3, handBandFraction: 0.14, minTileWidth: 18, maxTileWidth: 46 },
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
          Math.abs(result.handWidth - (width - 2 * result.inset)) <= 1,
          `${width}: hand row spans the board inside the rim (${result.handWidth})`,
        );
        assert.equal(result.handGap, 0);
        assert.ok(
          Math.abs(
            result.handTileWidth -
              (width - 2 * result.inset + (HAND_TILE_COUNT - 1) * result.handOverlap) /
                HAND_TILE_COUNT,
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

    });
  }

  it("draws discards as a grid that holds the whole hand", () => {
    for (const [width, height, mode] of SIZES) {
      const result = layout(width, height, mode);
      const cap = result.handTileWidth ?? result.tileWidth;
      const tile = result.discardTileWidth;
      const label = `${width}x${height}`;
      assert.equal(
        tile,
        discardTileSize(result.pile, DISCARD_CAPACITY, cap),
        `${label}: discard size`,
      );
      assert.ok(
        tile <= cap + 0.5,
        `${label}: a discard is larger than the hand tile (${tile} > ${cap})`,
      );
      assert.ok(tile >= 18, `${label}: discard below the 18px floor (${tile})`);
      // The grid is exact: a whole hand's throws each own a cell, the block
      // sits inside the pile, and the cells never touch.
      const gap = discardGap(tile);
      const rowHeight = Math.round((tile * 4) / 3);
      const columns = Math.floor((result.pile[2] + gap) / (tile + gap));
      const rows = Math.floor((result.pile[3] + gap) / (rowHeight + gap));
      assert.ok(
        columns * rows >= DISCARD_CAPACITY,
        `${label}: the grid holds ${columns * rows} of 84 throws`,
      );
      assert.ok(
        columns * tile + (columns - 1) * gap <= result.pile[2] + 0.5,
        `${label}: the grid is wider than the pile`,
      );
      assert.ok(
        rows * rowHeight + (rows - 1) * gap <= result.pile[3] + 0.5,
        `${label}: the grid is taller than the pile`,
      );
    }
  });

  it("fills a claimed cell before the grid grows", () => {
    assert.equal(nextFreeCell(new Set(), 96), 0, "an empty heap starts at its middle");
    assert.equal(nextFreeCell(new Set([0, 1, 2]), 96), 3, "a full run grows outward");
    assert.equal(
      nextFreeCell(new Set([0, 1, 3, 4, 5]), 96),
      2,
      "the claimed cell in the middle is taken before any new one",
    );
    assert.equal(nextFreeCell(new Set([0, 2]), 96), 1, "the innermost gap wins");
    assert.equal(nextFreeCell(new Set([0, 1]), 2), 2, "a full grid offers no cell");
  });

  it("frames the pile with a wall that holds the whole live wall", () => {
    for (const [width, height, mode] of SIZES) {
      const result = layout(width, height, mode);
      const label = `${width}x${height}`;
      const ring = wallCells(result.wall, result.wallBackWidth, result.wallGap);
      assert.ok(
        ring.length >= WALL_CAPACITY,
        `${label}: the ring holds ${ring.length} of ${WALL_CAPACITY}`,
      );
      assert.equal(
        result.wallBackWidth,
        wallBackSize(result.wall, result.wallBackWidth),
        `${label}: the wall's back is not the largest that fits`,
      );
      // The wall is a frame around the pile, and the pile sits inside it.
      assert.ok(
        result.pile[0] > result.wall[0] && result.pile[1] > result.wall[1],
        `${label}: the pile does not sit inside the wall`,
      );
      assert.ok(
        result.pile[0] + result.pile[2] < result.wall[0] + result.wall[2] &&
          result.pile[1] + result.pile[3] < result.wall[1] + result.wall[3],
        `${label}: the pile spills out of the wall`,
      );
      // Every cell is inside the frame.
      for (const cell of ring) {
        assert.ok(
          cell.x >= -0.5 &&
            cell.y >= -0.5 &&
            cell.x + result.wallBackWidth <= result.wall[2] + 0.5 &&
            cell.y + result.wallBackHeight <= result.wall[3] + 0.5,
          `${label}: a wall back sits outside the frame (${cell.x},${cell.y})`,
        );
      }
    }
  });

  it("fits fourteen overlapping tiles across the screen on a phone", () => {
    const portrait = layout(390, 844, "phone");
    assert.ok(Math.abs(portrait.handTileWidth - (390 - 2 * portrait.inset) / (
      HAND_TILE_COUNT - (HAND_TILE_COUNT - 1) * HAND_OVERLAP
    )) <= 0.5);
    assert.equal(portrait.handGap, 0);
    assert.ok(Math.abs(portrait.handWidth - (390 - 2 * portrait.inset)) <= 1);
    assert.ok(portrait.boardTileWidth! >= 26);

    const landscape = layout(844, 390, "phone");
    assert.equal(landscape.handGap, 0);
    assert.ok(Math.abs(landscape.handWidth - (844 - 2 * landscape.inset)) <= 1);
    assert.ok(portrait.handOverlap > 0 && landscape.handOverlap > 0);
  });

  it("states the smallest supported phone width", () => {
    const result = layout(390, 600, "phone");
    assert.ok(result.supported);
    assert.ok(result.handWidth <= 390 - 2 * result.inset + 0.5);
  });
});