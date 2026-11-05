#!/usr/bin/env node
/**
 * Numeric proof that the table's geometry holds.
 *
 * The tool starts the real server, drives a real headless Chrome over CDP,
 * fills all four reserved rivers to 0, 13 and 24 tiles, and measures every
 * board element with getBoundingClientRect(). Two rectangles may not overlap
 * by more than one pixel at 1440x900 or 1280x800. It then opens a finished
 * hand so the result modal is measured too (a modal is expected to cover the
 * table; the check proves its card fits inside the viewport).
 *
 *   node tools/check-layout.ts
 *   CHROME_PATH=/path/to/chrome node tools/check-layout.ts
 *
 * Screenshots go to a temporary directory and their paths are printed.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createAppServer } from "../src/server/server.ts";
import { GameStore } from "../src/server/session.ts";
import { chooseAction } from "../src/core/game/bot.ts";
import type { GameView } from "../src/core/game/view.ts";

type Rect = readonly [x: number, y: number, width: number, height: number];

interface ApiPayload {
  readonly game?: string;
  readonly view: { readonly phase: string };
  readonly legalActions?: Array<Record<string, unknown>>;
  readonly outcome?: unknown;
  readonly error?: string;
}

interface Measurement {
  readonly rects: Record<string, Rect>;
  readonly tile: {
    readonly w: number;
    readonly h: number;
    readonly gap: number;
    readonly handW: number;
    readonly handH: number;
    readonly backW: number;
    readonly backH: number;
    readonly centreW: number;
  };
  readonly slots: Record<string, number>;
  readonly handCount: number;
  readonly drawGap: number;
  readonly overflow: readonly [number, number, number, number];
  readonly overlay: {
    readonly hidden: boolean;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    readonly rect: Rect;
  };
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

const RIVERS = ["top", "left", "right", "bottom"] as const;

const LABELS: Record<string, string> = {
  board: "board",
  playfield: "frame",
  handBand: "hand band",
  riverTop: "river north",
  riverLeft: "river west",
  riverRight: "river east",
  riverBottom: "river south",
  centre: "centre panel",
  rackTop: "north rack",
  rackLeft: "west rack",
  rackRight: "east rack",
  hand: "your hand",
  actions: "action cluster",
};

/* Vocabulary: pairwise non-intersection. A one-pixel touch is not an
   overlap; anything thicker in both axes is. */
function overlaps(a: Rect, b: Rect): boolean {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return width > 1 && height > 1;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.every((value, index) => Math.abs(value - b[index]!) <= 0.5);
}

function formatRect(rect: Rect): string {
  return `${Math.round(rect[0])},${Math.round(rect[1])} ${Math.round(rect[2])}x${Math.round(rect[3])}`;
}

function printMeasurement(label: string, measurement: Measurement, viewportWidth: number): void {
  console.log(`\n${label}`);
  for (const [key, rect] of Object.entries(measurement.rects)) {
    console.log(`  ${(LABELS[key] ?? key).padEnd(16)} ${formatRect(rect)}`);
  }
  const tile = measurement.tile;
  const expectedRiver = `6*${tile.w} + 5*${tile.gap} = ${6 * tile.w + 5 * tile.gap}`;
  console.log(
    `  hand unit        ${tile.handW}x${tile.handH} (${((tile.handW / viewportWidth) * 100).toFixed(2)}% of viewport width)`,
  );
  console.log(
    `  tile unit        ${tile.w}x${tile.h}, gap ${tile.gap}; ` +
      `river width ${expectedRiver}, height ${3 * tile.h + 2 * tile.gap}`,
  );
  console.log(
    `  ratios           river/hand ${(tile.w / tile.handW).toFixed(3)}, ` +
      `back/hand ${(Math.max(tile.backW, tile.backH) / tile.handW).toFixed(3)}, ` +
      `centre/hand ${(tile.centreW / tile.handW).toFixed(3)}`,
  );
  console.log(
    `  river slots      ${RIVERS.map((river) => `${river} ${measurement.slots[river]}`).join(", ")}`,
  );
}

/* ------------------------------------------------------------ anchors */

const REFERENCE_VIEWPORT = { width: 1512, height: 894 } as const;

/** One row of the anchor table: reference (page px), ours, delta. */
function anchorRow(name: string, reference: number | null, ours: number, note = ""): void {
  const tail = note ? `  ${note}` : "";
  if (reference === null) {
    console.log(`  ${name.padEnd(24)} ${"—".padStart(9)} ${ours.toFixed(1).padStart(8)}${tail}`);
    return;
  }
  const delta = ours - reference;
  console.log(
    `  ${name.padEnd(24)} ${reference.toFixed(1).padStart(9)} ${ours.toFixed(1).padStart(8)} ` +
      `${(delta >= 0 ? "+" : "") + delta.toFixed(1)}${tail}`,
  );
}

/** An anchor that must be inside the ±4px tolerance of the reference. */
function assertAnchor(label: string, name: string, reference: number, ours: number): void {
  anchorRow(name, reference, ours);
  assert.ok(
    Math.abs(ours - reference) <= 4,
    `${label}: ${name} is ${ours.toFixed(1)}, reference ${reference}, delta ${(ours - reference).toFixed(1)} (tolerance 4)`,
  );
}

/* ------------------------------------------------------------- browser */

interface CdpOptions {
  readonly method: string;
  readonly params?: Record<string, unknown>;
  readonly sessionId?: string;
}

