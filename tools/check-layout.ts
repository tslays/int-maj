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
  labelTop: "north label",
  labelLeft: "west label",
  labelRight: "east label",
  selfLabel: "your label",
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

/* ------------------------------------------------------------- browser */

interface CdpOptions {
  readonly method: string;
  readonly params?: Record<string, unknown>;
  readonly sessionId?: string;
}

class Cdp {
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

async function findChrome(): Promise<string> {
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

async function connectChrome(chromePath: string): Promise<{
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

async function evaluate<T>(cdp: Cdp, sessionId: string, expression: string): Promise<T> {
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

async function setViewport(cdp: Cdp, sessionId: string, width: number, height: number): Promise<void> {
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

async function navigate(cdp: Cdp, sessionId: string, url: string): Promise<void> {
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
  for (const river of document.querySelectorAll(".river")) {
    const cells = [];
    for (let index = 0; index < 18; index++) {
      const slot = document.createElement("div");
      slot.className = "river-slot";
      if (index < ${count}) slot.append(template.cloneNode(true));
      else slot.setAttribute("aria-hidden", "true");
      cells.push(slot);
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
      labelTop: rect("#label-top"),
      labelLeft: rect("#label-left"),
      labelRight: rect("#label-right"),
      selfLabel: rect("#self-label"),
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

async function startServer(): Promise<{ url: string; stop: () => Promise<void> }> {
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

/* ----------------------------------------------------------------- main */

async function main(): Promise<void> {
  const server = await startServer();
  const chromePath = await findChrome();
  const { cdp, sessionId, browser, profile } = await connectChrome(chromePath);
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

        const { w, h, gap, handW, handH, backW, backH, centreW } = measurement.tile;
        // Mahjong Soul's scale, expressed only in ratios of the hand unit.
        assert.ok(
          handW / viewport.width >= 0.06 && handW / viewport.width <= 0.07,
          `${label}: hand tile is ${handW}px (${((handW / viewport.width) * 100).toFixed(2)}% of the viewport), expected about 7%`,
        );
        assert.ok(
          Math.abs(handH / handW - 4 / 3) <= 0.02,
          `${label}: hand tile is ${handW}x${handH}, not the 3:4 tile`,
        );
        assert.ok(
          Math.abs(w / handW - 0.62) <= 0.01,
          `${label}: river tile is ${w}px, expected 0.62 of ${handW}`,
        );
        assert.ok(gap <= 1.5, `${label}: river rows are ${gap}px apart, not flush`);
        assert.ok(
          Math.abs(Math.max(backW, backH) / handW - 0.33) <= 0.012,
          `${label}: concealed back is ${backW}x${backH}, expected 0.33 of ${handW}`,
        );
        assert.ok(
          Math.abs(centreW / handW - 1.9) <= 0.02,
          `${label}: centre is ${centreW}px wide, expected 1.9 of ${handW}`,
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

        const board = measurement.rects.board!;
        const frame = measurement.rects.playfield!;
        const centre = measurement.rects.centre!;
        const top = measurement.rects.riverTop!;
        const bottom = measurement.rects.riverBottom!;
        const left = measurement.rects.riverLeft!;
        const right = measurement.rects.riverRight!;

        // The frame: 3% in from the sides, 12% from the top, 2% from the
        // bottom, a one-tile-wide band of felt outside it.
        assert.ok(
          Math.abs(frame[0] - (board[0] + board[2] * 0.03)) <= 1.5 &&
            Math.abs(board[0] + board[2] - (frame[0] + frame[2]) - board[2] * 0.03) <= 1.5,
          `${label}: frame sides are not 3% from the board (${formatRect(frame)} in ${formatRect(board)})`,
        );
        assert.ok(
          Math.abs(frame[1] - (board[1] + board[3] * 0.12)) <= 1.5 &&
            Math.abs(board[1] + board[3] - (frame[1] + frame[3]) - board[3] * 0.02) <= 1.5,
          `${label}: frame top/bottom are not 12%/2% from the board (${formatRect(frame)} in ${formatRect(board)})`,
        );

        // The centre is dead centre of the play area, and the four rivers
        // are centred in front of their seats, meeting around it.
        const frameCx = frame[0] + frame[2] / 2;
        const frameCy = frame[1] + frame[3] / 2;
        assert.ok(
          Math.abs(centre[0] + centre[2] / 2 - frameCx) <= 1 &&
            Math.abs(centre[1] + centre[3] / 2 - frameCy) <= 1,
          `${label}: centre ${formatRect(centre)} is not the centre of the frame ${formatRect(frame)}`,
        );
        for (const river of ["riverTop", "riverBottom"] as const) {
          const rect = measurement.rects[river]!;
          assert.ok(
            Math.abs(rect[0] + rect[2] / 2 - frameCx) <= 1,
            `${label}: ${river} ${formatRect(rect)} is not centred on the table`,
          );
        }
        for (const river of ["riverLeft", "riverRight"] as const) {
          const rect = measurement.rects[river]!;
          assert.ok(
            Math.abs(rect[1] + rect[3] / 2 - frameCy) <= 1,
            `${label}: ${river} ${formatRect(rect)} is not centred on the table`,
          );
        }
        assert.ok(
          Math.abs(top[0] - (left[0] + left[2])) <= 1 &&
            Math.abs(top[0] + top[2] - right[0]) <= 1,
          `${label}: north/side rivers do not meet at their corners`,
        );
        assert.ok(
          Math.abs(top[1] + top[3] - centre[1]) <= 1 &&
            Math.abs(centre[1] + centre[3] - bottom[1]) <= 1,
          `${label}: north/south rivers do not meet the centre`,
        );

        // Racks are one line per seat, not a block.
        const rackTop = measurement.rects.rackTop!;
        const rackLeft = measurement.rects.rackLeft!;
        const rackRight = measurement.rects.rackRight!;
        assert.ok(
          rackTop[2] > rackTop[3] && rackLeft[3] > rackLeft[2] && rackRight[3] > rackRight[2],
          `${label}: a concealed rack is not a single line`,
        );

        // The hand is one row at the bottom, the drawn tile apart.
        const hand = measurement.rects.hand!;
        assert.ok(
          Math.abs(hand[0] + hand[2] / 2 - viewport.width / 2) <= 2,
          `${label}: hand is not centred (${formatRect(hand)})`,
        );
        assert.equal(measurement.handCount, 14, `${label}: expected 13 tiles plus the drawn tile`);
        assert.ok(
          measurement.drawGap >= handW * 0.25,
          `${label}: drawn tile gap is ${measurement.drawGap}px, expected a visible break`,
        );

        // Two actions at the bottom right, on the felt, never over the hand.
        const actions = measurement.rects.actions!;
        assert.ok(
          Math.abs(actions[0] + actions[2] - (board[0] + board[2] - 14)) <= 1 &&
            Math.abs(actions[1] + actions[3] - (board[1] + board[3] - 12)) <= 1,
          `${label}: action cluster ${formatRect(actions)} is not pinned to the felt's bottom right`,
        );
        assert.ok(
          actions[1] + actions[3] <= board[1] + board[3] + 1,
          `${label}: action cluster ${formatRect(actions)} is over the hand`,
        );

        // The board contains its playfield, seats and rivers; the hand band
        // sits below it. The frame and the band themselves are containers.
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
          if (
            key === "board" ||
            key === "playfield" ||
            key === "handBand" ||
            key === "selfLabel" ||
            key === "hand"
          ) {
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
        const handBand = measurement.rects.handBand!;
        assert.ok(
          measurement.overflow[0] <= measurement.overflow[1] + 1 &&
            measurement.overflow[2] <= measurement.overflow[3] + 1,
          `${label}: board content overflows ${measurement.overflow.join("/")}`,
        );
        assert.ok(
          handBand[1] >= board[1] + board[3] - 1,
          `${label}: hand band ${formatRect(handBand)} overlaps the board ${formatRect(board)}`,
        );
        const selfLabel = measurement.rects.selfLabel!;
        assert.ok(
          selfLabel[0] >= handBand[0] - 1 &&
            selfLabel[1] >= handBand[1] - 1 &&
            selfLabel[1] + selfLabel[3] <= handBand[1] + handBand[3] + 1 &&
            hand[0] >= handBand[0] - 1 &&
            hand[1] >= handBand[1] - 1 &&
            hand[1] + hand[3] <= handBand[1] + handBand[3] + 1,
          `${label}: the hand or your label leaves the hand band`,
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

await main();
