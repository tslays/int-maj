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
  readonly visibleBadges: number;
}

const DESKTOP = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
] as const;

const PHONE = [
  [844, 390],
  [932, 430],
  [390, 844],
  [430, 932],
] as const;

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
  const tile = R(document.querySelector("#hand .hand-tile"));

  return {
    rects,
    overlaps: collisions,
    outside,
    badges,
    tileWidth: tile === null ? 0 : tile[2],
    visibleBadges,
  };
})()`;

let cdp: Cdp;
let sessionId: string;
let browser: { kill: (signal: NodeJS.Signals) => boolean };
let server: { url: string; stop: () => Promise<void> };
let profile: string;

async function measure(width: number, height: number): Promise<Measurement> {
  await setViewport(cdp, sessionId, width, height);
  await navigate(cdp, sessionId, `${server.url}/?state=turn&variant=d`);
  return evaluate<Measurement>(cdp, sessionId, MEASURE);
}

function assertBadges(measurement: Measurement, label: string): void {
  assert.equal(measurement.visibleBadges, 4, `${label}: expected four badges`);
  for (const seat of ["top", "left", "right", "self"] as const) {
    const badge = measurement.badges[seat];
    assert.ok(badge !== null, `${label}: ${seat} badge missing`);
    assert.ok(
      Math.abs(badge.gap - 2) <= 0.05,
      `${label}: ${seat} gap is ${badge.gap}, expected 2`,
    );
    assert.ok(
      badge.offset <= 0.05,
      `${label}: ${seat} centre offset is ${badge.offset}, expected 0`,
    );
  }
}

function assertDesktop(measurement: Measurement, label: string): void {
  assert.deepEqual(measurement.overlaps, [], `${label}: overlapping regions`);
  assert.deepEqual(measurement.outside, [], `${label}: region outside board`);
  assertBadges(measurement, label);
  assert.ok(
    measurement.tileWidth >= 26,
    `${label}: tile width ${measurement.tileWidth} is below 26`,
  );
}

function assertPhone(measurement: Measurement, label: string): void {
  assert.deepEqual(measurement.overlaps, [], `${label}: overlapping regions`);
  assert.deepEqual(measurement.outside, [], `${label}: region outside board`);
  assertBadges(measurement, label);
  assert.ok(
    measurement.tileWidth >= 18,
    `${label}: tile width ${measurement.tileWidth} is below 18`,
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
  for (const [width, height] of DESKTOP) {
    it(`${width}x${height} meets the desktop contract`, async () => {
      assertDesktop(await measure(width, height), `${width}x${height}`);
    });
  }

  for (const [width, height] of PHONE) {
    it(
      `${width}x${height} phone layout (expected to fail)`,
      { todo: "TODO responsive formula: landscape controls leave the board and the hand band collides with side seats/controls; portrait tiles fall below 18px; 4/3-column rivers and 24/18% hand bands are not implemented" },
      async () => {
        assertPhone(await measure(width, height), `${width}x${height}`);
      },
    );
  }
});