export class Cdp {
  private readonly socket: WebSocket;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Map<string, Array<(params: unknown) => void>>();
  private nextId = 1;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message?: string };
        sessionId?: string;
      };
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (waiter === undefined) return;
        this.pending.delete(message.id);
        if (message.error !== undefined) waiter.reject(new Error(message.error.message ?? "CDP error"));
        else waiter.resolve(message.result);
        return;
      }
      if (message.method === undefined) return;
      const key = `${message.sessionId ?? ""}:${message.method}`;
      for (const listener of this.listeners.get(key) ?? []) listener(message.params);
    });
  }

  send<T = unknown>({ method, params = {}, sessionId }: CdpOptions): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const id = this.nextId++;
    this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
    return promise;
  }

  once(method: string, sessionId: string): Promise<unknown> {
    const key = `${sessionId}:${method}`;
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const list = this.listeners.get(key) ?? [];
    const listener = (params: unknown) => {
      this.listeners.set(key, (this.listeners.get(key) ?? []).filter((item) => item !== listener));
      resolve(params);
    };
    list.push(listener);
    this.listeners.set(key, list);
    return promise;
  }

  close(): void {
    this.socket.close();
  }
}

function chromeCandidates(): string[] {
  const home = process.env.HOME ?? "";
  const candidates = [
    process.env.CHROME_PATH ?? "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.filter((candidate) => candidate.length > 0).concat([home]);
}

export async function findChrome(): Promise<string> {
  const direct = chromeCandidates();
  for (const candidate of direct.slice(0, -1)) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // Try the next one.
    }
  }

  // omp's managed Chrome for Testing is versioned; take the newest build.
  const home = process.env.HOME ?? "";
  const root = join(home, ".omp", "puppeteer", "chrome");
  try {
    const versions = (await readdir(root)).sort().reverse();
    for (const version of versions) {
      const path = join(
        root,
        version,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing",
      );
      try {
        await readFile(path);
        return path;
      } catch {
        // Try the next version.
      }
    }
  } catch {
    // No managed browser.
  }

  throw new Error("no Chrome found; set CHROME_PATH");
}

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await readFile(path);
      return;
    } catch {
      if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function connectChrome(chromePath: string): Promise<{
  cdp: Cdp;
  sessionId: string;
  browser: ChildProcess;
  profile: string;
}> {
  const profile = await mkdtemp(join(tmpdir(), "maj-layout-profile-"));
  const browser = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const activePort = join(profile, "DevToolsActivePort");
  await waitForFile(activePort);
  const [portLine, pathLine] = (await readFile(activePort, "utf8")).trim().split("\n");
  const socket = new WebSocket(`ws://127.0.0.1:${portLine}${pathLine}`);
  {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    await promise;
  }
  const cdp = new Cdp(socket);

  const { targetId } = await cdp.send<{ targetId: string }>({
    method: "Target.createTarget",
    params: { url: "about:blank" },
  });
  const { sessionId } = await cdp.send<{ sessionId: string }>({
    method: "Target.attachToTarget",
    params: { targetId, flatten: true },
  });
  await cdp.send({ method: "Page.enable", sessionId });
  await cdp.send({ method: "Runtime.enable", sessionId });
  return { cdp, sessionId, browser, profile };
}

export async function evaluate<T>(cdp: Cdp, sessionId: string, expression: string): Promise<T> {
  const result = await cdp.send<{
    result: { value?: unknown };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  }>({
    method: "Runtime.evaluate",
    params: { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    sessionId,
  });
  if (result.exceptionDetails !== undefined) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "page error",
    );
  }
  return result.result.value as T;
}

