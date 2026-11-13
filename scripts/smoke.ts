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
 *    a tile is dragged while the bots play (arranged, never thrown),
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

import { newGame } from "../src/core/game/index.ts";
import type { Seat } from "../src/core/game/index.ts";
import { SCENARIO_NAMES, type ScenarioName } from "../src/table/scenarios.ts";
import { build } from "./build.ts";
import { serve } from "./preview.ts";

/** A phone on its side: the layout the testers use. */
const VIEWPORT = { width: 844, height: 390 };
const READY_MS = 20_000;
/**
 * Your next move can wait for a whole round of the bots (three throws, each
 * animated and paced): about 12 s on a cloud container and more on a busy CI
 * runner, too close to READY_MS. A stuck game still fails, just later.
 */
const ROUND_MS = 45_000;

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
    readonly dealer: string;
    readonly player: { readonly hand: readonly string[] };
  };
}

declare global {
  interface Window {
    mahjong?: {
      state(): Payload | null;
      busy(): boolean;
      lifted(): string | null;
      act(action: unknown): Promise<void>;
      sound: { readonly samplesLoaded: number };
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
    // "Play this hand again" deals the same hand from the start.
    const hand = payload.view.handNumber;
    await page.click(".result-again");
    await page.waitForSelector("#result", { state: "hidden", timeout: READY_MS });
    const again = await yourMove(page);
    assert.equal(again.view.handNumber, hand, "the same hand is dealt again");
    assert.equal(again.outcome, null, "the hand is open again");
    assert.ok(again.legalActions.length > 0, "your first discard is up");
  },
  goulash: async (payload, page) => {
    assert.equal(payload.view.phase, "exchange");
    assert.deepEqual(await buttons(page), ["Pass 3 tiles"]);
    await page.waitForSelector("#goulash:not([hidden])", { timeout: READY_MS });
    const banner = (await page.textContent("#goulash")) ?? "";
    assert.match(banner, /Goulash/, "the banner names the Goulash");
    assert.match(banner, /Exchange 1 of 3/, "the banner names the exchange");
    assert.match(banner, /pass to West, opposite you/, "the banner names your partner");
    // Three taps pick the tiles, the button passes them, and the second exchange is announced.
    const strip = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strip")));
    assert.equal(await page.isDisabled("#goulash-confirm"), true, "nothing to pass before three tiles are picked");
    for (const offset of [-150, -30, 90]) {
      await page.touchscreen.tap(VIEWPORT.width / 2 + offset, VIEWPORT.height - strip / 2);
      await page.waitForTimeout(250);
    }
    assert.match((await page.textContent("#goulash-count")) ?? "", /3 of 3 picked/);
    assert.equal(await page.isDisabled("#goulash-confirm"), false, "three picked tiles can be passed");
    await page.click("#goulash-confirm");
    await page.waitForFunction(() => /Exchange 2 of 3/.test(document.querySelector("#goulash")?.textContent ?? ""), null, {
      timeout: READY_MS,
    });
    assert.match((await page.textContent("#goulash")) ?? "", /pass to South, on your right/);
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
  try {
    await page.waitForFunction(
      () => {
        const handle = window.mahjong;
        const payload = handle?.state();
        if (handle === undefined || payload == null || handle.busy()) return false;
        return payload.legalActions.length > 0 || payload.view.phase === "finished";
      },
      null,
      { timeout: ROUND_MS },
    );
  } catch (error) {
    // Say where the table stood, so a failure on a CI runner can be told from a stuck game.
    const where = await page.evaluate(() => ({
      busy: window.mahjong?.busy(),
      phase: window.mahjong?.state()?.view.phase,
      legal: window.mahjong?.state()?.legalActions.map((action) => action.type),
      toast: document.querySelector(".toast")?.textContent ?? null,
    }));
    throw new Error(`waiting for your move timed out: ${JSON.stringify(where)}`, { cause: error });
  }
  return (await page.evaluate(() => window.mahjong!.state())) as Payload;
}

/** A seed whose dice make `dealer` East (the page's `?seed=` pins a game's seed). */
function seedWithDealer(dealer: Seat): string {
  for (let n = 0; n < 200; n++) {
    if (newGame(`smoke-${n}`).state.dealer === dealer) return `smoke-${n}`;
  }
  throw new Error(`no seed dealt to ${dealer}`);
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
  // The dice decide who is East; this walk-through needs the first throw to be yours.
  await page.goto(`${origin}/?seed=${seedWithDealer("E")}`);
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
      // The hand is down to 13 once the tile is thrown (a bot may already have claimed it from the pond).
      return payload != null && payload.view.player.hand.length < 14;
    },
    null,
    { timeout: READY_MS },
  );
  console.log("  ok  tap twice to throw");

  // The bots play on: a mouse over a hand tile pre-selects it (to see its copies in the ponds), and the
  // bots' moves do not put it down again. Only checked while the table is still busy, as a bot's turn
  // can end at any moment (your turn lowers the tile by design).
  await page.mouse.move(tile.x, tile.y);
  await page.waitForTimeout(150);
  for (const wait of [0, 350, 350]) {
    await page.waitForTimeout(wait);
    const seen = await page.evaluate(() => ({ busy: window.mahjong!.busy(), lifted: window.mahjong!.lifted() }));
    if (seen.busy) assert.notEqual(seen.lifted, null, "a hovered tile stays lifted while the bots play");
  }
  console.log("  ok  hover lifts a tile while the bots play");

  // The bots play on: a swipe up on a hand tile throws nothing. The swipe is dispatched as pointer
  // events in one synchronous step, so no bot turn can land between the check and the swipe: if the
  // table is busy at that moment, it stays busy through the swipe. (Our turn returning first makes
  // the swipe a legal throw, so the check only applies while the bots play.)
  assert.equal(await page.evaluate(() => window.mahjong!.busy()), true, "the bots are playing after your throw");
  const thrownBefore = myDiscards((await page.evaluate(() => window.mahjong!.state())) as Payload);
  const swiped = await page.evaluate(
    ({ x, y }) => {
      if (!window.mahjong!.busy()) return false;
      const canvas = document.querySelector("canvas")!;
      // A synthetic pointer is not an active one, so the table's capture calls would throw; the swipe needs none.
      canvas.setPointerCapture = () => undefined;
      canvas.releasePointerCapture = () => undefined;
      const send = (type: string, at: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, { clientX: x, clientY: at, pointerId: 7, pointerType: "mouse", button: 0, bubbles: true, buttons: type === "pointerup" ? 0 : 1 }),
        );
      send("pointerdown", y);
      send("pointermove", y - 40);
      send("pointermove", y - 150);
      send("pointerup", y - 150);
      Reflect.deleteProperty(canvas, "setPointerCapture");
      Reflect.deleteProperty(canvas, "releasePointerCapture");
      return true;
    },
    { x: tile.x, y: tile.y },
  );
  if (swiped) {
    await page.waitForTimeout(400);
    assert.equal(
      myDiscards((await page.evaluate(() => window.mahjong!.state())) as Payload),
      thrownBefore,
      "a swipe up during the bots' turns throws nothing",
    );
    console.log("  ok  a swipe up while the bots play throws nothing");
  } else {
    console.log("  --  your turn came back before the swipe; not a bots'-turn swipe, not counted");
  }

  // A drag sideways during the bots' turns arranges the hand; a drag throws nothing.
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  await page.mouse.move(tile.x + 60, tile.y - 4, { steps: 6 });
  await page.mouse.move(tile.x + 170, tile.y - 4, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("#sort")?.getAttribute("aria-pressed") === "false", null, {
    timeout: 5000,
  });
  assert.equal(
    myDiscards((await page.evaluate(() => window.mahjong!.state())) as Payload),
    thrownBefore,
    "a drag sideways during the bots' turns arranges the hand and throws nothing",
  );
  await page.click("#sort");
  console.log("  ok  arrange the hand while the bots play, nothing thrown");

  // A tile pre-selected by hover while the bots play is still up when your turn (and new tile) arrives.
  await page.mouse.move(tile.x, tile.y);
  payload = await yourMove(page);
  assert.notEqual(await page.evaluate(() => window.mahjong!.lifted()), null, "the pre-selected tile stays up on your turn");
  console.log("  ok  a pre-selected tile stays up when your turn comes");
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height * 0.4); // off the hand: the tile goes down
  await page.waitForTimeout(300);

  // A tap on the ponds zooms onto them from above; a second tap goes back.
  payload = await yourMove(page);
  const zoomed = () => page.evaluate(() => document.documentElement.classList.contains("pond-zoom"));
  await page.touchscreen.tap(VIEWPORT.width / 2, VIEWPORT.height * 0.4);
  assert.equal(await zoomed(), true, "a tap on the ponds zooms in");
  await page.waitForTimeout(500);
  await page.touchscreen.tap(tile.x, tile.y);
  assert.equal(await zoomed(), false, "a tap anywhere zooms back");
  await page.waitForTimeout(500);
  // At most the one tile thrown: a bot that claimed it has taken it out of the pond, so 0 is fine too.
  assert.ok(myDiscards(await settled(page)) <= 1, "the zoom taps throw nothing");
  console.log("  ok  tap the ponds to zoom, tap to go back");

  // The hints panel lists hands; its toggle hides it. The help sheet opens and closes.
  payload = await yourMove(page);
  await page.waitForSelector("#closest:not([hidden])", { timeout: READY_MS });
  await page.click("#hints");
  await page.waitForSelector("#closest", { state: "hidden", timeout: 5000 });
  await page.click("#hints");
  await page.waitForSelector("#closest:not([hidden])", { timeout: 5000 });
  // A listed hand opens its sheet, which shows the book's picture of the hand.
  if ((await page.locator(".closest-item").count()) > 0) {
    await page.click(".closest-item");
    await page.waitForSelector("#hand-detail:not([hidden]) .detail-lede", { timeout: 5000 });
    const pictured = await page.locator("#hand-detail .sample-tiles .chip").count();
    const sheet = (await page.textContent("#hand-detail")) ?? "";
    if (pictured < 14 && !sheet.includes("without a picture")) {
      throw new Error("the hand sheet shows neither the book's sample hand nor that there is none");
    }
    await page.click("#hand-detail .detail-close");
    await page.waitForSelector("#hand-detail", { state: "hidden", timeout: 5000 });
  }
  await page.click("#options");
  await page.waitForSelector("#options-sheet:not([hidden])", { timeout: 5000 });
  await page.click("#help");
  await page.waitForSelector("#help-sheet:not([hidden])", { timeout: 5000 });
  await page.click("#help-close");
  await page.waitForSelector("#help-sheet", { state: "hidden", timeout: 5000 });
  // Pace is a device preference that takes effect at once.
  await page.click('#pace [data-pace="faster"]');
  await page.waitForSelector('#pace [data-pace="faster"][aria-checked=true]', { timeout: 5000 });
  if ((await page.evaluate(() => localStorage.getItem("int-maj.pace"))) !== "faster") {
    throw new Error("the pace choice is not remembered on the device");
  }
  await page.click('#pace [data-pace="normal"]');
  // A house rule set mid-hand waits for the next deal; the hand on the table keeps its rules.
  await page.click('#hand-set [data-set="companion"]');
  await page.waitForSelector('#hand-set [data-set="companion"][aria-checked=true]', { timeout: 5000 });
  await page.waitForSelector("#hand-set-pending:not([hidden])", { timeout: 5000 });
  if ((await page.textContent("#hand-set-note"))!.includes("Mixed Pung") === false) {
    throw new Error("the options sheet does not name the hands the hand set leaves out");
  }
  await page.click('#hand-set [data-set="companion-pictured"]');
  if ((await page.textContent("#hand-set-note"))!.includes("Robin") === false) {
    throw new Error("the pictured hand set does not name the hands without a picture");
  }
  await page.click('#hand-set [data-set="all"]');
  await page.waitForSelector("#hand-set-pending", { state: "hidden", timeout: 5000 });
  // New game asks first; Keep playing leaves the game as it was.
  await page.click("#new-game");
  await page.waitForSelector("#new-game-confirm:not([hidden])", { timeout: 5000 });
  await page.click("#new-game-keep");
  await page.waitForSelector("#new-game-confirm", { state: "hidden", timeout: 5000 });
  await page.click("#options-close");
  await page.waitForSelector("#options-sheet", { state: "hidden", timeout: 5000 });
  console.log("  ok  hints toggle, options sheet, help sheet, hand set choice, new game asks first");


  // The index of all hands: opens, filters by a book heading, searches, opens a hand's sheet.
  await page.click("#index-open");
  await page.waitForSelector("#hand-index:not([hidden]) .index-card", { timeout: READY_MS });
  assert.equal(await page.locator(".index-card").count(), 89, "every catalogue hand is listed");
  await page.click('.index-chip:has-text("Two Suits")');
  assert.equal(await page.locator(".index-card").count(), 3, "the book files three hands under Two Suits");
  await page.fill("#index-search", "knitting");
  assert.equal(await page.locator(".index-card").count(), 1);
  await page.click(".index-card");
  await page.waitForSelector("#hand-detail:not([hidden])", { timeout: 5000 });

  // Pinning from the sheet puts the hand in the panel's first place; a second pin takes the second.
  const panelNames = () => page.locator("#closest .closest-name").allTextContents();
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForSelector("#hand-detail", { state: "hidden", timeout: 5000 });
  };
  await page.click('.pin-button[aria-label="Pin to hints"]');
  await page.waitForSelector('.pin-button[aria-label="Unpin from hints"]', { timeout: 5000 });
  await closeSheet();
  await page.waitForFunction(() => /knitting/i.test(document.querySelector("#closest .closest-name")?.textContent ?? ""));
  await page.click('.index-chip:has-text("All hands")'); // the Two Suits heading is still chosen
  await page.fill("#index-search", "wriggly");
  await page.click(".index-card");
  await page.waitForSelector("#hand-detail:not([hidden])", { timeout: 5000 });
  await page.click('.pin-button[aria-label="Pin to hints"]');
  await closeSheet();
  await page.waitForFunction(() => document.querySelectorAll("#closest .pin-icon").length === 2);
  let names = await panelNames();
  assert.equal(names.length, 3, "two pins and one suggestion fill the three places");
  assert.match(names[0]!, /knitting/i);
  assert.match(names[1]!, /wriggly snake/i);
  assert.equal(await page.locator("#closest .closest-name .pin-icon").count(), 2, "only the pins are marked");
  assert.ok(await page.locator('.index-card.is-pinned').count() === 1, "the card of a pinned hand is marked");

  // Unpinning the first lets the second take its place and the suggestions come back.
  await page.click("#index-close");
  await page.waitForSelector("#hand-index", { state: "hidden", timeout: 5000 });
  await page.click("#closest .closest-item >> nth=0");
  await page.waitForSelector("#hand-detail:not([hidden])", { timeout: 5000 });
  await page.click('.pin-button[aria-label="Unpin from hints"]');
  await closeSheet();
  await page.waitForFunction(() => document.querySelectorAll("#closest .pin-icon").length === 1);
  names = await panelNames();
  assert.equal(names.length, 3);
  assert.match(names[0]!, /wriggly snake/i, "the remaining pin is the first hint now");
  await page.click("#closest .closest-item >> nth=0");
  await page.waitForSelector("#hand-detail:not([hidden])", { timeout: 5000 });
  await page.click('.pin-button[aria-label="Unpin from hints"]');
  await closeSheet();
  await page.waitForFunction(() => document.querySelectorAll("#closest .pin-icon").length === 0);
  assert.equal((await panelNames()).length, 3, "the suggestions fill all three places again");
  console.log("  ok  index of all hands, pinning to the hints");

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

