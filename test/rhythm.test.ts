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

import { GameStore, type WebSession } from "../src/server/session.ts";
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
/** The pause the table takes after a throw lands before it plays on. */
const DISCARD_SETTLE_MS = 520;
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
}/**
 * A seed whose first discard (you deal) is answered by the bots and comes back
 * to you for a draw - a bot may claim your tile on the way, which is the hard
 * case: the round must still hand you nothing until the last throw has landed.
 */
function returnRoundSeed(): string {
  // Prefer a round where a bot claims your throw: that is the path where the
  // draw used to arrive while the claim's throw was still in the air.
  let fallback: string | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const seed = `round-${attempt}`;
    const store = new GameStore({ defaultSeed: seed });
    let { session } = store.create(seed);
    const id = session.id;
    const opening = viewFor(session.state, session.seat);
    const discard = opening.legalActions.find((action) => action.type === "Discard");
    if (discard === undefined) continue;
    const applied = store.move(id, discard);
    if ("error" in applied) continue;
    session = applied.session;

    let claimed = false;
    let firstStepClaimed = false;
    for (let guard = 0; guard < 40; guard++) {
      const view = viewFor(session.state, session.seat);
      if (view.phase === "finished" || view.legalActions.length > 0) break;
      const stepped = store.step(id);
      if (!("session" in stepped)) break;
      session = stepped.session;
      const botClaim = stepped.events.some(
        (event) => event.type === "Claimed" && event.seat !== session.seat,
      );
      if (botClaim) claimed = true;
      if (guard === 0 && botClaim) firstStepClaimed = true;
    }
    const after = viewFor(session.state, session.seat);
    if (after.claimWindow !== null) continue;
    if (!after.legalActions.some((action) => action.type === "Draw")) continue;
    if (firstStepClaimed) return seed;
    if (claimed) fallback ??= seed;
  }
  if (fallback !== null) return fallback;
  throw new Error("no seed produced a clean round back to the human");
}

/**
 * A pre-claim snapshot with several visible discards: a bot's claim must lift
 * only its tile, not repack the other tiles in the heap.
 */
function botClaimSnapshot(): {
  seed: string;
  snapshot: Omit<WebSession, "id">;
  discards: number;
} {
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = `fixed-pile-${attempt}`;
    const store = new GameStore({ defaultSeed: seed });
    let { session } = store.create(seed);
    const id = session.id;

    for (let guard = 0; guard < 1800; guard++) {
      const view = viewFor(session.state, session.seat);
      if (view.phase === "finished") break;
      if (view.legalActions.length > 0) {
        const action =
          view.legalActions.find((candidate) => candidate.type === "Pass") ??
          view.legalActions.find((candidate) => candidate.type === "Draw") ??
          view.legalActions.find(
            (candidate) => candidate.type === "Discard" && candidate.tile === displayHand(view)[0],
          ) ??
          view.legalActions[0];
        if (action === undefined) break;
        const moved = store.move(id, action);
        if (!("session" in moved)) break;
        session = moved.session;
        continue;
      }

      const before = store.get(id);
      if (before === undefined) break;
      const discards = before.state.players.reduce((sum, player) => sum + player.discards.length, 0);
      const stepped = store.step(id);
      if (!("session" in stepped)) break;
      const claim = stepped.events.find(
        (event) => event.type === "Claimed" && event.seat !== session.seat,
      );
      if (claim !== undefined && discards >= 6 && discards <= 20) {
        const { id: _id, ...snapshot } = before;
        return { seed, snapshot, discards };
      }
      session = stepped.session;
    }
  }
  throw new Error("no bot claim found after enough discards for the fixed-pile audit");
}

