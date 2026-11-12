/**
 * The offline build runs the table with no server, so these tests pin what it
 * depends on:
 *   - a session saved as seed + steps restores to the identical table
 *   - the running scorecard comes from the engine, so it survives a resume
 *   - the in-page API answers like the HTTP one and saves after each move
 *   - `npm run build` emits plain JavaScript that plays a game on its own
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { chooseAction } from "../../src/core/game/bot.ts";
import { ledgerTotals } from "../../src/core/game/settle.ts";
import { SEATS } from "../../src/core/game/state.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { createApiContext, routeApi } from "../../src/table/api.ts";
import {
  GameStore,
  isSessionSnapshot,
  type SessionSnapshot,
  statePayload,
  type StatePayload,
} from "../../src/table/session.ts";
import { createLocalApi, SAVE_KEY, type KeyValueStorage } from "../../src/table/local.ts";
import { build } from "../../scripts/build.ts";
import { seedWithDealer, seedYouDeal } from "../helpers/seeds.ts";

/** Play the human seat with the bot policy until `limit` decisions or the end. */
function playOn(store: GameStore, id: string, limit = Number.POSITIVE_INFINITY): void {
  for (let count = 0; count < limit; count++) {
    const state = store.state(id)!;
    if (state.phase === "finished") return;
    const view = viewFor(state, "E");
    if (view.legalActions.length > 0) {
      const action = chooseAction(view, "E");
      assert.ok(action !== null, "the bot policy always finds a move");
      const moved = store.move(id, action);
      assert.ok(!("error" in moved), "error" in moved ? moved.error : "");
      continue;
    }
    const stepped = store.step(id);
    assert.ok(!("error" in stepped), "a bot step never fails");
  }
}

/** The payload without its game id, which a restore deliberately renews. */
function comparable(payload: StatePayload): Omit<StatePayload, "game"> {
  const { game: _game, ...rest } = payload;
  return rest;
}

