/**
 * The table's rhythm audit.
 *
 * The opponents answer in one payload, so the browser lays their throws out in
 * turn. Three things broke in play and each one is measured here:
 *   - a payload never lands two tiles in the same frame (the claim used to
 *     flush the whole queue at once);
 *   - a claim never hurries the throws before it: the beat stays constant
 *     (it used to run a 320 ms catch-up);
 *   - the offer only appears once the tile it names is the last one on the
 *     heap, so it always answers a tile you watched land.
 *
 * The test deals a seed whose first discard is answered with a claim, clicks
 * the first hand tile and samples the page every 50 ms.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { GameStore } from "../src/server/session.ts";
import { viewFor } from "../src/core/game/view.ts";
import {
  connectChrome,
  evaluate,
  findChrome,
  navigate,
  setViewport,
  startServer,
  type Cdp,
} from "../tools/check-layout.ts";

const DISCARD_BEAT_MS = 1000;
/** The heap must never gain two tiles inside one sample. */
const TOLERANCE_MS = 100;

interface Sample {
  readonly t: number;
  readonly tiles: number;
  readonly bar: boolean;
  readonly barTile: string | null;
  readonly lastKey: string | null;
}

interface Rhythm {
  readonly seed: string;
  readonly discards: number;
  readonly claimSeat: string;
}

const DRAW = (actions: readonly unknown[]): unknown =>
  actions.find((action) => (action as { type?: string }).type === "Draw");

/** The order the hand is drawn on screen: the thirteen, then the fresh tile. */
function displayHand(view: ReturnType<typeof viewFor>): string[] {
  const hand = view.player.hand;
  const draw = view.lastDraw;
  if (draw === null || draw.seat !== view.seat) return [...hand];
  const index = hand.lastIndexOf(draw.tile);
  if (index < 0) return [...hand];
  return [...hand.slice(0, index), ...hand.slice(index + 1), hand[index]];
}

/**
 * A seed whose first discard (the first tile on screen, after the automatic
 * draw) is answered by the table with at least two throws and then a claim.
 */
