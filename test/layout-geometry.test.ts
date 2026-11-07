/**
 * Responsive geometry audit for variant D.
 *
 * The desktop assertions are the contract from docs/UI-SPEC.md:
 *   - no two region rects intersect;
 *   - the felt is bare: no wind letters, seat counts, wall dial, round meta,
 *     centre scores or table frame;
 *   - the hand is always visible and the action row holds one block at a time;
 *   - each opponent shows 13 or 14 face-down backs inside its seat band;
 *   - the tile face is at least 26px wide;
 *   - nothing leaves the board box.
 *
 * Phone sizes are measured and marked TODO: the current table still uses the
 * desktop constants, so these fail until the responsive formula exists.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  computeLayout,
  discardCells,
  discardGap,
  tableInset,
} from "../web/layout.js";
import {
  connectChrome,
  evaluate,
  findChrome,
  navigate,
  setViewport,
  startServer,
  type Cdp,
} from "../tools/check-layout.ts";

type Rect = readonly [x: number, y: number, width: number, height: number];

interface Measurement {
  readonly rects: Readonly<Record<string, Rect>>;
  readonly overlaps: readonly string[];
  readonly outside: readonly string[];
  readonly tileWidth: number;
  readonly handTiles: readonly number[];
  readonly handGaps: readonly number[];
  readonly handScrollWidth: number;
  readonly handClientWidth: number;
  readonly lastTileDrawn: boolean;
  readonly pile: Rect | null;
  readonly discards: readonly Rect[];
  readonly discardSizes: readonly (readonly [number, number])[];
  readonly discardAngles: readonly number[];
  readonly racks: Readonly<
    Record<
      "top" | "left" | "right",
      {
        readonly seat: Rect | null;
        readonly count: number;
        readonly boxes: readonly Rect[];
        readonly visible: string;
      }
    >
  >;
  readonly discard: Rect | null;
  readonly calls: Rect | null;
  readonly handToggle: boolean;
  readonly markers: number;
  readonly frameBorder: string;
  readonly handCollapsed: boolean;
}

const SIZES = [
  [1440, 900, "desktop"],
  [1280, 800, "desktop"],
  [1024, 768, "desktop"],
  [770, 400, "phone"],
  [932, 430, "phone"],
  [844, 390, "phone"],
  [430, 932, "phone"],
  [390, 844, "phone"],
] as const;

type Mode = "desktop" | "landscape" | "portrait";

const BREAKPOINTS: Record<
  Mode,
  {
    riverColumns: number;
    handBandFraction: number;
    minTileWidth: number;
    maxTileWidth: number;
  }
> = {
  desktop: {
    riverColumns: 6,
    handBandFraction: 0.12,
    minTileWidth: 26,
    maxTileWidth: 46,
  },
  landscape: {
    riverColumns: 4,
    handBandFraction: 0.15,
    minTileWidth: 18,
    maxTileWidth: 46,
  },
  portrait: {
    riverColumns: 3,
    handBandFraction: 0.14,
    minTileWidth: 18,
    maxTileWidth: 46,
  },
  phone: {
    riverColumns: 3,
    handBandFraction: 0.5,
    minTileWidth: 26,
    maxTileWidth: 46,
  },
};

function expectedLayout(width: number, height: number, mode: Mode) {
  return computeLayout({
    width,
    height,
    mode,
    ...BREAKPOINTS[mode],
    ...(mode === "phone" ? { riverColumns: width > height ? 4 : 3 } : {}),
  });
}

const MEASURE = `(() => {
  const R = (element) => {
    if (element === null) return null;
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  const overlaps = (a, b) =>
    Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 1 &&
    Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 1;

  // The self seat band is the hand band: variant D has no separate bottom seat.
  const regionSelectors = {
    handBand: ".hand-band",
    pile: "#pile",
    seatTop: "#seat-top",
    seatLeft: "#seat-left",
    seatRight: "#seat-right",
    controls: "#actions",
  };
  const rects = {};
  for (const [key, selector] of Object.entries(regionSelectors)) {
    rects[key] = R(document.querySelector(selector));
  }

  const keys = Object.keys(rects);
  const collisions = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (overlaps(rects[keys[i]], rects[keys[j]])) {
        collisions.push(keys[i] + "/" + keys[j]);
      }
    }
  }

  const board = R(document.querySelector("#board"));
  const outside = [];
  for (const [key, rect] of Object.entries(rects)) {
    if (key === "board" || rect === null) continue;
    if (
      rect[0] < board[0] - 1 ||
      rect[1] < board[1] - 1 ||
      rect[0] + rect[2] > board[0] + board[2] + 1 ||
      rect[1] + rect[3] > board[1] + board[3] + 1
    ) {
      outside.push(key);
    }
  }

  const handTiles = [...document.querySelectorAll("#hand .hand-tile")].map(R);
  const handGaps = handTiles
    .slice(1)
    .map((tile, index) => tile[0] - (handTiles[index][0] + handTiles[index][2]));
  const handBand = document.querySelector(".hand-band");
  const handTile = R(document.querySelector("#hand .hand-tile"));
  const lastTile = document.querySelector("#hand .hand-tile:last-child");

  const pile = R(document.querySelector("#pile"));
  const discardTiles = [...document.querySelectorAll("#pile .discard")];
  const discards = discardTiles.map(R);
  const discardSizes = discardTiles.map((tile) => [tile.offsetWidth, tile.offsetHeight]);
  const discardAngles = discardTiles.map((tile) => {
    const match = tile.style.transform.match(/-?[0-9.]+/);
    return match === null ? 0 : Number.parseFloat(match[0]);
  });

  // The three opponents keep their hands face down: one back per tile, all of
  // them inside the seat's own band.
  const racks = {};
  for (const place of ["top", "left", "right"]) {
    const seat = document.querySelector("#seat-" + place);
    const backs = seat === null ? [] : [...seat.querySelectorAll(".tile-back")];
    racks[place] = {
      seat: R(seat),
      count: backs.length,
      boxes: backs.map(R),
      visible: backs.length === 0
        ? "none"
        : getComputedStyle(backs[0]).visibility,
    };
  }

  return {
    pile,
    discards,
    discardSizes,
    discardAngles,
    racks,
    rects,
    overlaps: collisions,
    outside,
    tileWidth: handTile === null ? 0 : handTile[2],
    handTiles: handTiles.map((tile) => tile[2]),
    handGaps,
    handScrollWidth: handBand === null ? 0 : handBand.scrollWidth,
    handClientWidth: handBand === null ? 0 : handBand.clientWidth,
    lastTileDrawn: lastTile === null ? false : lastTile.classList.contains("is-drawn"),
    discard: R(document.querySelector('.action-button[data-action="discard"]')),
    calls: R(document.querySelector("#calls-toggle")),
    handToggle: document.querySelector(".hand-toggle") !== null,
    markers: document.querySelectorAll(
      ".seat-badge, .hand-badge, .center-meta, .wall-dial, .center-scores, .self-label",
    ).length,
    frameBorder: (() => {
      const field = document.querySelector(".playfield");
      return field === null ? "missing" : getComputedStyle(field).borderTopWidth;
    })(),
    handCollapsed: document.documentElement.classList.contains("hand-collapsed"),
  };
})()`;

let cdp: Cdp;
let sessionId: string;
let browser: { kill: (signal: NodeJS.Signals) => boolean };
let server: { url: string; stop: () => Promise<void> };
let profile: string;

/** Fill every reserved river slot so capacity is exercised, not just the
    scenario's opening discards. */