function memoryStorage(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("session snapshots", () => {
  it("restores a half-played hand to the identical table", () => {
    const store = new GameStore();
    const { session } = store.create("snapshot-1");
    playOn(store, session.id, 40);
    const snapshot = store.snapshot(session.id)!;
    assert.ok(isSessionSnapshot(JSON.parse(JSON.stringify(snapshot))));

    const other = new GameStore();
    const restored = other.restore(JSON.parse(JSON.stringify(snapshot)));
    assert.ok(!("error" in restored));
    assert.notEqual(restored.session.id, undefined);
    assert.deepEqual(
      comparable(statePayload(restored.session)),
      comparable(statePayload(store.get(session.id)!)),
    );
  });

  it("restores a game whose dice made a bot East, and one saved before the dice", () => {
    const seed = seedWithDealer("snapshot-dice", "S");
    const store = new GameStore();
    const { session } = store.create(seed);
    assert.equal(session.state.dealer, "S");
    playOn(store, session.id, 30);
    const snapshot = store.snapshot(session.id)!;
    assert.equal(snapshot.firstDealer, "S");
    assert.equal(snapshot.dealtByDice, true);

    // From the seed alone (no checkpoint) the dice are thrown again, to the same East.
    const { handStart: _checkpoint, ...bare } = snapshot;
    const fromSeed = new GameStore().restore(JSON.parse(JSON.stringify(bare)));
    assert.ok(!("error" in fromSeed));
    assert.equal(fromSeed.session.state.dealer, "S");
    assert.deepEqual(
      comparable(statePayload(fromSeed.session)),
      comparable(statePayload(store.get(session.id)!)),
    );

    // A save from before the dice has neither field: it was dealt to East.
    const legacyStore = new GameStore();
    const legacySeed = seedYouDeal("snapshot-legacy");
    const legacy = legacyStore.create(legacySeed).session;
    playOn(legacyStore, legacy.id, 20);
    const { firstDealer: _first, dealtByDice: _dice, handStart: _start, ...old } = legacyStore.snapshot(legacy.id)!;
    assert.ok(isSessionSnapshot(JSON.parse(JSON.stringify(old))));
    const revived = new GameStore().restore(JSON.parse(JSON.stringify(old)));
    assert.ok(!("error" in revived));
    assert.equal(revived.session.state.dealer, "E");
  });

  it("restores across finished hands, and undo still works afterwards", () => {
    const store = new GameStore();
    const { session } = store.create("snapshot-2");
    playOn(store, session.id);
    assert.ok(!("error" in store.next(session.id)));
    playOn(store, session.id, 10);

    const other = new GameStore();
    const restored = other.restore(store.snapshot(session.id)!);
    assert.ok(!("error" in restored));
    assert.equal(restored.session.state.handNumber, 2);
    assert.deepEqual(
      comparable(statePayload(restored.session)),
      comparable(statePayload(store.get(session.id)!)),
    );
    const undone = other.undo(restored.session.id);
    assert.ok(!("error" in undone));
  });

  it("resumes a later hand from its checkpoint, not from the seed", () => {
    const store = new GameStore();
    const { session } = store.create("checkpoint-1");
    for (let hand = 0; hand < 3; hand++) {
      playOn(store, session.id);
      assert.ok(!("error" in store.next(session.id)));
    }
    playOn(store, session.id, 12);
    const live = store.get(session.id)!;
    const snapshot = JSON.parse(JSON.stringify(store.snapshot(session.id)!));
    assert.equal(snapshot.handStart.step, live.handStart.step);
    assert.ok(snapshot.handStart.step > 0);

    const restored = new GameStore().restore(snapshot);
    assert.ok(!("error" in restored));
    // Only this hand's events were replayed.
    assert.ok(restored.session.events.length < live.events.length);
    const a = comparable(statePayload(restored.session));
    const b = comparable(statePayload(live));
    assert.deepEqual(a.view, b.view);
    assert.deepEqual(a.scoresBefore, b.scoresBefore);
    assert.deepEqual(a.legalActions, b.legalActions);
    // The full log from the seed is kept, so the game stays reproducible.
    assert.deepEqual(restored.session.steps, live.steps);
  });

  it("never undoes into a hand that has already been paid", () => {
    const store = new GameStore();
    const { session } = store.create("checkpoint-2");
    playOn(store, session.id);
    assert.ok(!("error" in store.next(session.id)));
    // Nothing decided yet in the new hand: the last human step is history.
    const fresh = store.get(session.id)!;
    assert.ok(fresh.humanSteps.length > 0);
    assert.deepEqual(store.undo(session.id), { error: "nothing to undo" });
  });

  it("refuses a snapshot that no longer replays, without storing anything", () => {
    const store = new GameStore();
    const result = store.restore({
      version: 1,
      seed: "broken",
      steps: [{ type: "Discard", seat: "S", tile: "b1" } as never],
      humanSteps: [0],
    });
    assert.ok("error" in result);
    assert.equal(store.get("g1"), undefined);
  });

  it("restarts the hand from its checkpoint when its steps no longer replay", () => {
    const store = new GameStore();
    const { session } = store.create("checkpoint-3");
    playOn(store, session.id);
    assert.ok(!("error" in store.next(session.id)));
    playOn(store, session.id, 6);
    const live = store.get(session.id)!;
    const snapshot = JSON.parse(JSON.stringify(store.snapshot(session.id)!)) as SessionSnapshot;
    assert.ok(snapshot.steps.length > snapshot.handStart!.step, "the second hand has steps to lose");
    // As a newer engine would see it: the hand's first step is no longer legal.
    const steps = [...snapshot.steps];
    steps[snapshot.handStart!.step] = { type: "Discard", seat: "S", tile: "zz" } as never;

    const restored = new GameStore().restore({ ...snapshot, steps });
    assert.ok(!("error" in restored));
    assert.equal(restored.restartedHand, true);
    assert.equal(restored.session.state.handNumber, 2);
    assert.deepEqual(restored.session.steps, live.steps.slice(0, live.handStart.step));
    assert.ok(restored.session.humanSteps.every((index) => index < live.handStart.step));
    const payload = statePayload(restored.session);
    assert.deepEqual(payload.scoresBefore, live.handStart.scoresBefore, "the scores of the finished hand are kept");
    assert.deepEqual(restored.session.state, live.handStart.state);
  });

  it("does not flag an ordinary restore as restarted", () => {
    const store = new GameStore();
    const { session } = store.create("checkpoint-4");
    playOn(store, session.id, 4);
    const restored = new GameStore().restore(store.snapshot(session.id)!);
    assert.ok(!("error" in restored));
    assert.equal(restored.restartedHand, undefined);
  });

  it("rejects malformed snapshots", () => {
    assert.equal(isSessionSnapshot(null), false);
    assert.equal(isSessionSnapshot({ version: 2, seed: "a", steps: [], humanSteps: [] }), false);
    assert.equal(isSessionSnapshot({ version: 1, seed: {}, steps: [], humanSteps: [] }), false);
    assert.equal(isSessionSnapshot({ version: 1, seed: "a", steps: [], humanSteps: [0.5] }), false);
  });
});

describe("playing a hand again", () => {
  it("deals the finished hand again: same tiles, scores from before kept", () => {
    const store = new GameStore();
    const { session } = store.create("retry-1");
    playOn(store, session.id);
    assert.ok(!("error" in store.next(session.id)));
    const dealt = comparable(statePayload(store.get(session.id)!));
    const paid = store.get(session.id)!.handStart.scoresBefore;
    const logged = store.get(session.id)!.steps.length;
    playOn(store, session.id);
    assert.equal(store.get(session.id)!.state.phase, "finished");

    const again = store.retry(session.id);
    assert.ok(!("error" in again));
    assert.equal(again.session.state.phase, "discard");
    assert.equal(again.session.state.handNumber, 2);
    assert.deepEqual(comparable(statePayload(again.session)), dealt, "the same deal, as dealt");
    assert.deepEqual(again.session.handStart.scoresBefore, paid);
    assert.equal(again.session.steps.length, logged, "the abandoned attempt leaves no steps");
    assert.ok(again.session.humanSteps.every((index) => index < again.session.handStart.step));
  });

  it("is repeatable and plays out the same under the same decisions", () => {
    const store = new GameStore();
    const { session } = store.create("retry-2");
    playOn(store, session.id);
    const first = store.get(session.id)!;
    const outcome = statePayload(first).outcome;
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.ok(!("error" in store.retry(session.id)));
      playOn(store, session.id);
      assert.deepEqual(statePayload(store.get(session.id)!).outcome, outcome);
    }
  });

  it("works part-way through a hand, and a saved game restores to the fresh deal", () => {
    const store = new GameStore();
    const { session } = store.create("retry-3");
    const dealt = comparable(statePayload(session));
    playOn(store, session.id, 12);
    const again = store.retry(session.id);
    assert.ok(!("error" in again));
    assert.deepEqual(comparable(statePayload(again.session)), dealt);
    assert.equal(again.session.steps.length, 0);

    const restored = new GameStore().restore(JSON.parse(JSON.stringify(store.snapshot(session.id)!)));
    assert.ok(!("error" in restored));
    assert.deepEqual(comparable(statePayload(restored.session)), dealt);
  });

  it("answers on /api/retry, and refuses an unknown game", () => {
    const context = createApiContext();
    const call = (body: unknown) =>
      routeApi(context, { method: "POST", path: "/api/retry", query: new URLSearchParams(), body });
    const created = routeApi(context, {
      method: "POST",
      path: "/api/new",
      query: new URLSearchParams(),
      body: { seed: seedYouDeal("retry-4") },
    })!.body as { game: string };
    playOn(context.store, created.game, 8);
    const answer = call({ game: created.game })!;
    assert.equal(answer.status, 200);
    const payload = answer.body as { replaceLog?: boolean; view: { turn: string }; legalActions: unknown[] };
    assert.equal(payload.replaceLog, true);
    assert.ok(payload.legalActions.length > 0, "the deal is yours: your first discard is up");
    assert.equal(call({ game: "nope" })!.status, 400);
    assert.equal(call({})!.status, 400);
  });
});

