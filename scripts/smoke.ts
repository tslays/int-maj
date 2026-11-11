#!/usr/bin/env node
/**
 * Smoke test: the built app in a real browser.
 *
 *   npm run smoke
 *   npm run smoke -- --shots some/dir     # also save a screenshot per board
 *
 * `npm test` covers the engine, the table service and the app's pure modules,
 * but nothing there runs `main.js`, `input.js`, `hints.js` or `result.js`.
 * This builds the app, serves it and drives headless Chromium through it:
 *
 * 1. Every review board (`/?state=...`) opens without an error, draws the
 *    table and shows what that board is for.
 * 2. A fresh game is played like a player would: a tile is tapped and thrown
 *    with the pointer, a tile is dragged into your own order and sorted back,
 *    the hints and the help sheet open, some turns are played against the
 *    bots, and a reload resumes the same hand from the save.
 *
 * It needs Playwright (a dev dependency: `npm ci`) and a Chromium for it
 * (`npx playwright install chromium`; cloud sessions have one already). It is
 * not part of `npm test`, which stays free of installs.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Browser, Page } from "playwright";

import { SCENARIO_NAMES, type ScenarioName } from "../src/table/scenarios.ts";
import { build } from "./build.ts";
import { serve } from "./preview.ts";

/** A phone on its side: the layout the testers use. */
const VIEWPORT = { width: 844, height: 390 };
const READY_MS = 20_000;

/** What the page's debug handle (`window.mahjong`) answers; see app/src/main.js. */
interface Payload {
  readonly seat: string;
  readonly legalActions: readonly { readonly type: string }[];
  readonly outcome: { readonly kind: string } | null;
  readonly wall: { readonly remaining: number };
  readonly table: readonly { readonly seat: string; readonly discards: readonly string[] }[];
  readonly view: {
    readonly phase: string;
    readonly turn: string;
    readonly handNumber: number;
    readonly player: { readonly hand: readonly string[] };
  };
}

declare global {
  interface Window {
    mahjong?: {
      state(): Payload | null;
      busy(): boolean;
      act(action: unknown): Promise<void>;
    };
  }
}

/** What each review board must show, beyond opening cleanly. */
const BOARD_CHECKS: Readonly<Record<ScenarioName, (payload: Payload, page: Page) => Promise<void>>> = {
  turn: async (payload) => {
    assert.equal(payload.view.phase, "discard");
    assert.ok(payload.legalActions.some((action) => action.type === "Discard"), "you may throw a tile");
  },
  claim: async (payload, page) => {
    assert.equal(payload.view.phase, "claim");
    assert.deepEqual(await buttons(page), ["Pass", "Chow"]);
  },
  wait: async (payload, page) => {
    assert.equal(payload.view.phase, "claim");
    assert.ok((await buttons(page)).includes("Pass"));
  },
  fishing: async (payload) => {
    assert.equal(payload.view.phase, "discard");
  },
  announce: async (payload) => {
    assert.ok(payload.legalActions.some((action) => action.type === "DeclareFishing"), "you may declare fishing");
  },
  ron: async (payload, page) => {
    assert.equal(payload.view.phase, "claim");
    assert.ok((await buttons(page)).includes("Mah Jong"), "the winning claim is offered");
  },
  win: async (payload, page) => {
    assert.equal(payload.outcome?.kind, "win");
    await resultCard(page);
  },
  drawn: async (payload, page) => {
    assert.equal(payload.outcome?.kind, "drawn");
    await resultCard(page);
  },
  result: async (payload, page) => {
    assert.equal(payload.outcome?.kind, "win");
    await resultCard(page);
  },
};

async function buttons(page: Page): Promise<string[]> {
  await page.waitForSelector("#actions button", { timeout: READY_MS });
  return page.$$eval("#actions button", (list) => list.map((button) => (button.textContent ?? "").trim()));
}

async function resultCard(page: Page): Promise<void> {
  await page.waitForSelector("#result:not([hidden])", { timeout: READY_MS });
  assert.ok(((await page.textContent("#result")) ?? "").trim().length > 0, "the result card has text");
}