export async function setViewport(cdp: Cdp, sessionId: string, width: number, height: number): Promise<void> {
  await cdp.send({
    method: "Emulation.setDeviceMetricsOverride",
    params: { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  });
  await evaluate(
    cdp,
    sessionId,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
}

export async function navigate(cdp: Cdp, sessionId: string, url: string): Promise<void> {
  const loaded = cdp.once("Page.loadEventFired", sessionId);
  await cdp.send({ method: "Page.navigate", params: { url }, sessionId });
  await loaded;
  await waitFor(
    cdp,
    sessionId,
    `document.readyState === "complete" && document.querySelector("#river-top .river") !== null`,
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function waitFor(cdp: Cdp, sessionId: string, expression: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await evaluate<boolean>(cdp, sessionId, expression)) return;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${expression}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const FILL_RIVERS = (count: number): string => `
(() => {
  const template = document.querySelector(".hand-tile .tile");
  if (template === null) throw new Error("no tile to copy into the rivers");
  // Same mapping as the client: the first row is flush against the centre
  // and later rows grow back toward the seat, columns left to right as that
  // player reads them.
  const layouts = {
    top: { cols: 6, rows: 3, cell: (r, c) => [5 - c, 2 - r] },
    bottom: { cols: 6, rows: 3, cell: (r, c) => [c, r] },
    left: { cols: 3, rows: 6, cell: (r, c) => [2 - r, c] },
    right: { cols: 3, rows: 6, cell: (r, c) => [r, 5 - c] },
  };
  for (const river of document.querySelectorAll(".river")) {
    const place = ["top", "bottom", "left", "right"].find((name) =>
      river.classList.contains("river-" + name),
    );
    const layout = layouts[place];
    const cells = Array.from({ length: 18 }, () => {
      const slot = document.createElement("div");
      slot.className = "river-slot";
      slot.setAttribute("aria-hidden", "true");
      return slot;
    });
    for (let index = 0; index < ${count}; index++) {
      const [x, y] = layout.cell(Math.floor(index / 6), index % 6);
      const slot = cells[y * layout.cols + x];
      slot.removeAttribute("aria-hidden");
      slot.append(template.cloneNode(true));
    }
    river.replaceChildren(...cells);
  }
  return document.querySelectorAll(".river").length;
})()
`;

const MEASURE = String.raw`
(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) throw new Error("missing " + selector);
    const box = element.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  };
  const css = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) throw new Error("missing " + selector);
    return element.getBoundingClientRect();
  };
  const board = document.querySelector(".board");
  const slots = {};
  for (const zone of ["top", "left", "right", "bottom"]) {
    slots[zone] = document.querySelectorAll(
      "#river-" + zone + " .river > .river-slot",
    ).length;
  }
  const riverSlot = box("#river-top .river-slot");
  const handTile = box(".hand-tile .tile");
  const back = box(".seat-top .rack .tile-back");
  const centre = box(".center");
  const handTiles = [...document.querySelectorAll(".hand-tile")];
  const lastHand = handTiles.at(-1)?.getBoundingClientRect();
  const penultimateHand = handTiles.at(-2)?.getBoundingClientRect();
  return {
    rects: {
      board: rect(".board"),
      playfield: rect(".playfield"),
      handBand: rect(".hand-band"),
      riverTop: rect("#river-top .river"),
      riverLeft: rect("#river-left .river"),
      riverRight: rect("#river-right .river"),
      riverBottom: rect("#river-bottom .river"),
      centre: rect(".center"),
      rackTop: rect(".seat-top .rack"),
      rackLeft: rect(".seat-left .rack"),
      rackRight: rect(".seat-right .rack"),
      hand: rect("#hand"),
      actions: rect(".action-cluster"),
    },
    tile: {
      w: riverSlot.width,
      h: riverSlot.height,
      gap: css("--tile-gap"),
      handW: handTile.width,
      handH: handTile.height,
      backW: back.width,
      backH: back.height,
      centreW: centre.width,
    },
    slots,
    handCount: handTiles.length,
    drawGap:
      lastHand === undefined || penultimateHand === undefined
        ? 0
        : lastHand.x - (penultimateHand.x + penultimateHand.width),
    overflow: [board.scrollWidth, board.clientWidth, board.scrollHeight, board.clientHeight],
    overlay: (() => {
      const image = document.querySelector("#reference-overlay");
      if (image === null) throw new Error("missing #reference-overlay");
      const box = image.getBoundingClientRect();
      return {
        hidden: image.hidden,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        rect: [box.x, box.y, box.width, box.height],
      };
    })(),
  };
})()
`;

const MEASURE_RESULT = String.raw`
(() => {
  const overlay = document.querySelector("#outcome");
  const card = document.querySelector(".result-card");
  if (overlay === null || overlay.hidden || card === null) return null;
  const outer = overlay.getBoundingClientRect();
  const inner = card.getBoundingClientRect();
  return {
    overlay: [outer.x, outer.y, outer.width, outer.height],
    card: [inner.x, inner.y, inner.width, inner.height],
    viewport: [innerWidth, innerHeight],
  };
})()
`;

async function screenshot(cdp: Cdp, sessionId: string, path: string): Promise<void> {
  const { data } = await cdp.send<{ data: string }>({
    method: "Page.captureScreenshot",
    params: { format: "png", captureBeyondViewport: false },
    sessionId,
  });
  await writeFile(path, Buffer.from(data, "base64"));
}

/* -------------------------------------------------------------- server */

export async function startServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const store = new GameStore({ defaultSeed: "layout" });
  const server = createAppServer({ store });
  {
    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, "127.0.0.1", () => resolve());
    await promise;
  }
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("server has no address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: () => {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      server.close((error) => (error === undefined ? resolve() : reject(error)));
      return promise;
    },
  };
}

/* --------------------------------------------------------------- states */

/**
 * Every review state must be the same table. The board, the felt frame, the
 * hand band, the centre panel and the four reserved river blocks are measured
 * against a plain board at the same viewport, so a state that moved the table
 * fails here rather than in a screenshot nobody compared. The result states
 * are the three that open the overlay; the tab names the state.
 */
const STATE_NAMES = ["turn", "claim", "wait", "fishing", "win", "drawn", "result"] as const;

const RESULT_STATES: Readonly<Record<string, true>> = {
  win: true,
  drawn: true,
  result: true,
};

/** Rectangles a review state must not move: everything pinned to the board. */
const FIXED_RECTS = [
  "board",
  "playfield",
  "handBand",
  "centre",
  "riverTop",
  "riverLeft",
  "riverRight",
  "riverBottom",
] as const;

interface StateMeasurement {
  readonly title: string;
  readonly tag: string;
  readonly errors: readonly string[];
  readonly overlay: boolean;
  readonly card: Rect | null;
  readonly rects: Record<string, Rect | null>;
  readonly scroll: readonly [number, number];
}

const STATE_PROBE = String.raw`
(() => {
  window.__pageErrors = [];
  window.addEventListener("error", (event) => window.__pageErrors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => {
    window.__pageErrors.push(String(event.reason));
  });
  const report = console.error.bind(console);
  console.error = (...args) => {
    window.__pageErrors.push(args.map((value) => String(value)).join(" "));
    report(...args);
  };
})();
`;

const MEASURE_STATE = String.raw`
(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (element === null) return null;
    const box = element.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  };
  const tag = document.querySelector("#state-tag");
  return {
    title: document.title,
    tag: tag !== null && !tag.hidden
      ? (tag.querySelector(".state-tag-name")?.textContent ?? "")
      : "",
    errors: window.__pageErrors ?? [],
    overlay: document.querySelector("#outcome")?.hidden === false,
    card: rect("#outcome .result-card"),
    rects: {
      board: rect(".board"),
      playfield: rect(".playfield"),
      handBand: rect(".hand-band"),
      centre: rect(".center"),
      riverTop: rect("#river-top .river"),
      riverLeft: rect("#river-left .river"),
      riverRight: rect("#river-right .river"),
      riverBottom: rect("#river-bottom .river"),
      rackTop: rect(".seat-top .rack"),
      rackLeft: rect(".seat-left .rack"),
      rackRight: rect(".seat-right .rack"),
      hand: rect("#hand"),
      ownMelds: rect("#own-melds"),
    },
    scroll: [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ],
  };
})()
`;

async function statePass(
  cdp: Cdp,
  sessionId: string,
  base: string,
  shots: string,
): Promise<void> {
  await evaluate(
    cdp,
    sessionId,
    `localStorage.setItem("mahjong-rail", "open"); sessionStorage.removeItem("mahjong-game"); true`,
  );

  // A plain board at each size is the shape every state has to match.
  const plain = new Map<number, StateMeasurement>();
  for (const viewport of VIEWPORTS) {
    await setViewport(cdp, sessionId, viewport.width, viewport.height);
    await navigate(cdp, sessionId, base);
    plain.set(viewport.width, await evaluate<StateMeasurement>(cdp, sessionId, MEASURE_STATE));
  }

  console.log("\nreview states");
  console.log("  size      state     title                          overlay");
  for (const viewport of VIEWPORTS) {
    await setViewport(cdp, sessionId, viewport.width, viewport.height);
    const reference = plain.get(viewport.width)!;
    for (const state of STATE_NAMES) {
      const label = `${viewport.width}x${viewport.height} ${state}`;
      await navigate(cdp, sessionId, `${base}/?state=${state}`);
      await waitFor(
        cdp,
        sessionId,
        `document.querySelector("#state-tag")?.hidden === false`,
      );
      const measurement = await evaluate<StateMeasurement>(cdp, sessionId, MEASURE_STATE);

      assert.equal(
        measurement.title,
        `Mahjong — ${state}`,
        `${label}: the tab does not name the state`,
      );
      assert.ok(
        measurement.tag.toLowerCase().includes(state),
        `${label}: the rail does not name the state (${measurement.tag})`,
      );
      assert.deepEqual(measurement.errors, [], `${label}: the page raised a script error`);
      assert.equal(
        measurement.overlay,
        RESULT_STATES[state] === true,
        `${label}: the result overlay is ${measurement.overlay ? "open" : "closed"}`,
      );
      assert.ok(
        measurement.scroll[0] <= viewport.width + 1 &&
          measurement.scroll[1] <= viewport.height + 1,
        `${label}: the page scrolls to ${measurement.scroll.join("x")} in a ${viewport.width}x${viewport.height} window`,
      );

      for (const key of FIXED_RECTS) {
        const rect = measurement.rects[key];
        const expected = reference.rects[key];
        assert.ok(rect !== undefined && rect !== null, `${label}: ${key} is missing`);
        assert.ok(expected !== undefined && expected !== null, `${label}: plain ${key} is missing`);
        assert.ok(
          sameRect(rect, expected),
          `${label}: ${key} moved from ${formatRect(expected)} to ${formatRect(rect)}`,
        );
      }

      // Racks keep their pinned edge even as a meld changes their length.
      const rackTop = measurement.rects.rackTop!;
      const rackLeft = measurement.rects.rackLeft!;
      const rackRight = measurement.rects.rackRight!;
      const frame = measurement.rects.playfield!;
      const board = measurement.rects.board!;
      assert.ok(
        Math.abs(rackTop[1] - reference.rects.rackTop![1]) <= 0.5 &&
          Math.abs(rackLeft[0] - reference.rects.rackLeft![0]) <= 0.5 &&
          Math.abs(rackRight[0] + rackRight[2] - (reference.rects.rackRight![0] + reference.rects.rackRight![2])) <= 0.5,
        `${label}: a rack left its line`,
      );
      for (const rect of [rackTop, rackLeft, rackRight]) {
        assert.ok(
          rect[0] >= frame[0] - 1 &&
            rect[1] >= frame[1] - 1 &&
            rect[0] + rect[2] <= board[0] + board[2] + 1 &&
            rect[1] + rect[3] <= board[1] + board[3] + 1,
          `${label}: a rack ${formatRect(rect)} left the felt`,
        );
      }

      if (measurement.card !== null) {
        const card = measurement.card;
        assert.ok(
          card[0] >= 0 &&
            card[1] >= 0 &&
            card[0] + card[2] <= viewport.width + 1 &&
            card[1] + card[3] <= viewport.height + 1,
          `${label}: the result card ${formatRect(card)} leaves the viewport`,
        );
      }

      // A hand without melds is centred on the board, exactly as a plain
      // board's is; with melds the row is centred as a group, so only the
      // hand's own edge is reported.
      const hand = measurement.rects.hand!;
      const melds = measurement.rects.ownMelds!;
      if (melds[2] === 0) {
        assert.ok(
          Math.abs(hand[0] + hand[2] / 2 - (board[0] + board[2] / 2)) <= 2,
          `${label}: the hand ${formatRect(hand)} is not centred on the board`,
        );
      }
      assert.ok(
        hand[1] + hand[3] <= board[1] + board[3] + 1 && hand[1] >= board[1] - 1,
        `${label}: the hand ${formatRect(hand)} left the board`,
      );

      console.log(
        `  ${`${viewport.width}x${viewport.height}`.padEnd(9)} ${state.padEnd(9)} ` +
          `${measurement.title.padEnd(30)} ${measurement.overlay ? "open" : "closed"} ` +
          `hand ${formatRect(hand)} melds ${formatRect(melds)}`,
      );
      const path = join(shots, `${viewport.width}x${viewport.height}-state-${state}.png`);
      await screenshot(cdp, sessionId, path);
    }
  }
  console.log("  PASS: every state is the plain table at both sizes");
}

/* ---------------------------------------------------------- finish game */

/**
 * Play the human seat with the same pure policy the bots use, so the finished
 * hand is reproducible and is a win rather than a wall exhaustion. `win-252`
 * deals a self-drawn Seven Twins (half limit, 500) with two fishing
 * declarations, which exercises the whole result card.
 */
async function finishedGame(base: string): Promise<string> {
  const post = async (path: string, body: unknown) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return (await response.json()) as ApiPayload;
  };

  let payload = await post("/api/new", { seed: "win-252" });
  if (typeof payload.game !== "string") throw new Error("/api/new returned no game id");
  const game: string = payload.game;
  for (let step = 0; step < 2000; step++) {
    if (payload.view.phase === "finished" || payload.outcome !== null) {
      if (payload.outcome === null) throw new Error("finished without an outcome");
      return game;
    }
    const action = chooseAction(payload.view as unknown as GameView, "E");
    if (action === null) throw new Error(`no legal action at step ${step}`);
    payload = await post("/api/move", { game, action });
    if (payload.error !== undefined) throw new Error(payload.error);
  }
  throw new Error("hand never finished");
}