/** The opening of a game: the throw for East, the throw for the wall, the deal; and how to skip it. */
async function opening(browser: Browser, origin: string, shots: string | null): Promise<void> {
  const watch = () => {
    // Record whether the opening's layer ever stood on the page.
    (window as unknown as { openingSeen: boolean }).openingSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(".opening") !== null) (window as unknown as { openingSeen: boolean }).openingSeen = true;
    }).observe(document, { childList: true, subtree: true });
  };

  // A bot wins the throw: the dice are shown, then the wall's, then the deal; the bot throws first.
  {
    const errors: string[] = [];
    const page = await openPage(browser, errors);
    await page.addInitScript(watch);
    const seed = seedWithDealer("W");
    await page.goto(`${origin}/?seed=${seed}`);
    // All four seats throw, under the title "Who is East?" (checked at once: the card moves on in about two seconds).
    await page.waitForFunction(
      () => document.querySelectorAll(".opening-row .die").length === 8 && document.querySelector(".opening-card h2")?.textContent === "Who is East?",
      null,
      { timeout: READY_MS },
    );
    await page.waitForFunction(() => /\d/.test(document.querySelector(".opening-row.east .opening-total")?.textContent ?? ""), null, {
      timeout: READY_MS,
    });
    if (shots !== null) await page.screenshot({ path: join(shots, "opening-east.png") });
    await page.waitForFunction(() => /for the wall/.test(document.querySelector(".opening-card h2")?.textContent ?? ""), null, {
      timeout: READY_MS,
    });
    await page.waitForFunction(() => /Wind's wall/.test(document.querySelector(".opening-note")?.textContent ?? ""), null, {
      timeout: READY_MS,
    });
    await page.waitForSelector(".opening", { state: "detached", timeout: READY_MS });
    const payload = await yourMove(page);
    assert.equal(payload.view.dealer, "W", "the dice made West East");
    assert.equal(payload.view.handNumber, 1);
    assert.ok(
      payload.table.find((entry) => entry.seat === "W")!.discards.length > 0,
      "the bot that is East threw first",
    );
    await assertDrawn(page, "opening-dealt", shots);
    assert.deepEqual(errors, [], "opening: no errors");
    await page.context().close();
    console.log("  ok  the opening: dice for East, the wall's dice, the deal");
  }

  // A tap skips what is left, and the hand is the same.
  {
    const errors: string[] = [];
    const page = await openPage(browser, errors);
    await page.goto(`${origin}/?seed=${seedWithDealer("S")}`);
    await page.waitForSelector(".opening", { timeout: READY_MS });
    const started = Date.now();
    await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 3);
    await page.waitForSelector(".opening", { state: "detached", timeout: 3000 });
    assert.ok(Date.now() - started < 3000, "a tap cuts the opening short");
    // The tap started audio, which fetched and decoded the dice recordings from the built app.
    await page.waitForFunction(() => window.mahjong?.sound.samplesLoaded === 4, null, {
      timeout: 10_000,
    });
    const payload = await yourMove(page);
    assert.equal(payload.view.dealer, "S");
    assert.ok(payload.view.player.hand.length >= 13, "the deal is complete");
    assert.deepEqual(errors, [], "skipped opening: no errors");
    await page.context().close();
    console.log("  ok  a tap skips the opening");
  }

  // Dice and dealing set to Skip: no opening at all, and the choice is remembered.
  {
    const errors: string[] = [];
    const page = await openPage(browser, errors);
    await page.goto(`${origin}/?seed=${seedWithDealer("N")}`);
    await page.waitForSelector(".opening", { timeout: READY_MS });
    await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 3);
    await yourMove(page);
    await page.click("#options");
    await page.waitForSelector("#options-sheet:not([hidden])", { timeout: 5000 });
    await page.click('#opening-pref [data-opening="off"]');
    await page.waitForSelector('#opening-pref [data-opening="off"][aria-checked=true]', { timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("int-maj.opening")), "off", "the choice is remembered");
    await page.context().close();

    const fresh = await openPage(browser, errors);
    await fresh.addInitScript(watch);
    await fresh.addInitScript(() => localStorage.setItem("int-maj.opening", "off"));
    await fresh.goto(`${origin}/?seed=${seedWithDealer("E")}`);
    const payload = await yourMove(fresh);
    assert.equal(payload.view.dealer, "E");
    assert.equal(payload.view.player.hand.length, 14);
    assert.equal(await fresh.evaluate(() => (window as unknown as { openingSeen: boolean }).openingSeen), false, "no opening when it is off");
    assert.deepEqual(errors, [], "opening off: no errors");
    await fresh.context().close();
    console.log("  ok  Dice and dealing set to Skip goes straight to play");
  }
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
  console.log("The opening of a hand");
  await opening(browser, origin, shots);
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