describe("running scores", () => {
  it("carries every finished hand into scoresBefore, zero-sum", () => {
    const store = new GameStore();
    const { session } = store.create("scores-1");
    assert.deepEqual(statePayload(session).scoresBefore, { E: 0, S: 0, W: 0, N: 0 });

    playOn(store, session.id);
    const first = store.get(session.id)!;
    const firstHand = ledgerTotals(first.state).totals;
    // A finished hand is still the current hand: its ledger is on the view.
    assert.deepEqual(statePayload(first).scoresBefore, { E: 0, S: 0, W: 0, N: 0 });

    assert.ok(!("error" in store.next(session.id)));
    const second = statePayload(store.get(session.id)!);
    assert.deepEqual(second.scoresBefore, firstHand);
    const sum = SEATS.reduce((total, seat) => total + second.scoresBefore[seat], 0);
    assert.equal(sum, 0);
  });
});

describe("the in-page API", () => {
  it("answers like the HTTP routes and turns errors into throws", async () => {
    const api = createLocalApi(null);
    const fresh = (await api.request("/api/new", { seed: "local-1" })) as StatePayload;
    assert.equal(fresh.view.player.hand.length, 14);

    const context = createApiContext();
    const http = routeApi(context, {
      method: "POST",
      path: "/api/new",
      query: new URLSearchParams(),
      body: { seed: "local-1" },
    });
    assert.equal(http?.status, 200);
    assert.deepEqual(
      comparable(fresh),
      comparable(JSON.parse(JSON.stringify(http!.body)) as StatePayload),
    );

    await assert.rejects(api.request("/api/state?game=nope"), /unknown game/);
    await assert.rejects(
      api.request("/api/move", { game: fresh.game, action: { type: "Draw", seat: "S" } }),
      /not your turn/,
    );
  });

  it("saves after every move and resumes the same table", async () => {
    const storage = memoryStorage();
    const api = createLocalApi(storage);
    let payload = (await api.request("/api/new", { seed: "local-2" })) as StatePayload;
    for (let moves = 0; moves < 6; moves++) {
      const action = chooseAction(payload.view, payload.seat);
      if (action !== null) {
        payload = (await api.request("/api/move", { game: payload.game, action })) as StatePayload;
        continue;
      }
      const stepped = (await api.request("/api/step", { game: payload.game })) as
        | StatePayload
        | { done: true };
      if ("done" in stepped) break;
      payload = stepped;
    }
    assert.ok(storage.data.has(SAVE_KEY));

    const later = createLocalApi(storage);
    const resumed = later.resume() as StatePayload & { replaceLog: boolean };
    assert.equal(resumed.replaceLog, true);
    assert.deepEqual(resumed.view, payload.view);
    assert.deepEqual(resumed.scoresBefore, payload.scoresBefore);
  });

  it("never lets a review scenario overwrite the saved game", async () => {
    const storage = memoryStorage();
    const api = createLocalApi(storage);
    await api.request("/api/new", { seed: "local-3" });
    const saved = storage.data.get(SAVE_KEY);
    const scenario = (await api.request("/api/scenario?state=turn")) as StatePayload;
    const action = scenario.legalActions.find((entry) => entry.type === "Discard")!;
    await api.request("/api/move", { game: scenario.game, action });
    assert.equal(storage.data.get(SAVE_KEY), saved);
  });

  it("drops a damaged save instead of failing to start", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "{not json");
    assert.equal(createLocalApi(storage).resume(), null);
    assert.equal(storage.data.has(SAVE_KEY), false);
  });
});

