/**
 * Responsive geometry audit for variant D.
 *
 * The desktop assertions are the contract from docs/UI-SPEC.md:
 *   - no two region rects intersect;
 *   - every seat badge is gap 2 from its rack/hand and centred on it;
 *   - the tile face is at least 26px wide;
 *   - nothing leaves the board box.
 *
 * Phone sizes are measured and marked TODO: the current table still uses the
 * desktop constants, so these fail until the responsive formula exists.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { computeLayout } from "../web/layout.js";
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

interface Badge {
  readonly gap: number;
  readonly offset: number;
}

interface Measurement {
  readonly rects: Readonly<Record<string, Rect>>;
  readonly overlaps: readonly string[];
  readonly outside: readonly string[];
  readonly badges: Readonly<Record<"top" | "left" | "right" | "self", Badge>>;
  readonly tileWidth: number;
  readonly handTiles: readonly number[];
  readonly handGaps: readonly number[];
  readonly handScrollWidth: number;
  readonly handClientWidth: number;
  readonly lastTileDrawn: boolean;
  readonly visibleBadges: number;
  readonly riverTiles: readonly Rect[];
  readonly riverZones: Readonly<Record<"top" | "left" | "right" | "bottom", Rect | null>>;
  readonly riverSlots: Readonly<Record<"top" | "left" | "right" | "bottom", readonly Rect[]>>;
  readonly firstDiscards: Readonly<Record<"top" | "left" | "right" | "bottom", Rect | null>>;
  readonly discard: Rect | null;
  readonly handToggle: boolean;
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
    riverTop: "#river-top .river",
    riverLeft: "#river-left .river",
    riverRight: "#river-right .river",
    riverBottom: "#river-bottom .river",
    centre: ".center",
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

  const gapFor = (badgeSelector, rackSelector) => {
    const badge = R(document.querySelector(badgeSelector));
    const rack = R(document.querySelector(rackSelector));
    if (badge === null || rack === null) return null;
    const gap =
      rack[0] >= badge[0] + badge[2]
        ? rack[0] - (badge[0] + badge[2])
        : badge[0] - (rack[0] + rack[2]);
    const offset = Math.abs(
      badge[1] + badge[3] / 2 - (rack[1] + rack[3] / 2),
    );
    return { gap, offset };
  };

  const badges = {
    top: gapFor("#seat-top .seat-badge", "#seat-top .rack"),
    left: gapFor("#seat-left .seat-badge", "#seat-left .rack"),
    right: gapFor("#seat-right .seat-badge", "#seat-right .rack"),
    self: gapFor("#hand-badge", "#hand"),
  };
  const visibleBadges = [...document.querySelectorAll(".seat-badge,#hand-badge")]
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }).length;
  const handTiles = [...document.querySelectorAll("#hand .hand-tile")].map(R);
  const handGaps = handTiles
    .slice(1)
    .map((tile, index) => tile[0] - (handTiles[index][0] + handTiles[index][2]));
  const handBand = document.querySelector(".hand-band");
  const handTile = R(document.querySelector("#hand .hand-tile"));
  const lastTile = document.querySelector("#hand .hand-tile:last-child");

  const riverZones = {};
  const riverSlots = {};
  const firstDiscards = {};
  for (const place of ["top", "left", "right", "bottom"]) {
    const river = document.querySelector("#river-" + place + " .river");
    riverZones[place] = R(river);
    riverSlots[place] = river === null
      ? []
      : [...river.querySelectorAll(".river-slot")].map(R);
    const first = river === null ? null : river.querySelector(".tile.first");
    firstDiscards[place] = first === null ? null : R(first);
  }
  const riverTiles = [...document.querySelectorAll(".river .tile")].map(R);

  return {
    riverTiles,
    riverZones,
    riverSlots,
    firstDiscards,
    rects,
    overlaps: collisions,
    outside,
    badges,
    tileWidth: handTile === null ? 0 : handTile[2],
    handTiles: handTiles.map((tile) => tile[2]),
    handGaps,
    handScrollWidth: handBand === null ? 0 : handBand.scrollWidth,
    handClientWidth: handBand === null ? 0 : handBand.clientWidth,
    lastTileDrawn: lastTile === null ? false : lastTile.classList.contains("is-drawn"),
    discard: R(document.querySelector('.action-button[data-action="discard"]')),
    handToggle: document.querySelector(".hand-toggle") !== null,
    handCollapsed: document.documentElement.classList.contains("hand-collapsed"),
    visibleBadges,
  };
})()`;

let cdp: Cdp;
let sessionId: string;
let browser: { kill: (signal: NodeJS.Signals) => boolean };
let server: { url: string; stop: () => Promise<void> };
let profile: string;

/** Fill every reserved river slot so capacity is exercised, not just the
    scenario's opening discards. */
const FILL_RIVERS = `(() => {
  const template = document.querySelector("#hand .hand-tile .tile");
  if (template === null) throw new Error("no hand tile to copy into the rivers");
  for (const river of document.querySelectorAll(".river")) {
    const slots = [...river.querySelectorAll(".river-slot")];
    slots.forEach((slot, index) => {
      slot.removeAttribute("aria-hidden");
      const tile = template.cloneNode(true);
      slot.replaceChildren(tile);
      if (index === 0) tile.classList.add("first");
    });
  }
  return [...document.querySelectorAll(".river")].map(
    (river) => river.querySelectorAll(".river-slot").length,
  );
})()`;