/* -------------------------------------------------- reference anchors */

/**
 * The fit is measured at the reference's own page: 1512x894 with the rail
 * closed, so the board is the page and reference3.png (whose Safari chrome
 * is cropped at y 88) lands on it one-to-one. Every row prints the
 * reference's number, ours and the delta; the reachable anchors must be
 * inside ±4px, the ones the reference does not draw are reported.
 */
async function referencePass(
  cdp: Cdp,
  sessionId: string,
  base: string,
  shots: string,
): Promise<void> {
  await evaluate(cdp, sessionId, `localStorage.setItem("mahjong-rail", "closed")`);
  await setViewport(cdp, sessionId, REFERENCE_VIEWPORT.width, REFERENCE_VIEWPORT.height);
  await navigate(cdp, sessionId, `${base}/?overlay=1`);

  const label = "1512x894 (reference page, rail closed)";
  const measurement = await evaluate<Measurement>(cdp, sessionId, MEASURE);
  printMeasurement(label, measurement, REFERENCE_VIEWPORT.width);

  const board = measurement.rects.board!;
  const frame = measurement.rects.playfield!;
  const centre = measurement.rects.centre!;
  const hand = measurement.rects.hand!;
  const actions = measurement.rects.actions!;
  const rackTop = measurement.rects.rackTop!;
  const rackLeft = measurement.rects.rackLeft!;
  const rackRight = measurement.rects.rackRight!;
  const riverTop = measurement.rects.riverTop!;

  assert.ok(
    Math.abs(board[0]) <= 1 &&
      Math.abs(board[1]) <= 1 &&
      Math.abs(board[2] - REFERENCE_VIEWPORT.width) <= 1 &&
      Math.abs(board[3] - REFERENCE_VIEWPORT.height) <= 1,
    `${label}: the board ${formatRect(board)} is not the reference's page 1512x894`,
  );

  console.log("\n  anchor                   reference     ours    delta");
  assertAnchor(label, "hand left", 405, hand[0]);
  assertAnchor(label, "hand right", 1106, hand[0] + hand[2]);
  assertAnchor(label, "hand bottom", 823, hand[1] + hand[3]);
  assertAnchor(label, "centre left", 634, centre[0]);
  assertAnchor(label, "centre right", 885, centre[0] + centre[2]);
  assertAnchor(label, "centre top", 302, centre[1]);
  assertAnchor(label, "centre bottom", 465, centre[1] + centre[3]);
  assertAnchor(label, "north rack top", 17, rackTop[1]);
  assertAnchor(label, "north rack height", 45, rackTop[3]);
  // The action row no longer holds a throw button (a tap on a hand tile
  // throws), so its top is whatever the calls need; the reference number only
  // measured the old button stack.
  assertAnchor(label, "action bottom", 890, actions[1] + actions[3]);
  assertAnchor(label, "felt frame top", 9, frame[1]);

  // Anchors whose reference object differs from ours: reported, not fitted.
  anchorRow("north rack left", 515, rackTop[0], "13 concealed backs vs 14 wall tiles");
  anchorRow("north rack right", 996, rackTop[0] + rackTop[2], "same");
  anchorRow("west rack outer", 249, rackLeft[0], "reference skews 40px; the table is symmetric");
  anchorRow("east rack outer", 1303, rackRight[0] + rackRight[2], "same");
  anchorRow("felt frame left", 227, frame[0], "reference felt is a trapezoid");
  anchorRow("felt frame right", 1285, frame[0] + frame[2], "same");
  anchorRow("action bar right", 1090, actions[0] + actions[2], "Tenhou's tool bar, not the turn action");
  anchorRow("river block outer", null, riverTop[1], "the reserved block is not drawn");

  const overlay = measurement.overlay;
  if (overlay.naturalWidth > 0) {
    assert.equal(overlay.naturalWidth, 1512, `${label}: reference3.png is not 1512 wide`);
    assert.equal(overlay.naturalHeight, 982, `${label}: reference3.png is not 982 tall`);
    assert.equal(overlay.hidden, false, `${label}: ?overlay=1 did not show the reference`);
    assertAnchor(label, "overlay left", 0, overlay.rect[0] - board[0]);
    assertAnchor(label, "overlay top", -88, overlay.rect[1] - board[1]);
    assert.ok(
      Math.abs(overlay.rect[2] - 1512) <= 0.5 && Math.abs(overlay.rect[3] - 982) <= 0.5,
      `${label}: the overlay is ${formatRect(overlay.rect)}, expected 1512x982 at native size`,
    );
  } else {
    assert.equal(overlay.hidden, true, `${label}: a missing reference must stay hidden`);
    console.log(
      "  (web/reference3.png is absent — the overlay rect assertions were skipped)",
    );
  }

  // The overlay is a URL flag, not a key: ?overlay=1 shows it, and dropping the
  // flag hides it without moving anything on the board.
  await navigate(cdp, sessionId, `${base}/`);
  const off = await evaluate<Measurement>(cdp, sessionId, MEASURE);
  assert.equal(off.overlay.hidden, true, `${label}: dropping ?overlay=1 kept the overlay`);
  assert.ok(
    sameRect(off.rects.hand!, hand) && sameRect(off.rects.centre!, centre),
    `${label}: hiding the overlay moved the board`,
  );
  await navigate(cdp, sessionId, `${base}/?overlay=1`);
  const on = await evaluate<Measurement>(cdp, sessionId, MEASURE);
  assert.equal(
    on.overlay.hidden,
    overlay.naturalWidth === 0,
    `${label}: ?overlay=1 did not show the overlay again`,
  );

  const path = join(shots, `1512x894-overlay.png`);
  await screenshot(cdp, sessionId, path);
  console.log(`  screenshot       ${path}`);
}