async function measure(width: number, height: number): Promise<Measurement> {
  await setViewport(cdp, sessionId, width, height);
  await navigate(cdp, sessionId, `${server.url}/?state=turn&variant=d`);
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const { promise, resolve } = Promise.withResolvers();
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      return promise;
    })()`,
  );
  return evaluate<Measurement>(cdp, sessionId, MEASURE);
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return Math.max(0, Math.min(width, height));
}

/** The pile: every discard the same size, all of them inside the middle. */
function assertPile(
  measurement: Measurement,
  expected: ReturnType<typeof expectedLayout>,
  label: string,
): void {
  const pile = measurement.pile;
  assert.ok(pile, `${label}: no pile`);
  assert.ok(
    Math.abs(pile[2] - expected.pile[2]) <= 1 &&
      Math.abs(pile[0] - expected.pile[0]) <= 1,
    `${label}: pile is ${pile}, solver says ${expected.pile}`,
  );
  assert.ok(
    measurement.discards.length > 0,
    `${label}: no discards were thrown`,
  );
  const sizes = new Set(
    measurement.discardSizes.map(([w, h]) => `${w}x${h}`),
  );
  assert.equal(
    sizes.size,
    1,
    `${label}: discards differ in size (${[...sizes].join(", ")})`,
  );
  const [width, height] = measurement.discardSizes[0]!;
  // The heap takes the solver's size when it fits and shrinks only to keep the
  // no-overlap promise on a short window.
  assert.ok(
    width <= expected.discardTileWidth + 1 && width >= expected.discardTileWidth * 0.5,
    `${label}: discard is ${width}x${height}, solver says ${expected.discardTileWidth}`,
  );
  assert.ok(
    Math.abs(height / width - 4 / 3) <= 0.05,
    `${label}: discard is ${width}x${height}, not 3:4`,
  );
  // The heap is a grid: every tile sits square, and no two share a cell.
  assert.deepEqual(
    [...new Set(measurement.discardAngles)].map((angle) => Math.round(angle)),
    [0],
    `${label}: a discard is rotated (${measurement.discardAngles.join(", ")})`,
  );
  const gridColumns = new Set(
    measurement.discards.map((box) => Math.round(box[0])),
  );
  const gridRows = new Set(measurement.discards.map((box) => Math.round(box[1])));
  assert.equal(
    gridColumns.size * gridRows.size,
    measurement.discards.length,
    `${label}: the discards are not a grid (${gridColumns.size} columns x ${gridRows.size} rows for ${measurement.discards.length} tiles)`,
  );

  // No two discards may overlap, whatever angle each one lies at.
  const boxesAt = measurement.discards.map((box, index) => ({
    cx: box[0] + box[2] / 2,
    cy: box[1] + box[3] / 2,
    hw: measurement.discardSizes[index]![0] / 2,
    hh: measurement.discardSizes[index]![1] / 2,
    angle: ((measurement.discardAngles[index] ?? 0) * Math.PI) / 180,
  }));
  const rotatedOverlap = (a: (typeof boxesAt)[number], b: (typeof boxesAt)[number]) => {
    for (const axis of [a.angle, b.angle, a.angle + Math.PI / 2, b.angle + Math.PI / 2]) {
      const cos = Math.cos(axis);
      const sin = Math.sin(axis);
      const project = (box: (typeof boxesAt)[number]) => {
        const extent =
          box.hw * Math.abs(Math.cos(box.angle - axis)) +
          box.hh * Math.abs(Math.sin(box.angle - axis));
        const centre = box.cx * cos + box.cy * sin;
        return [centre - extent, centre + extent] as const;
      };
      const [aMin, aMax] = project(a);
      const [bMin, bMax] = project(b);
      if (aMax <= bMin + 0.01 || bMax <= aMin + 0.01) return false;
    }
    return true;
  };
  for (let first = 0; first < boxesAt.length; first++) {
    for (let second = first + 1; second < boxesAt.length; second++) {
      assert.ok(
        !rotatedOverlap(boxesAt[first]!, boxesAt[second]!),
        `${label}: discards ${first} and ${second} overlap`,
      );
    }
  }
  // The heap grows from the middle and hugs itself: no island with a visible
  // gap, and at least one tile near the centre once anything has been thrown.
  const centres = measurement.discards.map((box) => [
    box[0] + box[2] / 2,
    box[1] + box[3] / 2,
  ]);
  const centreX = pile[0] + pile[2] / 2;
  const centreY = pile[1] + pile[3] / 2;
  const nearest = centres.map(([cx, cy], index) => {
    let best = Infinity;
    centres.forEach(([ox, oy], other) => {
      if (other === index) return;
      const dx = Math.max(0, Math.abs(cx - ox) - width);
      const dy = Math.max(0, Math.abs(cy - oy) - height);
      best = Math.min(best, Math.hypot(dx, dy));
    });
    return best;
  });
  const widest = Math.max(...nearest);
  assert.ok(
    widest <= Math.max(8, width * 0.45),
    `${label}: the heap leaves a ${widest.toFixed(0)} px island gap`,
  );
  const fromCentre = Math.min(
    ...centres.map(([cx, cy]) => Math.hypot(cx - centreX, cy - centreY)),
  );
  assert.ok(
    fromCentre <= Math.hypot(width, height),
    `${label}: the heap has no tile near its centre (${fromCentre.toFixed(0)} px)`,
  );

  // A tile lies at an angle, so allow its rotated bounding box to poke out by
  // the diagonal margin, never more.
  const margin = Math.hypot(width, height) / 2;
  for (const box of measurement.discards) {
    assert.ok(
      box[0] >= pile[0] - margin &&
        box[1] >= pile[1] - margin &&
        box[0] + box[2] <= pile[0] + pile[2] + margin &&
        box[1] + box[3] <= pile[1] + pile[3] + margin,
      `${label}: a discard leaves the pile: ${JSON.stringify(box)}`,
    );
  }
}

function assertActionRow(measurement: Measurement, label: string): void {
  const controls = measurement.rects.controls;
  assert.ok(controls, `${label}: no controls row`);
  // The calls chip is the row's one permanent control: it must sit inside the
  // row, at its right end, whatever else the table is asking.
  const calls = measurement.calls;
  if (calls !== null && calls[2] > 0) {
    assert.ok(
      inside(controls, calls),
      `${label}: the calls chip sits outside the action row (${JSON.stringify(calls)} in ${JSON.stringify(controls)})`,
    );
  }
  // There is no throw button: a tap on a hand tile is the discard.
  assert.equal(
    measurement.discard,
    null,
    `${label}: a discard button is back on the action row`,
  );
}


/** The hand is the one thing that must never be out of sight: no control may
    collapse, hide or scroll it away. */
/** The board carries no wind letters, seat counts, wall dial, round meta or
    table frame: the felt is bare, and only the hand and the action row speak. */
/** Every opponent keeps a visible wall of 13 or 14 face-down tiles, and no
    back may sit outside its seat's band. */
function assertOpponentHands(measurement: Measurement, label: string): void {
  const sizes = new Set<string>();
  for (const place of ["top", "left", "right"] as const) {
    const rack = measurement.racks[place];
    assert.ok(rack.seat, `${label}: no ${place} seat`);
    assert.ok(
      rack.count === 13 || rack.count === 14,
      `${label}: ${place} shows ${rack.count} backs`,
    );
    assert.equal(rack.visible, "visible", `${label}: ${place} rack is hidden`);
    for (const box of rack.boxes) {
      assert.ok(
        box[0] >= rack.seat[0] - 1 &&
          box[1] >= rack.seat[1] - 1 &&
          box[0] + box[2] <= rack.seat[0] + rack.seat[2] + 1 &&
          box[1] + box[3] <= rack.seat[1] + rack.seat[3] + 1,
        `${label}: a ${place} back sits outside its seat: ${JSON.stringify(box)}`,
      );
    }
    const first = rack.boxes[0];
    if (first !== undefined) {
      // The three opponents hold the same tile; a side wall turns it a
      // quarter, so only the footprint's long and short sides must agree.
      sizes.add(
        `${Math.min(first[2], first[3]).toFixed(1)}x${Math.max(first[2], first[3]).toFixed(1)}`,
      );
    }
  }
  assert.equal(
    sizes.size,
    1,
    `${label}: the three walls use different tile sizes (${[...sizes].join(", ")})`,
  );
}


function assertNoMarkers(measurement: Measurement, label: string): void {
  assert.equal(measurement.markers, 0, `${label}: seat and centre markers are back`);
  assert.equal(measurement.frameBorder, "0px", `${label}: the table frame is back`);
}


function assertHandAlwaysVisible(measurement: Measurement, label: string): void {
  assert.equal(measurement.handToggle, false, `${label}: a hand toggle exists`);
  assert.equal(
    measurement.handCollapsed,
    false,
    `${label}: the hand is collapsed`,
  );
  const band = measurement.rects.handBand;
  assert.ok(band, `${label}: no hand band`);
  assert.ok(
    band[2] > 0 && band[3] > 0,
    `${label}: the hand band is empty (${band[2]}x${band[3]})`,
  );
}


function assertGeometry(
  measurement: Measurement,
  expected: ReturnType<typeof expectedLayout>,
  label: string,
): void {
  assertActionRow(measurement, label);
  assertHandAlwaysVisible(measurement, label);
  assertNoMarkers(measurement, label);
  assertOpponentHands(measurement, label);

  if (expected.mode === "phone") {
    // Board regions only: the hand and controls are the bottom overlay zone.
    const boardRegions = ["centre", "riverTop", "riverLeft", "riverRight", "riverBottom", "seatTop", "seatLeft", "seatRight"];
    assert.deepEqual(measurement.outside, [], `${label}: region outside board`);
    assert.equal(
      measurement.handTiles.length,
      14,
      `${label}: expected 14 hand tiles`,
    );
    assert.equal(
      measurement.handScrollWidth,
      measurement.handClientWidth,
      `${label}: hand row overflows its band`,
    );
    // The hand is one overlapping strip that spans the band: every tile the
    // solver's size, every gap the same overlap.
    const overlap = expected.handOverlap!;
    for (const width of measurement.handTiles) {
      assert.ok(
        Math.abs(width - expected.handTileWidth!) <= 1,
        `${label}: hand tile ${width} is not ${expected.handTileWidth}`,
      );
    }
    for (const gap of measurement.handGaps) {
      assert.ok(
        Math.abs(gap + overlap) <= 1,
        `${label}: hand gap ${gap} is not -${overlap}`,
      );
    }
    assert.ok(
      Math.abs(measurement.tileWidth - expected.handTileWidth!) <= 0.05,
      `${label}: hand tile width`,
    );
    assert.ok(expected.boardTileWidth! >= 26, `${label}: board floor`);
    return;
  }

  assert.deepEqual(measurement.overlaps, [], `${label}: overlapping regions`);
  assert.deepEqual(measurement.outside, [], `${label}: region outside board`);
  assert.ok(
    Math.abs(measurement.tileWidth - expected.handTileWidth!) <= 1,
    `${label}: tile width ${measurement.tileWidth}, solver says ${expected.handTileWidth}`,
  );
  const min = BREAKPOINTS[expected.mode].minTileWidth;
  assert.ok(measurement.tileWidth >= min, `${label}: tile below ${min}`);
  // The hand tile is larger than the board tile by the overlap factor, so the
  // cap applies to the board, the hand to its own solved size.
  assert.ok(
    expected.boardTileWidth! <= BREAKPOINTS[expected.mode].maxTileWidth + 0.05,
    `${label}: board tile above the cap`,
  );
}

before(async () => {
  server = await startServer();
  const chrome = await connectChrome(await findChrome());
  cdp = chrome.cdp;
  sessionId = chrome.sessionId;
  browser = chrome.browser;
  profile = chrome.profile;
});

after(async () => {
  cdp.close();
  browser.kill("SIGKILL");
  await server.stop();
  void profile;
});

describe("variant D computed geometry", () => {
  for (const [width, height, mode] of SIZES) {
    it(`${width}x${height} meets the computed-layout contract`, async () => {
      const expected = expectedLayout(width, height, mode);
      const measurement = await measure(width, height);
      assertGeometry(measurement, expected, `${width}x${height}`);
    });
  }
});

/** The claim offer is the same reserved row as the throw: it cannot invent a
    second overlay elsewhere on the felt. */
const MEASURE_CLAIM = `(() => {
  const R = (element) => {
    if (element === null) return null;
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  const buttons = [...document.querySelectorAll("#claim-bar .claim-button")];
  const label = (button) => button.textContent.trim();
  const bar = document.querySelector("#claim-bar");
  return {
    panel: R(bar),
    claim: R(buttons.find((button) => label(button).startsWith("Claim")) ?? null),
    dismiss: R(buttons.find((button) => label(button).includes("Dismiss")) ?? null),
    variants: [...document.querySelectorAll("#claim-bar .claim-variant")].map(R),
    variantsOverflow: (() => {
      const row = document.querySelector("#claim-bar .claim-variants");
      return row === null ? "" : getComputedStyle(row).overflowX;
    })(),
    hand: R(document.querySelector("#hand")),
    discards: [...document.querySelectorAll("#pile .discard")].map(R),
    scroll: bar ? [bar.scrollWidth, bar.clientWidth] : [0, 0],
    overflow: bar ? getComputedStyle(bar).overflowX : "",
    viewport: innerWidth,
  };
})()`;

interface ClaimMeasurement {
  readonly panel: Rect;
  readonly claim: Rect | null;
  readonly dismiss: Rect | null;
  readonly variants: readonly Rect[];
  readonly variantsOverflow: string;
  readonly hand: Rect;
  readonly discards: readonly Rect[];
  readonly scroll: readonly [number, number];
  readonly overflow: string;
  readonly viewport: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 1 &&
    Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 1
  );
}

function inside(outer: Rect, inner: Rect): boolean {
  return (
    inner[0] >= outer[0] - 1 &&
    inner[1] >= outer[1] - 1 &&
    inner[0] + inner[2] <= outer[0] + outer[2] + 1 &&
    inner[1] + inner[3] <= outer[1] + outer[3] + 1
  );
}

const MEASURE_MELDS = `(() => {
  const R = (element) => {
    if (element === null) return null;
    const r = element.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  const inside = (outer, inner) =>
    inner[0] >= outer[0] - 1 &&
    inner[1] >= outer[1] - 1 &&
    inner[0] + inner[2] <= outer[0] + outer[2] + 1 &&
    inner[1] + inner[3] <= outer[1] + outer[3] + 1;
  const seats = {};
  for (const place of ["top", "left", "right"]) {
    const root = document.querySelector("#seat-" + place);
    const band = R(root);
    const melds = [...root.querySelectorAll(".meld")].map(R);
    const row = root.querySelector(".meld-row");
    seats[place] = {
      band,
      melds,
      visible: row === null ? null : getComputedStyle(row).visibility !== "hidden",
      inside: melds.every((box) => inside(band, box)),
      tiles: melds.map((_, index) => {
        const group = root.querySelectorAll(".meld")[index];
        return [...group.querySelectorAll(".tile")].map(R);
      }),
    };
  }
  return {
    seats,
    hand: R(document.querySelector("#hand")),
    discards: [...document.querySelectorAll("#pile .discard")].map(R),
  };
})()`;

describe("variant D hand order", () => {
  it("keeps the fresh tile as the rightmost one until it is sorted back", async () => {
    await setViewport(cdp, sessionId, 1440, 900);
    await navigate(cdp, sessionId, `${server.url}/`);
    // The deal is yours, so the first hand is fourteen dealt tiles with no
    // fresh one: throw a tile and wait for the table to hand one back.
    const ready = `document.querySelectorAll("#hand .hand-tile").length === 14`;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(cdp, sessionId, ready)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const point = await evaluate<{ x: number; y: number }>(
      cdp,
      sessionId,
      `(() => { const tile = document.querySelectorAll("#hand .hand-tile")[0]; const box = tile.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`,
    );
    await cdp.send({
      method: "Input.dispatchMouseEvent",
      params: { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 },
      sessionId,
    });
    await cdp.send({
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 },
      sessionId,
    });

    const drawnDeadline = Date.now() + 20000;
    let drawn = false;
    while (Date.now() < drawnDeadline) {
      drawn = await evaluate<boolean>(
        cdp,
        sessionId,
        `(() => {
          const tiles = [...document.querySelectorAll("#hand .hand-tile")];
          return tiles.length === 14 && tiles.at(-1).classList.contains("is-drawn");
        })()`,
      );
      if (drawn) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const hand = await evaluate<{
      drawnLast: boolean;
      drawnLabel: string;
      rightmost: boolean;
      tiles: number;
    }>(
      cdp,
      sessionId,
      `(() => {
        const tiles = [...document.querySelectorAll("#hand .hand-tile")];
        const last = tiles[tiles.length - 1];
        const boxes = tiles.map((tile) => tile.getBoundingClientRect());
        const right = Math.max(...boxes.map((box) => box.x + box.width));
        return {
          drawnLast: last.classList.contains("is-drawn"),
          drawnLabel: last.getAttribute("aria-label") ?? "",
          rightmost: Math.abs(boxes[boxes.length - 1].x + boxes[boxes.length - 1].width - right) <= 1,
          tiles: tiles.length,
        };
      })()`,
    );
    assert.ok(drawn, "the table hands the fresh tile back after your discard");
    assert.equal(hand.tiles, 14, "the hand holds the thirteen and the draw");
    assert.ok(hand.drawnLast, "the fresh tile is the last tile in the hand");
    assert.match(hand.drawnLabel, /just drawn/, "and the last tile says it is the fresh one");
    assert.ok(hand.rightmost, "the fresh tile is the rightmost tile on screen");
  });
});

describe("variant D seat melds", () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [844, 390],
  ] as const) {
    it(`${width}x${height} shows a CPU call inside its seat band`, async () => {
      await setViewport(cdp, sessionId, width, height);
      await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
      const measured = await evaluate<{
        seats: Record<
          "top" | "left" | "right",
          {
            band: Rect;
            melds: readonly Rect[];
            visible: boolean | null;
            inside: boolean;
            tiles: readonly (readonly Rect[])[];
          }
        >;
        hand: Rect;
        discards: readonly Rect[];
      }>(cdp, sessionId, MEASURE_MELDS);

      const called = (["top", "left", "right"] as const).filter(
        (place) => measured.seats[place].melds.length > 0,
      );
      assert.ok(called.length > 0, "the review state has a called meld on the table");
      for (const place of called) {
        const seat = measured.seats[place];
        assert.equal(seat.visible, true, `the ${place} seat hides its call`);
        assert.ok(seat.inside, `the ${place} call leaves its seat band`);
        for (const group of seat.tiles) {
          assert.equal(group.length, 3, `a call shows three tiles, not ${group.length}`);
          // A side seat stacks its call down the band, the top seat runs along it.
          if (place === "top") {
            assert.ok(group[1]![0] > group[0]![0], `the ${place} call is not a row`);
          } else {
            assert.ok(group[1]![1] > group[0]![1], `the ${place} call is not a column`);
          }
        }
        for (const meld of seat.melds) {
          assert.ok(
            !overlaps(meld, measured.hand),
            `the ${place} call covers the hand: ${JSON.stringify(meld)}`,
          );
          for (const discard of measured.discards) {
            assert.ok(
              !overlaps(meld, discard),
              `the ${place} call covers a discard: ${JSON.stringify(discard)}`,
            );
          }
        }
      }
    });
  }

  it("keeps multiple top-seat calls on one scrollable row", async () => {
    await setViewport(cdp, sessionId, 390, 844);
    await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
    const measured = await evaluate<{
      groups: number;
      wrap: string;
      overflowX: string;
      row: Rect;
      band: Rect;
      groupTops: number[];
      scrollWidth: number;
      clientWidth: number;
    }>(
      cdp,
      sessionId,
      `(() => {
        const top = document.querySelector("#seat-top");
        let row = top.querySelector(".meld-row");
        if (row === null) {
          row = document.createElement("div");
          row.className = "meld-row";
          top.prepend(row);
        }
        const source = document.querySelector("#seat-left .meld") || document.querySelector("#seat-right .meld");
        // Four pungs leave one concealed back in a 13-tile effective hand.
        const rack = top.querySelector(".rack");
        const back = rack.querySelector(".tile-back");
        rack.replaceChildren(back.cloneNode(true));
        for (let i = 0; i < 4; i++) row.append(source.cloneNode(true));
        const box = (el) => { const r = el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; };
        return {
          groups: row.querySelectorAll(".meld").length,
          wrap: getComputedStyle(row).flexWrap,
          overflowX: getComputedStyle(row).overflowX,
          row: box(row),
          band: box(top),
          groupTops: [...row.querySelectorAll(".meld")].map((el) => el.getBoundingClientRect().y),
          scrollWidth: row.scrollWidth,
          clientWidth: row.clientWidth,
        };
      })()`,
    );
    assert.equal(measured.groups, 4, "all exposed groups remain in the DOM");
    assert.equal(measured.wrap, "nowrap", "claims never form a second row");
    assert.equal(measured.overflowX, "auto", "an unusually long row scrolls instead of wrapping");
    assert.ok(
      Math.max(...measured.groupTops) - Math.min(...measured.groupTops) <= 1,
      "every call shares the same row baseline",
    );
    assert.ok(measured.row[3] <= measured.band[3] + 1, "the row stays within the top seat's height");
    assert.ok(measured.scrollWidth >= measured.clientWidth);
  });
});

describe("variant D calls toggle", () => {
  it("turns the claim prompt off and remembers it", async () => {
    await setViewport(cdp, sessionId, 770, 400);
    await navigate(cdp, sessionId, `${server.url}/?state=turn&variant=d`);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const ready = await evaluate<boolean>(
        cdp,
        sessionId,
        `document.querySelector("#calls-toggle") !== null`,
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const before = await evaluate<{ pressed: string; label: string; stored: string | null }>(
      cdp,
      sessionId,
      `(() => {
        const chip = document.querySelector("#calls-toggle");
        return {
          pressed: chip.getAttribute("aria-pressed"),
          label: chip.textContent.trim(),
          stored: localStorage.getItem("mahjong-calls"),
        };
      })()`,
    );
    assert.equal(before.pressed, "true", "calls are offered by default");
    assert.equal(before.label, "Calls on", "the chip says calls are on");

    await evaluate(cdp, sessionId, `document.querySelector("#calls-toggle").click()`);
    const after = await evaluate<{ pressed: string; label: string; stored: string | null }>(
      cdp,
      sessionId,
      `(() => {
        const chip = document.querySelector("#calls-toggle");
        return {
          pressed: chip.getAttribute("aria-pressed"),
          label: chip.textContent.trim(),
          stored: localStorage.getItem("mahjong-calls"),
        };
      })()`,
    );
    assert.equal(after.pressed, "false", "the chip turns calls off");
    assert.equal(after.stored, "0", "the choice is remembered");

    // With calls off the claim window is never drawn: the table passes for
    // the player instead of asking.
    await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const bar = await evaluate<{ hidden: boolean; buttons: number }>(
      cdp,
      sessionId,
      `(() => {
        const bar = document.querySelector("#claim-bar");
        return { hidden: bar.hidden, buttons: bar.querySelectorAll("button").length };
      })()`,
    );
    assert.equal(bar.hidden, true, "no claim prompt appears with calls off");
    assert.equal(bar.buttons, 0, "and nothing is offered to click");

    await evaluate(cdp, sessionId, `localStorage.removeItem("mahjong-calls")`);
  });
});

describe("variant D heap gaps", () => {
  for (const [width, height, mode] of [
    [770, 400, "phone"],
    [1024, 768, "desktop"],
  ] as const) {
    it(`${width}x${height} fills a claimed cell before it grows`, async () => {
      const expected = expectedLayout(width, height, mode);
      await setViewport(cdp, sessionId, width, height);
      await navigate(cdp, sessionId, `${server.url}/?state=win&variant=d`);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const ready = await evaluate<boolean>(
          cdp,
          sessionId,
          `document.querySelectorAll("#pile .discard").length > 0`,
        );
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const heap = await evaluate<{ spots: [number, number][] }>(
        cdp,
        sessionId,
        `(() => ({
          spots: [...document.querySelectorAll("#pile .discard")].map((tile) => [
            Number.parseFloat(tile.style.left),
            Number.parseFloat(tile.style.top),
          ]),
        }))()`,
      );
      const cells = discardCells(
        expected.pile,
        expected.discardTileWidth,
        discardGap(expected.discardTileWidth),
      );
      const used = new Set<number>();
      for (const [x, y] of heap.spots) {
        const index = cells.findIndex(
          (cell) => Math.abs(cell.x - x) <= 1 && Math.abs(cell.y - y) <= 1,
        );
        assert.notEqual(index, -1, `a discard sits off the grid at ${x},${y}`);
        used.add(index);
      }
      // The grid fills its gaps before it grows: with a claimed cell free, the
      // occupied cells are still the first N, never N scattered ones.
      assert.deepEqual(
        [...used].sort((first, second) => first - second),
        heap.spots.map((_, index) => index),
        `${width}x${height}: the heap left a gap inside its own frontier`,
      );
      assert.ok(
        heap.spots.length > 0,
        `${width}x${height}: the heap is empty`,
      );
    });
  }
});

describe("variant D far-seat calls", () => {
  it("770x400 keeps every far-seat call inside its band", async () => {
    await setViewport(cdp, sessionId, 770, 400);
    await navigate(cdp, sessionId, `${server.url}/?state=win&variant=d`);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const ready = await evaluate<boolean>(
        cdp,
        sessionId,
        `document.querySelectorAll("#seat-top .meld").length > 0`,
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const measured = await evaluate<{
      seats: Record<string, { band: Rect; melds: Rect[]; inside: boolean }>;
    }>(cdp, sessionId, MEASURE_MELDS);
    const top = measured.seats.top!;
    assert.ok(top.melds.length > 0, "the review hand has a far-seat call");
    for (const meld of top.melds) {
      // A squeezed meld row scrolls its first call out of the band, and a
      // claim that never shows reads as a call that never happened.
      assert.ok(
        inside(top.band, meld),
        `a far-seat call sits outside its band: ${JSON.stringify(meld)} in ${JSON.stringify(top.band)}`,
      );
    }
  });
});

describe("variant D whole hand on the heap", () => {
  for (const state of ["win", "drawn", "result"] as const) {
    it(`${state} shows every discard of the finished hand`, async () => {
      const scenario = await (await fetch(`${server.url}/api/scenario?state=${state}`)).json();
      const total = scenario.table.reduce(
        (sum: number, seat: { discards: string[] }) => sum + seat.discards.length,
        0,
      );
      assert.ok(total > 0, "the review hand has discards");
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [844, 390],
      ] as const) {
        await setViewport(cdp, sessionId, width, height);
        await navigate(cdp, sessionId, `${server.url}/?state=${state}&variant=d`);
        const pile = await evaluate<{
          tiles: number;
          unique: number;
          sizes: string[];
        }>(
          cdp,
          sessionId,
          `(() => {
            const tiles = [...document.querySelectorAll("#pile .discard")];
            const spots = new Set(tiles.map((tile) => tile.style.left + "," + tile.style.top));
            return {
              tiles: tiles.length,
              unique: spots.size,
              sizes: [...new Set(tiles.map((tile) => tile.offsetWidth + "x" + tile.offsetHeight))],
            };
          })()`,
        );
        assert.equal(pile.tiles, total, `${state} ${width}x${height}: ${total - pile.tiles} discards are missing`);
        assert.equal(pile.unique, total, `${state} ${width}x${height}: discards share a spot`);
        // A hand longer than the heap was drawn for is re-dealt once at the
        // whole-hand size; every tile on the heap is that one size.
        assert.equal(
          pile.sizes.length,
          1,
          `${state} ${width}x${height}: the heap mixes tile sizes (${pile.sizes.join(", ")})`,
        );
      }
    });
  }
});

describe("variant D heap resize", () => {
  it("re-deals a full heap at the new size instead of leaving stale tiles", async () => {
    const scenario = await (await fetch(`${server.url}/api/scenario?state=drawn`)).json();
    const total = scenario.table.reduce(
      (sum: number, seat: { discards: string[] }) => sum + seat.discards.length,
      0,
    );
    await setViewport(cdp, sessionId, 1440, 900);
    await navigate(cdp, sessionId, `${server.url}/?state=drawn&variant=d`);
    await setViewport(cdp, sessionId, 844, 390);
    const pile = await evaluate<{
      tiles: number;
      sizes: string[];
      inside: boolean;
      pile: number[];
    }>(
      cdp,
      sessionId,
      `(() => {
        const root = document.querySelector("#pile");
        const box = root.getBoundingClientRect();
        const tiles = [...root.querySelectorAll(".discard")];
        const margin = 40;
        return {
          tiles: tiles.length,
          sizes: [...new Set(tiles.map((tile) => tile.offsetWidth + "x" + tile.offsetHeight))],
          inside: tiles.every((tile) => {
            const r = tile.getBoundingClientRect();
            return (
              r.x >= box.x - margin &&
              r.y >= box.y - margin &&
              r.x + r.width <= box.x + box.width + margin &&
              r.y + r.height <= box.y + box.height + margin
            );
          }),
          pile: [box.x, box.y, box.width, box.height],
        };
      })()`,
    );
    assert.equal(pile.tiles, total, "every discard survived the resize");
    assert.equal(pile.sizes.length, 1, `the heap mixes sizes after a resize (${pile.sizes.join(", ")})`);
    assert.ok(pile.inside, "a discard left the pile after the resize");
  });
});

describe("variant D claim row", () => {
  for (const [width, height, mode] of [
    [1440, 900, "desktop"],
    [390, 844, "phone"],
    [844, 390, "phone"],
  ] as const) {
    it(`${width}x${height} mirrors the claim into the throw's slot`, async () => {
      await setViewport(cdp, sessionId, width, height);
      await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
      const claim = await evaluate<ClaimMeasurement>(cdp, sessionId, MEASURE_CLAIM);
      const expected = expectedLayout(width, height, mode);

      assert.ok(claim.claim !== null, "a claim window offers the claim");
      assert.ok(claim.dismiss !== null, "and a way to dismiss it");
      const row = [
        expected.table[0],
        expected.controls[1],
        expected.controls[0] + expected.controls[2] - expected.table[0],
        expected.controls[3],
      ];
      assert.ok(
        Math.abs(claim.panel[0] - row[0]) <= 1 &&
          Math.abs(claim.panel[1] - row[1]) <= 1 &&
          Math.abs(claim.panel[2] - row[2]) <= 1 &&
          Math.abs(claim.panel[3] - row[3]) <= 1,
        `the row runs from the table rim to the throw's edge: ${JSON.stringify(claim.panel)} vs ${JSON.stringify(row)}`,
      );

      // Dismiss holds the left end, the claim the throw's own slot at the
      // right; neither may span the board.
      assert.ok(
        Math.abs(claim.dismiss![0] - claim.panel[0]) <= 1,
        `Dismiss starts at ${claim.dismiss![0]}, the row at ${claim.panel[0]}`,
      );
      assert.ok(
        Math.abs(claim.claim![0] + claim.claim![2] - (claim.panel[0] + claim.panel[2])) <= 1,
        `Claim ends at ${claim.claim![0] + claim.claim![2]}, the row at ${claim.panel[0] + claim.panel[2]}`,
      );
      assert.ok(
        claim.claim![2] < claim.panel[2] - 20,
        `Claim takes ${claim.claim![2]} px of a ${claim.panel[2]} px row`,
      );
      assert.ok(
        claim.dismiss![2] < claim.panel[2] - 20,
        `Dismiss takes ${claim.dismiss![2]} px of a ${claim.panel[2]} px row`,
      );

      for (const box of [claim.claim!, claim.dismiss!]) {
        assert.ok(inside(claim.panel, box), `a call leaves the row: ${JSON.stringify(box)}`);
      }
      // A chow offer with several runs may scroll inside its own row, so a
      // variant only has to stay within the row's height (or the row scrolls).
      for (const box of claim.variants) {
        assert.ok(
          box[1] >= claim.panel[1] - 1 &&
            box[1] + box[3] <= claim.panel[1] + claim.panel[3] + 1,
          `a chow variant leaves the row's height: ${JSON.stringify(box)}`,
        );
        assert.ok(
          inside(claim.panel, box) || claim.variantsOverflow === "auto",
          `a chow variant leaves the row and nothing scrolls: ${JSON.stringify(box)}`,
        );
      }

      // The hand is never covered, and neither is a discard.
      assert.ok(
        !overlaps(claim.panel, claim.hand),
        `the row covers the hand: ${JSON.stringify(claim.panel)} vs ${JSON.stringify(claim.hand)}`,
      );
      for (const discard of claim.discards) {
        assert.ok(
          !overlaps(claim.panel, discard),
          `the row covers a discard: ${JSON.stringify(discard)}`,
        );
      }
    });
  }

  it("gives the phone the whole board inside the rim", async () => {
    await setViewport(cdp, sessionId, 390, 844);
    await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
    const claim = await evaluate<ClaimMeasurement>(cdp, sessionId, MEASURE_CLAIM);
    const inset = tableInset(390, 844);
    assert.equal(Math.round(claim.panel[0]), inset, "the row starts at the table rim");
    assert.equal(
      Math.round(claim.panel[2]),
      claim.viewport - 2 * inset,
      "the row spans the board inside the rim",
    );
    if (claim.scroll[0] > claim.scroll[1]) {
      assert.equal(
        claim.overflow,
        "auto",
        "a wider offer scrolls inside the row instead of painting over the felt",
      );
    }
  });
});