async function measure(width: number, height: number): Promise<Measurement> {
  await setViewport(cdp, sessionId, width, height);
  await navigate(cdp, sessionId, `${server.url}/?state=turn&variant=d`);
  await evaluate(cdp, sessionId, FILL_RIVERS);
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

function assertRivers(
  measurement: Measurement,
  expected: ReturnType<typeof expectedLayout>,
  label: string,
): void {
  const columns = expected.riverColumns;
  const rows = expected.riverRows;
  const capacity = columns * rows;
  const obstacles: Array<[string, Rect]> = [
    ["hand band", measurement.rects.handBand!],
    ["centre", measurement.rects.centre!],
    ["top seat", measurement.rects.seatTop!],
    ["left seat", measurement.rects.seatLeft!],
    ["right seat", measurement.rects.seatRight!],
  ].filter((entry): entry is [string, Rect] => entry[1] !== null);

  assert.equal(
    measurement.riverTiles.length,
    4 * capacity,
    `${label}: expected a full river of ${capacity} per seat`,
  );
  for (const tile of measurement.riverTiles) {
    for (const [name, obstacle] of obstacles) {
      assert.ok(
        overlapArea(tile, obstacle) <= 0.5,
        `${label}: discard ${tile} intersects the ${name}`,
      );
    }
  }

  for (const place of ["top", "left", "right", "bottom"] as const) {
    const side = place === "left" || place === "right";
    const zone = measurement.riverZones[place];
    assert.ok(zone !== null, `${label}: missing ${place} river`);
    const slots = measurement.riverSlots[place];
    assert.equal(slots.length, capacity, `${label}: ${place} river slots`);
    const expectedTile = side
      ? expected.riverSideTileWidth
      : expected.riverFlatTileWidth;
    for (const slot of slots) {
      const width = side ? slot[3] : slot[2];
      const height = side ? slot[2] : slot[3];
      assert.ok(
        Math.abs(width - expectedTile) <= 0.5,
        `${label}: ${place} river tile ${width}, solver says ${expectedTile}`,
      );
      assert.ok(
        Math.abs(height / width - 4 / 3) <= 0.02,
        `${label}: ${place} river tile ${width}x${height} is not 3:4`,
      );
      assert.ok(
        width <= zone[2] / columns + 0.5,
        `${label}: ${place} tile wider than regionWidth/columns`,
      );
      assert.ok(
        width <= zone[3] / rows + 0.5,
        `${label}: ${place} tile taller than regionHeight/rows`,
      );
    }
    const first = measurement.firstDiscards[place];
    assert.ok(first !== null, `${label}: ${place} first discard missing`);
    assert.ok(
      first[0] >= zone[0] - 1 &&
        first[1] >= zone[1] - 1 &&
        first[0] + first[2] <= zone[0] + zone[2] + 1 &&
        first[1] + first[3] <= zone[1] + zone[3] + 1,
      `${label}: ${place} first discard escapes its river region`,
    );
  }
}

function assertBadges(
  measurement: Measurement,
  expectedGap: number,
  label: string,
): void {
  assert.equal(measurement.visibleBadges, 4, `${label}: expected four badges`);
  for (const seat of ["top", "left", "right", "self"] as const) {
    const badge = measurement.badges[seat];
    assert.ok(badge !== null, `${label}: ${seat} badge missing`);
    assert.ok(
      Math.abs(badge.gap - expectedGap) <= 0.05,
      `${label}: ${seat} gap is ${badge.gap}, expected ${expectedGap}`,
    );
    assert.ok(
      badge.offset <= 0.05,
      `${label}: ${seat} centre offset is ${badge.offset}, expected 0`,
    );
  }
}

/** The reserved row above the hand holds exactly one control block at a time:
    the calls the table offers line up from its left edge, your own throw sits
    at its right edge, and neither may grow out of the row. */
function assertActionRow(measurement: Measurement, label: string): void {
  const controls = measurement.rects.controls;
  const discard = measurement.discard;
  assert.ok(controls, `${label}: no controls row`);
  assert.ok(discard, `${label}: no discard button in the turn state`);
  const right = discard[0] + discard[2];
  const bandRight = controls[0] + controls[2];
  assert.ok(
    Math.abs(right - bandRight) <= 1,
    `${label}: discard ends at ${right}, the row at ${bandRight}`,
  );
  assert.ok(
    discard[1] >= controls[1] - 1 && discard[1] + discard[3] <= controls[1] + controls[3] + 1,
    `${label}: discard box leaves the reserved row`,
  );
}


/** The hand is the one thing that must never be out of sight: no control may
    collapse, hide or scroll it away. */
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
    const handWidth = Math.floor(measurement.handClientWidth / 14);
    for (const width of measurement.handTiles) {
      assert.ok(
        Math.abs(width - handWidth) <= 1,
        `${label}: hand tile ${width} is not ${handWidth} (+/- 1)`,
      );
    }
    for (const gap of measurement.handGaps) {
      assert.ok(
        Math.abs(gap) <= 0.5,
        `${label}: hand gap ${gap} is not zero`,
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
  assertBadges(measurement, expected.gap, label);
  assert.ok(
    Math.abs(measurement.tileWidth - expected.tileWidth) <= 0.05,
    `${label}: tile width ${measurement.tileWidth}, solver says ${expected.tileWidth}`,
  );
  const min = BREAKPOINTS[expected.mode].minTileWidth;
  assert.ok(measurement.tileWidth >= min, `${label}: tile below ${min}`);
  assert.ok(
    measurement.tileWidth <= BREAKPOINTS[expected.mode].maxTileWidth + 0.05,
    `${label}: tile above the cap`,
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
      assertRivers(measurement, expected, `${width}x${height}`);
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
    assert.equal(claim.band[0], 0, "the row starts at the screen edge");
    assert.equal(claim.band[2], claim.viewport, "the row is the screen width");
    if (claim.scroll[0] > claim.scroll[1]) {
      assert.equal(
        claim.overflow,
        "auto",
        "a wider offer scrolls inside the row instead of painting over the felt",
      );
    }
  });
});