describe("the offline build", () => {
  let outDir = "";

  before(async () => {
    outDir = await mkdtemp(join(tmpdir(), "int-maj-build-"));
    await build(outDir);
    // Outside the repo, Node needs to be told the emitted files are modules.
    await writeFile(join(outDir, "package.json"), '{ "type": "module" }\n');
  });

  after(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("serves the 3D table at the start page with the install metadata", async () => {
    const html = await readFile(join(outDir, "index.html"), "utf8");
    assert.match(html, /<script type="module" src="src\/main.js">/);
    assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon.png"/);
    assert.match(html, /serviceWorker\.register\("sw\.js"\)/);
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    assert.match(html, /rel="stylesheet" href="styles.css"/);
    assert.ok((await readFile(join(outDir, "styles.css"), "utf8")).includes("--strip"), "the stylesheet ships");
    assert.match(await readFile(join(outDir, "sw.js"), "utf8"), /"styles\.css"/, "and is cached for offline use");
  });

  it("emits JavaScript only, with no TypeScript imports left", async () => {
    const engine = join(outDir, "engine");
    const files = (await readdir(engine, { recursive: true })).filter((name) => name.endsWith(".js"));
    assert.ok(files.length > 10);
    for (const name of files) {
      const code = await readFile(join(engine, name), "utf8");
      assert.doesNotMatch(code, /from\s*["'][^"']+\.ts["']/, name);
      assert.doesNotMatch(code, /from\s*["']node:/, name);
    }
  });

  it("never ships the private book pages or rule documents", async () => {
    const files = await readdir(outDir, { recursive: true });
    for (const name of files) {
      assert.doesNotMatch(String(name), /^(rules|scans)\b|\.jpe?g$|\.pdf$/i, `${name} must not be published`);
    }
  });

  it("pre-caches every file the page needs", async () => {
    const worker = await readFile(join(outDir, "sw.js"), "utf8");
    for (const file of ["index.html", "src/main.js", "src/board.js", "engine/table/local.js", "assets/faces/dR.svg", "vendor/three/three.module.min.js"]) {
      assert.ok(worker.includes(`"${file}"`), `${file} is cached`);
    }
    assert.match(worker, /cache: "reload"/, "install bypasses the HTTP cache");
  });

  it("plays a hand to the end from the emitted files alone", async () => {
    const built = (await import(pathToFileURL(join(outDir, "engine", "table", "local.js")).href)) as {
      createLocalApi: typeof createLocalApi;
    };
    const api = built.createLocalApi(null);
    let payload = (await api.request("/api/new", { seed: "built-1" })) as StatePayload;
    for (let guard = 0; guard < 2000 && payload.outcome === null; guard++) {
      const action = chooseAction(payload.view, payload.seat);
      if (action !== null) {
        payload = (await api.request("/api/move", { game: payload.game, action })) as StatePayload;
        continue;
      }
      const stepped = (await api.request("/api/step", { game: payload.game })) as
        | StatePayload
        | { done: true };
      if ("done" in stepped) break;
      payload = stepped;
    }
    assert.notEqual(payload.outcome, null, "the hand finished");
  });
});