/** Wait until the game has answered and nothing is animating; return the payload. */
async function settled(page: Page): Promise<Payload> {
  await page.waitForFunction(() => window.mahjong?.state() != null && !window.mahjong.busy(), null, {
    timeout: READY_MS,
  });
  return (await page.evaluate(() => window.mahjong!.state())) as Payload;
}

/** Wait until it is your decision (or the hand is over). */
async function yourMove(page: Page): Promise<Payload> {
  await page.waitForFunction(
    () => {
      const handle = window.mahjong;
      const payload = handle?.state();
      if (handle === undefined || payload == null || handle.busy()) return false;
      return payload.legalActions.length > 0 || payload.view.phase === "finished";
    },
    null,
    { timeout: READY_MS },
  );
  return (await page.evaluate(() => window.mahjong!.state())) as Payload;
}

/** A page that fails the run on any script error or console error. */
async function openPage(browser: Browser, errors: string[]): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console error: ${message.text()}`);
  });
  return page;
}

/** The table is drawn: the 3D canvas is not one flat colour. */
async function assertDrawn(page: Page, name: string, shots: string | null): Promise<void> {
  const image = await page.screenshot(shots === null ? {} : { path: join(shots, `${name}.png`) });
  // A blank 844x390 page compresses to a few kilobytes; the table to far more.
  assert.ok(image.byteLength > 40_000, `${name}: the table is drawn (${image.byteLength} bytes of PNG)`);
}

const myDiscards = (payload: Payload) => payload.table.find((entry) => entry.seat === payload.seat)!.discards.length;

async function reviewBoards(browser: Browser, origin: string, shots: string | null): Promise<void> {
  for (const name of SCENARIO_NAMES) {
    const errors: string[] = [];
    const page = await openPage(browser, errors);
    await page.goto(`${origin}/?state=${name}`);
    const payload = await settled(page);
    await BOARD_CHECKS[name](payload, page);
    assert.equal(await page.locator("canvas").count(), 1, `${name}: one canvas`);
    await page.waitForTimeout(400);
    await assertDrawn(page, name, shots);
    assert.deepEqual(errors, [], `${name}: no errors`);
    await page.context().close();
    console.log(`  ok  review board ${name}`);
  }
}

async function playThrough(browser: Browser, origin: string, shots: string | null): Promise<void> {
  const errors: string[] = [];
  const page = await openPage(browser, errors);
  await page.goto(`${origin}/`);
  let payload = await yourMove(page);
  assert.equal(payload.view.handNumber, 1);
  assert.equal(payload.view.phase, "discard", "a new game starts with your throw");
  assert.equal(payload.view.player.hand.length, 14);
  assert.match((await page.textContent("#build-label")) ?? "", /\S+ · \S+/, "the menu shows the build");

  // The hand lies in the strip along the bottom edge, centred.
  const strip = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strip")));
  const handY = VIEWPORT.height - strip / 2;
  const tile = { x: VIEWPORT.width / 2 - 60, y: handY };

  // Drag a tile sideways: the hand is now in your own order, and Sort goes dark.
  assert.equal(await page.getAttribute("#sort", "aria-pressed"), "true");
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  await page.mouse.move(tile.x + 60, tile.y - 4, { steps: 6 });
  await page.mouse.move(tile.x + 170, tile.y - 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#sort")?.getAttribute("aria-pressed") === "false", null, {
    timeout: 5000,
  });
  await page.click("#sort");
  assert.equal(await page.getAttribute("#sort", "aria-pressed"), "true", "Sort puts the hand back in order");
  console.log("  ok  drag a tile into your own order, sort back");

  // By touch, as on a phone: a tap lifts the tile, a second tap throws it.
  // (A mouse pre-selects the tile it hovers over, so there one click throws.)
  await page.waitForTimeout(400);
  await page.touchscreen.tap(tile.x, tile.y);
  await page.waitForTimeout(400);
  assert.equal(myDiscards(await settled(page)), 0, "one tap only lifts the tile");
  await page.touchscreen.tap(tile.x, tile.y);
  await page.waitForFunction(
    () => {
      const payload = window.mahjong?.state();
      return payload != null && payload.table.find((entry) => entry.seat === payload.seat)!.discards.length === 1;
    },
    null,
    { timeout: READY_MS },
  );
  console.log("  ok  tap twice to throw");

  // The hints panel lists hands; its toggle hides it. The help sheet opens and closes.
  payload = await yourMove(page);
  await page.waitForSelector("#closest:not([hidden])", { timeout: READY_MS });
  await page.click("#hints");
  await page.waitForSelector("#closest", { state: "hidden", timeout: 5000 });
  await page.click("#hints");
  await page.waitForSelector("#closest:not([hidden])", { timeout: 5000 });
  await page.click("#options");
  await page.waitForSelector("#options-sheet:not([hidden])", { timeout: 5000 });
  await page.click("#help");
  await page.waitForSelector("#help-sheet:not([hidden])", { timeout: 5000 });
  await page.click("#help-close");
  await page.waitForSelector("#help-sheet", { state: "hidden", timeout: 5000 });
  // A house rule set mid-hand waits for the next deal; the hand on the table keeps its rules.
  await page.click("#rule-companion");
  await page.waitForSelector("#rule-companion[aria-pressed=true]", { timeout: 5000 });
  await page.waitForSelector("#rule-companion-pending:not([hidden])", { timeout: 5000 });
  if ((await page.textContent("#rule-companion-hands"))!.includes("Mixed Pung") === false) {
    throw new Error("the options sheet does not name the hands the house rule leaves out");
  }
  await page.click("#rule-companion");
  await page.waitForSelector("#rule-companion-pending", { state: "hidden", timeout: 5000 });
  await page.click("#options-close");
  await page.waitForSelector("#options-sheet", { state: "hidden", timeout: 5000 });
  console.log("  ok  hints toggle, options sheet, help sheet, house rule switch");

  // Play on against the bots through the same door the buttons use.
  const wallAtStart = payload.wall.remaining;
  for (let decisions = 0; decisions < 5 && payload.view.phase !== "finished"; decisions++) {
    await page.evaluate(async () => {
      const handle = window.mahjong!;
      const actions = handle.state()!.legalActions;
      const pick =
        actions.find((action) => action.type === "Draw") ??
        actions.find((action) => action.type === "Pass") ??
        actions.find((action) => action.type === "Discard") ??
        actions[0];
      await handle.act(pick);
    });
    payload = await yourMove(page);
  }
  assert.ok(payload.wall.remaining < wallAtStart, "the wall goes down as the table plays");
  assert.ok(payload.table.every((entry) => entry.discards.length > 0) || payload.view.phase === "finished", "every seat has thrown");
  await page.waitForTimeout(400);
  await assertDrawn(page, "play", shots);
  console.log(`  ok  played to a wall of ${payload.wall.remaining}`);

  // The game saves after every move: a reload resumes the same hand.
  const before = await settled(page);
  await page.reload();
  const after = await settled(page);
  assert.equal(after.view.handNumber, before.view.handNumber);
  assert.deepEqual(after.view.player.hand, before.view.player.hand, "the same tiles after a reload");
  assert.equal(after.wall.remaining, before.wall.remaining);
  console.log("  ok  reload resumes the saved hand");

  assert.deepEqual(errors, [], "play-through: no errors");
  await page.context().close();
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const shotsOption = option(process.argv.slice(2), "--shots");
const shots = shotsOption === undefined ? null : resolve(shotsOption);
if (shots !== null) await mkdir(shots, { recursive: true });

let chromium: typeof import("playwright").chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed: run `npm ci` (and `npx playwright install chromium` once).");
  process.exit(1);
}

const dist = await mkdtemp(join(tmpdir(), "int-maj-smoke-"));
await build(dist);
const server = await serve(dist, 0);
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await chromium.launch();
let failed = false;
try {
  console.log("Review boards");
  await reviewBoards(browser, origin, shots);
  console.log("A game, as a player");
  await playThrough(browser, origin, shots);
  console.log("Smoke test passed.");
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  server.close();
  await rm(dist, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