function firstDiscardClaim(): Rhythm {
  for (let attempt = 0; attempt < 400; attempt++) {
    const seed = `rhythm-${attempt}`;
    const store = new GameStore({ defaultSeed: seed });
    let { session } = store.create(seed);
    const id = session.id;
    let throws = 0;

    /** One table decision, exactly as the browser asks for it. */
    const step = (): boolean => {
      const stepped = store.step(id);
      if (!("session" in stepped)) return false;
      session = stepped.session;
      throws += stepped.events.filter((event) => event.type === "Discarded").length;
      return true;
    };
    /** Answer until it is the human's move (or the hand ends). */
    const settle = (): boolean => {
      for (let guard = 0; guard < 80; guard++) {
        const view = viewFor(session.state, session.seat);
        if (view.phase === "finished" || view.legalActions.length > 0) return true;
        if (!step()) return false;
      }
      return false;
    };

    if (!settle()) continue;
    let view = viewFor(session.state, session.seat);
    const draw = DRAW(view.legalActions);
    if (draw !== undefined) {
      const drawn = store.move(id, draw as never);
      if ("error" in drawn) continue;
      session = drawn.session;
      view = viewFor(session.state, session.seat);
    }
    const tile = displayHand(view)[0];
    const discard = view.legalActions.find(
      (action) => action.type === "Discard" && action.tile === tile,
    );
    if (discard === undefined) continue;
    const applied = store.move(id, discard);
    if ("error" in applied) continue;
    session = applied.session;
    throws = 0;
    if (!settle()) continue;

    const after = viewFor(session.state, session.seat);
    if (after.claimWindow === null || throws < 2) continue;
    return { seed, discards: throws, claimSeat: after.claimWindow.discarder };
  }
  throw new Error("no seed produced a claim on the first discard");
}describe("table rhythm", () => {
  let cdp: Cdp;
  let sessionId: string;
  let rhythm: Rhythm;
  let server: { url: string; stop: () => Promise<void> };
  let browser: { kill: () => void };
  let profile: string;

  before(async () => {
    rhythm = firstDiscardClaim();
    server = await startServer({ seed: rhythm.seed });
    const chrome = await connectChrome(await findChrome());
    cdp = chrome.cdp;
    sessionId = chrome.sessionId;
    browser = chrome.browser;
    profile = chrome.profile;
    await setViewport(cdp, sessionId, 1440, 900);
  });

  after(async () => {
    browser.kill();
    await server.stop();
    // Chrome writes its profile as it shuts down; a rushed rm leaves the
    // parent behind and fails the suite after a green test.
    const { rm } = await import("node:fs/promises");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("lands one throw at a time and only asks once the tile is down", async () => {
    await navigate(cdp, sessionId, `${server.url}/`);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const ready = await evaluate<boolean>(
        cdp,
        sessionId,
        `document.querySelectorAll("#hand .hand-tile").length === 14`,
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await evaluate(cdp, sessionId, `(() => {
      window.__rhythm = [];
      window.__rhythmStart = performance.now();
      window.__rhythmTimer = setInterval(() => {
        const pile = document.querySelector("#pile");
        const bar = document.querySelector("#claim-bar");
        const tiles = pile.querySelectorAll(".discard");
        const last = tiles[tiles.length - 1];
        window.__rhythm.push({
          t: Math.round(performance.now() - window.__rhythmStart),
          tiles: tiles.length,
          bar: !bar.hidden,
          barTile: bar.hidden ? null : (bar.querySelector(".claim-head .tile")?.dataset.key ?? null),
          lastKey: last?.dataset.key ?? null,
        });
      }, 50);
      return true;
    })()`);

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

    // The offer is what the queue has to answer; wait for it, then read the tape.
    const claimBy = Date.now() + 20000;
    let seen = false;
    while (Date.now() < claimBy) {
      seen = await evaluate<boolean>(
        cdp,
        sessionId,
        `!document.querySelector("#claim-bar").hidden`,
      );
      if (seen) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Let the sampler see the offer it was waiting for before stopping the tape.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const samples = await evaluate<Sample[]>(
      cdp,
      sessionId,
      `clearInterval(window.__rhythmTimer); window.__rhythm`,
    );
    assert.ok(seen, "the table offers the claim");
    assert.ok(samples.length > 0, "the page was sampled");

    // The tape of landings: the sample where the heap grew, and by how much.
    const landings: { at: number; delta: number; lastKey: string | null }[] = [];
    let previous = 0;
    for (const sample of samples) {
      if (sample.tiles === previous) continue;
      landings.push({ at: sample.t, delta: sample.tiles - previous, lastKey: sample.lastKey });
      previous = sample.tiles;
    }
    for (const landing of landings) {
      assert.equal(landing.delta, 1, `a landing adds one tile, not ${landing.delta}`);
    }
    assert.equal(
      landings.length,
      1 + rhythm.discards,
      `the first discard and the table's ${rhythm.discards} throws land on the heap`,
    );
    for (let index = 1; index < landings.length; index++) {
      const gap = landings[index]!.at - landings[index - 1]!.at;
      assert.ok(
        gap >= DISCARD_BEAT_MS - TOLERANCE_MS,
        `throw ${index + 1} lands ${gap} ms after the one before it; the beat is ${DISCARD_BEAT_MS} ms`,
      );
    }

    const firstBar = samples.find((sample) => sample.bar);
    assert.ok(firstBar !== undefined, "the page records the offer");
    const lastLanding = landings[landings.length - 1]!;
    assert.ok(
      firstBar.t > lastLanding.at,
      `the offer appears at ${firstBar.t} ms, before the last tile landed at ${lastLanding.at} ms`,
    );
    assert.equal(
      firstBar.barTile,
      lastLanding.lastKey,
      `the offer names ${firstBar.barTile}; the last tile on the heap is ${lastLanding.lastKey}`,
    );
  });
});