describe("table rhythm", () => {
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
      // The settle is taken out of the beat, never added to it.
      assert.ok(
        gap <= DISCARD_BEAT_MS + 250,
        `throw ${index + 1} lands ${gap} ms after the one before it; the settle slowed the table`,
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
  it("never hands you a tile before the last throw has landed", async () => {
    const seed = returnRoundSeed();
    const clean = await startServer({ seed });
    try {
      await navigate(cdp, sessionId, `${clean.url}/`);
      const ready = Date.now() + 12000;
      while (Date.now() < ready) {
        const dealt = await evaluate<boolean>(
          cdp,
          sessionId,
          `document.querySelectorAll("#hand .hand-tile").length === 14`,
        );
        if (dealt) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await evaluate(cdp, sessionId, `(() => {
        window.__tape = [];
        window.__tapeStart = performance.now();
        window.__tapeTimer = setInterval(() => {
          window.__tape.push({
            t: Math.round(performance.now() - window.__tapeStart),
            tiles: document.querySelectorAll("#pile .discard").length,
            hand: document.querySelectorAll("#hand .hand-tile").length,
            call: (() => {
              const label = document.querySelector("#call-out");
              if (label === null || label.hidden) return "";
              return label.textContent.trim().toUpperCase();
            })(),
          });
        }, 40);
        return true;
      })()`);

      const point = await evaluate<{ x: number; y: number }>(
        cdp,
        sessionId,
        `(() => { const tile = document.querySelectorAll("#hand .hand-tile")[0]; const box = tile.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`,
      );
      for (const type of ["mousePressed", "mouseReleased"]) {
        await cdp.send({
          method: "Input.dispatchMouseEvent",
          params: { type, x: point.x, y: point.y, button: "left", clickCount: 1 },
          sessionId,
        });
      }

      // The round comes back to you: hand 14 again, with the table's throws
      // already on the heap.
      const deadline = Date.now() + 20000;
      let drawn = false;
      while (Date.now() < deadline) {
        drawn = await evaluate<boolean>(
          cdp,
          sessionId,
          `(() => {
            const tape = window.__tape;
            const dropped = tape.some((sample) => sample.hand === 13);
            const now = tape[tape.length - 1];
            return dropped && now.hand === 14 && now.tiles >= 1;
          })()`,
        );
        if (drawn) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      const tape = await evaluate<
        { t: number; tiles: number; hand: number; call: string }[]
      >(
        cdp,
        sessionId,
        `clearInterval(window.__tapeTimer); window.__tape`,
      );
      assert.ok(
        drawn,
        `the table comes back to you with a drawn tile: ${JSON.stringify(tape.slice(-4))}`,
      );

      // The last throw before the draw, and the moment the tile appeared.
      const emptyHand = tape.findIndex((sample) => sample.hand === 13);
      assert.ok(emptyHand >= 0, "the hand goes down to thirteen after your throw");
      const drew = tape.findIndex(
        (sample, index) => index > emptyHand && sample.hand === 14,
      );
      assert.ok(drew > emptyHand, "and comes back to fourteen with the draw");
      const drawAt = tape[drew]!.t;
      let landingAt = -1;
      for (let index = 1; index <= drew; index++) {
        if (tape[index]!.tiles > tape[index - 1]!.tiles) landingAt = tape[index]!.t;
      }
      assert.ok(landingAt >= 0, "the round threw at least one tile");

      // The call the round made is spoken once, in one word, before the table
      // moves on - and the draw waits for it to clear.
      const called = tape.find((sample) => sample.call !== "");
      assert.ok(called !== undefined, "the round's call is announced");
      assert.match(
        called.call,
        /^(PUNG|KONG|CHOW|FISHING|MAHJONG)$/,
        `the announcement reads "${called.call}"`,
      );
      const firstLanding = tape.find((sample) => sample.tiles > 0);
      assert.ok(firstLanding !== undefined, "your discarded tile lands first");
      assert.ok(
        called.t - firstLanding.t >= DISCARD_SETTLE_MS - 80,
        `the call appeared ${called.t - firstLanding.t} ms after your discard landed`,
      );
      const cleared = tape.findIndex(
        (sample, index) => index > tape.indexOf(called) && sample.call === "",
      );
      assert.ok(
        cleared > 0 && drawAt >= tape[cleared]!.t,
        `the tile arrived at ${drawAt} ms, before the call cleared at ${cleared > 0 ? tape[cleared]!.t : "never"} ms`,
      );
      assert.ok(
        drawAt - landingAt >= DISCARD_SETTLE_MS - 80,
        `the tile arrived ${drawAt - landingAt} ms after the last throw landed`,
      );
    } finally {
      await clean.stop();
    }
  });
  it("keeps every landed discard at its original spot when a bot claims one", async () => {
    const fixture = botClaimSnapshot();
    const pileStore = new GameStore({ defaultSeed: fixture.seed });
    const game = pileStore.adopt(fixture.snapshot);
    const claimServer = await startServer({ seed: fixture.seed, store: pileStore });
    const gate = await cdp.send<{ identifier: string }>({
      method: "Page.addScriptToEvaluateOnNewDocument",
      params: {
        source: `(() => {
          const realFetch = window.fetch.bind(window);
          let release;
          const gate = new Promise((resolve) => { release = resolve; });
          window.__releasePileStep = release;
          window.fetch = (input, init) => {
            const url = typeof input === "string" ? input : input.url;
            if (url.startsWith("/api/step")) return gate.then(() => realFetch(input, init));
            return realFetch(input, init);
          };
        })();`,
      },
      sessionId,
    });

    try {
      await navigate(cdp, sessionId, `${claimServer.url}/?game=${encodeURIComponent(game.id)}`);
      const readyBy = Date.now() + 12000;
      while (Date.now() < readyBy) {
        const ready = await evaluate<boolean>(
          cdp,
          sessionId,
          `document.querySelectorAll("#pile .discard").length === ${fixture.discards}`,
        );
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      const positions = `(() => [...document.querySelectorAll("#pile .discard")].map((tile) =>
        [tile.dataset.key, tile.style.left, tile.style.top, tile.style.transform].join("|")) )()`;
      const before = await evaluate<string[]>(cdp, sessionId, positions);
      assert.equal(before.length, fixture.discards, "the prepared heap is visible before the call");

      await evaluate(cdp, sessionId, `window.__releasePileStep()`);
      const calledBy = Date.now() + 8000;
      let announced = false;
      while (Date.now() < calledBy) {
        announced = await evaluate<boolean>(
          cdp,
          sessionId,
          `!document.querySelector("#call-out").hidden`,
        );
        if (announced) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.ok(announced, "the bot claim is announced");
      const after = await evaluate<string[]>(cdp, sessionId, positions);
      assert.equal(after.length, before.length - 1, "the claimed discard alone leaves the heap");
      const beforeSet = new Set(before);
      assert.ok(
        after.every((position) => beforeSet.has(position)),
        "every surviving discard keeps its original position, angle and size",
      );
      const afterSet = new Set(after);
      assert.equal(
        before.filter((position) => !afterSet.has(position)).length,
        1,
        "exactly the claimed tile's position is removed",
      );
    } finally {
      // Never leave the page's step fetch parked: the harness must be able to
      // shut down even when an assertion fails before the gate is released.
      await evaluate<boolean>(
        cdp,
        sessionId,
        `(() => { if (typeof window.__releasePileStep === "function") window.__releasePileStep(); return true; })()`,
      ).catch(() => false);
      await cdp.send({
        method: "Page.removeScriptToEvaluateOnNewDocument",
        params: { identifier: gate.identifier },
        sessionId,
      });
      await claimServer.stop();
    }
  });

});