/* ----------------------------------------------------------------- main */

async function main(): Promise<void> {
  const server = await startServer();
  const chromePath = await findChrome();
  const { cdp, sessionId, browser, profile } = await connectChrome(chromePath);
  await cdp.send({
    method: "Page.addScriptToEvaluateOnNewDocument",
    params: { source: STATE_PROBE },
    sessionId,
  });
  const shots = await mkdtemp(join(tmpdir(), "maj-layout-shots-"));

  try {
    await setViewport(cdp, sessionId, VIEWPORTS[0].width, VIEWPORTS[0].height);
    await navigate(cdp, sessionId, server.url);

    const baseline = new Map<string, Rect>();
    for (const viewport of VIEWPORTS) {
      await setViewport(cdp, sessionId, viewport.width, viewport.height);
      for (const count of [0, 13, 18]) {
        await evaluate(cdp, sessionId, FILL_RIVERS(count));
        await evaluate(cdp, sessionId, "new Promise((resolve) => requestAnimationFrame(resolve))");

        const measurement = await evaluate<Measurement>(cdp, sessionId, MEASURE);
        const label = `${viewport.width}x${viewport.height}, ${count} discards`;
        printMeasurement(label, measurement, viewport.width);

        for (const river of RIVERS) {
          assert.equal(
            measurement.slots[river],
            18,
            `${label}: river ${river} must reserve 18 slots`,
          );
        }

        const { w, h, gap, handW, handH, backW, backH } = measurement.tile;
        const board = measurement.rects.board!;
        const frame = measurement.rects.playfield!;
        const centre = measurement.rects.centre!;
        const top = measurement.rects.riverTop!;
        const bottom = measurement.rects.riverBottom!;
        const left = measurement.rects.riverLeft!;
        const right = measurement.rects.riverRight!;
        const rackTop = measurement.rects.rackTop!;
        const rackLeft = measurement.rects.rackLeft!;
        const rackRight = measurement.rects.rackRight!;
        const hand = measurement.rects.hand!;
        const actions = measurement.rects.actions!;

        // The hand is the unit: 14 tiles, their gaps and the drawn tile's
        // gap make 46.43% of the board (the reference's 405..1106).
        assert.ok(
          Math.abs(hand[2] / board[2] - 0.4643) <= 0.01,
          `${label}: hand row is ${(hand[2] / board[2]).toFixed(4)} of the board, expected 0.4643`,
        );
        assert.ok(
          Math.abs(handH / handW - 4 / 3) <= 0.02,
          `${label}: hand tile is ${handW}x${handH}, not the 3:4 tile`,
        );
        assert.ok(
          Math.abs(w / handW - 0.874) <= 0.01,
          `${label}: river tile is ${w}px, expected 0.874 of ${handW}`,
        );
        assert.ok(gap <= 1.5, `${label}: river rows are ${gap}px apart, not flush`);
        assert.ok(
          Math.abs(Math.max(backW, backH) / handW - 0.96) <= 0.012,
          `${label}: concealed back is ${backW}x${backH}, expected 0.96 of ${handW}`,
        );
        // The centre is the hole: one six-tile river block wide, three
        // river rows tall, so the four blocks meet it on every side.
        assert.ok(
          Math.abs(centre[2] - (6 * w + 5 * gap)) <= 1,
          `${label}: centre is ${centre[2]}px wide, expected the six-tile river block ${6 * w + 5 * gap}px`,
        );
        assert.ok(
          Math.abs(centre[3] - (3 * h + 2 * gap)) <= 1,
          `${label}: centre is ${centre[3]}px tall, expected three river rows ${3 * h + 2 * gap}px`,
        );

        const expected: Record<(typeof RIVERS)[number], readonly [number, number]> = {
          top: [6 * w + 5 * gap, 3 * h + 2 * gap],
          bottom: [6 * w + 5 * gap, 3 * h + 2 * gap],
          left: [3 * h + 2 * gap, 6 * w + 5 * gap],
          right: [3 * h + 2 * gap, 6 * w + 5 * gap],
        };
        for (const river of RIVERS) {
          const rect = measurement.rects[`river${river[0]!.toUpperCase()}${river.slice(1)}`]!;
          const [expectedWidth, expectedHeight] = expected[river];
          assert.ok(
            Math.abs(rect[2] - expectedWidth) <= 0.5 &&
              Math.abs(rect[3] - expectedHeight) <= 0.5,
            `${label}: river ${river} is ${formatRect(rect)}, expected ${expectedWidth}x${expectedHeight}`,
          );
          const baselineKey = `${viewport.width}x${viewport.height}:${river}`;
          if (count === 0) baseline.set(baselineKey, rect);
          else {
            assert.ok(
              sameRect(rect, baseline.get(baselineKey)!),
              `${label}: river ${river} changed shape with ${count} discards`,
            );
          }
        }

        // The frame marks the reference's felt edge: 1% from the top, 14.5%
        // from the sides, 4.6% from the bottom.
        assert.ok(
          Math.abs(frame[1] - (board[1] + board[3] * 0.01)) <= 1.5 &&
            Math.abs(board[1] + board[3] - (frame[1] + frame[3]) - board[3] * 0.046) <= 1.5,
          `${label}: frame top/bottom are not 1%/4.6% from the board (${formatRect(frame)} in ${formatRect(board)})`,
        );
        assert.ok(
          Math.abs(frame[0] - (board[0] + board[2] * 0.145)) <= 1.5 &&
            Math.abs(board[0] + board[2] - (frame[0] + frame[2]) - board[2] * 0.145) <= 1.5,
          `${label}: frame sides are not 14.5% from the board (${formatRect(frame)} in ${formatRect(board)})`,
        );

        // The centre is the board's centre column; the four rivers meet its
        // own edges, and the side blocks are centred on its row.
        assert.ok(
          Math.abs(centre[0] + centre[2] / 2 - (board[0] + board[2] / 2)) <= 1,
          `${label}: centre ${formatRect(centre)} is not centred on the board`,
        );
        for (const river of ["riverTop", "riverBottom"] as const) {
          const rect = measurement.rects[river]!;
          assert.ok(
            Math.abs(rect[0] + rect[2] / 2 - (centre[0] + centre[2] / 2)) <= 1,
            `${label}: ${river} ${formatRect(rect)} is not centred on the centre column`,
          );
        }
        for (const river of ["riverLeft", "riverRight"] as const) {
          const rect = measurement.rects[river]!;
          assert.ok(
            Math.abs(rect[1] + rect[3] / 2 - (centre[1] + centre[3] / 2)) <= 1,
            `${label}: ${river} ${formatRect(rect)} is not centred on the centre panel`,
          );
        }
        assert.ok(
          Math.abs(top[1] + top[3] - centre[1]) <= 1 &&
            Math.abs(centre[1] + centre[3] - bottom[1]) <= 1,
          `${label}: north/south rivers do not meet the centre`,
        );
        assert.ok(
          Math.abs(left[0] + left[2] - centre[0]) <= 1 &&
            Math.abs(centre[0] + centre[2] - right[0]) <= 1,
          `${label}: east/west rivers do not meet the centre`,
        );

        // Racks are one line per seat, just inside the felt frame.
        assert.ok(
          rackTop[2] > rackTop[3] && rackLeft[3] > rackLeft[2] && rackRight[3] > rackRight[2],
          `${label}: a concealed rack is not a single line`,
        );
        assert.ok(
          rackTop[1] >= frame[1] - 1 && rackTop[1] < frame[1] + frame[3] && rackTop[0] > frame[0],
          `${label}: north rack ${formatRect(rackTop)} is not inside the felt frame`,
        );
        assert.ok(
          rackLeft[0] >= frame[0] - 1 && rackLeft[0] < frame[0] + frame[2] / 2 &&
            rackRight[0] + rackRight[2] <= frame[0] + frame[2] + 1,
          `${label}: a side rack is not inside the felt frame`,
        );

        // The hand is one row on the bottom edge of the board, above the
        // action row, the drawn tile apart.
        assert.ok(
          Math.abs(hand[0] + hand[2] / 2 - (board[0] + board[2] / 2)) <= 2,
          `${label}: hand is not centred on the board (${formatRect(hand)})`,
        );
        assert.ok(
          hand[0] >= board[0] - 1 && hand[0] + hand[2] <= board[0] + board[2] + 1,
          `${label}: hand ${formatRect(hand)} leaves the board column ${formatRect(board)}`,
        );
        assert.ok(
          hand[1] + hand[3] <= actions[1] + 1,
          `${label}: the hand ${formatRect(hand)} runs into the action row ${formatRect(actions)}`,
        );
        assert.equal(measurement.handCount, 14, `${label}: expected 13 tiles plus the drawn tile`);
        assert.ok(
          measurement.drawGap >= handW * 0.25,
          `${label}: drawn tile gap is ${measurement.drawGap}px, expected a visible break`,
        );

        // Two plain buttons at the bottom right, in the action row.
        assert.ok(
          Math.abs(actions[0] + actions[2] - (board[0] + board[2] - 14)) <= 1 &&
            Math.abs(actions[1] + actions[3] - (board[1] + board[3] - 4)) <= 1,
          `${label}: action cluster ${formatRect(actions)} is not pinned to the felt's bottom right`,
        );
        assert.ok(
          actions[1] + actions[3] <= board[1] + board[3] + 1,
          `${label}: action cluster ${formatRect(actions)} is over the hand`,
        );

        // The board contains its playfield, seats, rivers and hand. The
        // frame and the hand band themselves are containers.
        const keys = Object.keys(measurement.rects).filter(
          (key) => key !== "board" && key !== "playfield" && key !== "handBand",
        );
        for (let first = 0; first < keys.length; first++) {
          for (let second = first + 1; second < keys.length; second++) {
            const a = measurement.rects[keys[first]!]!;
            const b = measurement.rects[keys[second]!]!;
            assert.ok(
              !overlaps(a, b),
              `${label}: ${keys[first]} ${formatRect(a)} overlaps ${keys[second]} ${formatRect(b)}`,
            );
          }
        }

        for (const [key, rect] of Object.entries(measurement.rects)) {
          if (key === "board" || key === "playfield" || key === "handBand") {
            continue;
          }
          assert.ok(
            rect[0] >= board[0] - 1 &&
              rect[1] >= board[1] - 1 &&
              rect[0] + rect[2] <= board[0] + board[2] + 1 &&
              rect[1] + rect[3] <= board[1] + board[3] + 1,
            `${label}: ${key} ${formatRect(rect)} leaves the board ${formatRect(board)}`,
          );
        }
        assert.ok(
          measurement.overflow[0] <= measurement.overflow[1] + 1 &&
            measurement.overflow[2] <= measurement.overflow[3] + 1,
          `${label}: board content overflows ${measurement.overflow.join("/")}`,
        );
        assert.ok(
          actions[1] + actions[3] <= board[1] + board[3] + 1,
          `${label}: the action row leaves the board`,
        );
        for (const [key, rect] of Object.entries(measurement.rects)) {
          assert.ok(
            rect[0] >= -1 &&
              rect[1] >= -1 &&
              rect[0] + rect[2] <= viewport.width + 1 &&
              rect[1] + rect[3] <= viewport.height + 1,
            `${label}: ${key} ${formatRect(rect)} leaves the viewport`,
          );
        }

        console.log(`  intersections    none`);
        const path = join(shots, `${viewport.width}x${viewport.height}-${count}.png`);
        await screenshot(cdp, sessionId, path);
        console.log(`  screenshot       ${path}`);
      }
    }

    // The fit itself: the reference's page, rail closed, overlay on.
    await referencePass(cdp, sessionId, server.url, shots);

    // A real finished hand so the result modal is measured, not imagined.
    const game = await finishedGame(server.url);
    await evaluate(cdp, sessionId, `sessionStorage.setItem("mahjong-game", ${JSON.stringify(game)})`);
    await navigate(cdp, sessionId, server.url);
    await waitFor(cdp, sessionId, `document.querySelector("#outcome")?.hidden === false`);
    for (const viewport of VIEWPORTS) {
      await setViewport(cdp, sessionId, viewport.width, viewport.height);
      const result = await evaluate<{
        overlay: Rect;
        card: Rect;
        viewport: readonly [number, number];
      }>(cdp, sessionId, MEASURE_RESULT);
      if (result === null) throw new Error("result modal did not open");

      const label = `${viewport.width}x${viewport.height}, result overlay`;
      console.log(`\n${label}`);
      console.log(`  result card      ${formatRect(result.card)}`);
      console.log(`  overlay          ${formatRect(result.overlay)} (fixed, covers the viewport)`);
      assert.ok(
        sameRect(result.overlay, [0, 0, viewport.width, viewport.height]),
        `${label}: overlay does not cover the viewport`,
      );
      assert.ok(
        result.card[0] >= 0 &&
          result.card[1] >= 0 &&
          result.card[0] + result.card[2] <= result.viewport[0] + 1 &&
          result.card[1] + result.card[3] <= result.viewport[1] + 1,
        `${label}: result card ${formatRect(result.card)} leaves the viewport`,
      );
      const path = join(shots, `${viewport.width}x${viewport.height}-result.png`);
      await screenshot(cdp, sessionId, path);
      console.log(`  screenshot       ${path}`);
    }

    // Every review state, at both sizes: same table, no script error.
    await statePass(cdp, sessionId, server.url, shots);

    console.log("\nPASS: no measured rectangles intersect at either size.");
    console.log(`Screenshots: ${shots}`);
  } finally {
    cdp.close();
    browser.kill("SIGKILL");
    await server.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
    void profile;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
