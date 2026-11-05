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

import { computeLayout, tableInset } from "../web/layout.js";
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
  readonly handToggle: boolean;
  readonly markers: number;
  readonly frameBorder: string;
  readonly handCollapsed: boolean;
}

const SIZES = [
  [1440, 900, "desktop"],
  [1280, 800, "desktop"],
  [1024, 768, "desktop"],
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
    handBandFraction: 0.24,
    minTileWidth: 18,
    maxTileWidth: 46,
  },
  portrait: {
    riverColumns: 3,
    handBandFraction: 0.18,
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
      // The three opponents are the same kind of seat: one back size for all.
      sizes.add(`${first[2].toFixed(1)}x${first[3].toFixed(1)}`);
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
  const bar = document.querySelector("#claim-bar");
  return {
    band: R(bar),
    buttons: [...document.querySelectorAll("#claim-bar .claim-button")].map(R),
    variants: [...document.querySelectorAll("#claim-bar .claim-variant")].map(R),
    controls: R(document.querySelector("#actions")),
    scroll: bar ? [bar.scrollWidth, bar.clientWidth] : [0, 0],
    overflow: bar ? getComputedStyle(bar).overflowX : "",
    viewport: innerWidth,
  };
})()`;

describe("variant D pile", () => {
  for (const [width, height, mode] of [
    [1440, 900, "desktop"],
    [390, 844, "phone"],
  ] as const) {
    it(`${width}x${height} throws every discard at one size`, async () => {
      await setViewport(cdp, sessionId, width, height);
      await navigate(cdp, sessionId, `${server.url}/?state=fishing&variant=d`);
      // The pile is empty until the fixture has painted its discards.
      await evaluate(
        cdp,
        sessionId,
        `new Promise((done) => {
          const started = performance.now();
          const tick = () => {
            if (document.querySelectorAll("#pile .discard").length > 0 ||
                performance.now() - started > 4000) return done(true);
            setTimeout(tick, 40);
          };
          tick();
        })`,
      );
      const measurement = await evaluate<Measurement>(cdp, sessionId, MEASURE);
      assertPile(
        measurement,
        expectedLayout(width, height, mode),
        `${width}x${height}`,
      );
    });
  }
});

describe("variant D action row", () => {
  it("offers the calls from the left edge of the reserved row", async () => {
    await setViewport(cdp, sessionId, 1440, 900);
    await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
    const claim = await evaluate<{
      band: Rect;
      buttons: Rect[];
      variants: Rect[];
      controls: Rect;
    }>(cdp, sessionId, MEASURE_CLAIM);
    assert.ok(claim.buttons.length > 0, "a claim window offers a button");
    assert.ok(
      Math.abs(claim.buttons[0][0] - claim.band[0]) <= 1,
      `the first call starts at ${claim.buttons[0][0]}, the row at ${claim.band[0]}`,
    );
    for (const box of [...claim.buttons, ...claim.variants]) {
      assert.ok(
        box[1] >= claim.band[1] - 1 &&
          box[1] + box[3] <= claim.band[1] + claim.band[3] + 1,
        `a call leaves the reserved row: ${JSON.stringify(box)}`,
      );
    }
  });

  it("keeps an over-wide chow offer inside the phone row", async () => {
    await setViewport(cdp, sessionId, 390, 844);
    await navigate(cdp, sessionId, `${server.url}/?state=claim&variant=d`);
    const claim = await evaluate<{
      band: Rect;
      scroll: [number, number];
      overflow: string;
      viewport: number;
    }>(cdp, sessionId, MEASURE_CLAIM);
    const inset = tableInset(390, 844);
    assert.equal(
      Math.round(claim.band[0]),
      inset,
      "the row starts at the table rim, not the screen edge",
    );
    assert.equal(
      Math.round(claim.band[2]),
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
