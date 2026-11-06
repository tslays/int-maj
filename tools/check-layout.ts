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
    `document.readyState === "complete" && document.querySelector("#pile") !== null`,
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
    if (element === null) return null;
    return element.getBoundingClientRect();
  };
  const board = document.querySelector(".board");
  const slots = {};
  for (const zone of ["top", "left", "right", "bottom"]) {
    slots[zone] = document.querySelectorAll(
      "#river-" + zone + " .river > .river-slot",
    ).length;
  }
  // A fresh deal has no discard yet: the frame is what matters here.
  const riverSlot = box("#pile .discard") ?? { width: 0, height: 0 };
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
      pile: rect("#pile"),
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

export async function startServer(options: {
  seed?: string;
} = {}): Promise<{ url: string; stop: () => Promise<void> }> {
  const store = new GameStore({ defaultSeed: options.seed ?? "layout" });
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
      pile: rect("#pile"),
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
          rect[0] >= board[0] - 1 &&
            rect[1] >= board[1] - 1 &&
            rect[0] + rect[2] <= board[0] + board[2] + 1 &&
            rect[1] + rect[3] <= board[1] + board[3] + 1,
          `${label}: a rack ${formatRect(rect)} left the board`,
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

    for (const viewport of VIEWPORTS) {
      await setViewport(cdp, sessionId, viewport.width, viewport.height);
      await navigate(cdp, sessionId, `${server.url}/?variant=d`);
      await evaluate(cdp, sessionId, "new Promise((resolve) => requestAnimationFrame(resolve))");

      const measurement = await evaluate<Measurement>(cdp, sessionId, MEASURE);
      const label = `${viewport.width}x${viewport.height}`;
      printMeasurement(label, measurement, viewport.width);

      const board = measurement.rects.board!;
      const hand = measurement.rects.hand!;
      const pile = measurement.rects.pile!;
      const actions = measurement.rects.actions!;

      // The hand is one row inside the rim and centred; the pile lives between
      // the seats and the action row without ever reaching the hand.
      assert.ok(
        hand[0] >= board[0] - 1 && hand[0] + hand[2] <= board[0] + board[2] + 1,
        `${label}: hand ${formatRect(hand)} leaves the board`,
      );
      assert.ok(
        Math.abs(hand[0] + hand[2] / 2 - (board[0] + board[2] / 2)) <= 2,
        `${label}: hand is not centred on the board (${formatRect(hand)})`,
      );
      assert.ok(
        pile[1] + pile[3] <= actions[1] + 1,
        `${label}: the pile ${formatRect(pile)} reaches the action row ${formatRect(actions)}`,
      );
      assert.equal(measurement.handCount, 14, `${label}: expected 13 tiles plus the drawn tile`);
      for (const [key, rect] of Object.entries(measurement.rects)) {
        assert.ok(
          rect[0] >= -1 &&
            rect[1] >= -1 &&
            rect[0] + rect[2] <= viewport.width + 1 &&
            rect[1] + rect[3] <= viewport.height + 1,
          `${label}: ${key} ${formatRect(rect)} leaves the viewport`,
        );
      }

      const path = join(shots, `${viewport.width}x${viewport.height}.png`);
      await screenshot(cdp, sessionId, path);
      console.log(`  screenshot       ${path}`);
    }

    // A real finished hand so the result modal is measured, not imagined.
    const game = await finishedGame(server.url);
    await navigate(cdp, sessionId, `${server.url}/?game=${encodeURIComponent(game)}`);
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
      // Variant D shows the result as a strip above the hand, not a modal.
      assert.ok(
        result.overlay[2] <= viewport.width + 1 &&
          result.overlay[3] <= viewport.height + 1,
        `${label}: the result strip ${formatRect(result.overlay)} leaves the viewport`,
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
