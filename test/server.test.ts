/**
 * The web API is a thin projection of the engine, so these tests pin the
 * contracts the browser depends on:
 *   - the payload shape (view, legal actions, table, checker, outcome)
 *   - no opponent concealed hand ever appears in a payload
 *   - an illegal move returns the reducer's wording and changes nothing
 *   - a legal move advances the hand
 *   - the wait panel is exactly check.ts's own report for the same tiles
 */

import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import {
  apply,
  isApplyError,
  serialize,
  type Action,
} from "../src/core/game/index.ts";
import { checkHand } from "../src/core/check.ts";
import { tileKey } from "../src/core/tiles.ts";
import { createAppServer } from "../src/server/server.ts";
import { GameStore, type StatePayload } from "../src/server/session.ts";

interface ApiPayload extends StatePayload {
  readonly events: readonly string[];
}

interface ApiError {
  readonly error: string;
}

const TILE_KEY = /^(?:[bco][1-9]|w[ESWN]|d[RGW]|f[1-4]|s[1-4])$/;

let store: GameStore;
let server: Server;
let baseUrl = "";

before(async () => {
  store = new GameStore({ defaultSeed: "api-test" });
  server = createAppServer({ store });
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.closeAllConnections();
  const { promise, resolve } = Promise.withResolvers<void>();
  server.close(() => resolve());
  await promise;
});

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

async function getState(game: string): Promise<ApiPayload> {
  const response = await fetch(`${baseUrl}/api/state?game=${encodeURIComponent(game)}`);
  assert.equal(response.status, 200);
  return (await response.json()) as ApiPayload;
}

describe("web API", () => {
  it("serves the page, the module and the stylesheet", async () => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await page.text(), /<title>Mahjong table<\/title>/);

    const script = await fetch(`${baseUrl}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /text\/javascript/);
    assert.match(await script.text(), /async function api/);

    const style = await fetch(`${baseUrl}/app.css`);
    assert.equal(style.status, 200);
    assert.match(style.headers.get("content-type") ?? "", /text\/css/);
  });

  it("returns the seat view, legal actions, table, ledger and wait panel", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-shape" });
    assert.equal(created.status, 200);
    const payload = created.body;

    assert.equal(typeof payload.game, "string");
    assert.equal(payload.seat, "E");
    assert.equal(payload.seed, "api-shape");
    assert.equal(payload.view.seat, "E");
    assert.equal(payload.view.player.hand.length, 13);
    assert.equal(payload.view.opponents.length, 3);
    assert.equal(payload.wallRemaining, payload.view.wallRemaining);
    assert.deepEqual(payload.legalActions, [{ type: "Draw", seat: "E" }]);
    assert.equal(payload.table.length, 4);
    assert.deepEqual(
      payload.table.map((entry) => entry.seat),
      ["E", "S", "W", "N"],
    );
    for (const entry of payload.table) {
      assert.equal(typeof entry.wind, "string");
      assert.equal(typeof entry.handCount, "number");
      assert.ok(Array.isArray(entry.melds));
      assert.ok(Array.isArray(entry.discards));
      assert.ok(Array.isArray(entry.flowers));
      assert.ok(Array.isArray(entry.seasons));
    }
    assert.ok(Array.isArray(payload.ledger));
    assert.equal(payload.checker.size, 13);
    assert.ok(Array.isArray(payload.checker.waits));
    assert.equal(payload.outcome, null);
    assert.ok(payload.events.some((line) => line.startsWith("E is dealt 13 tiles")));
  });

  it("never puts another seat's concealed tiles in a payload", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-hidden" });
    const game = created.body.game;

    const drawn = await post<ApiPayload>("/api/move", {
      game,
      action: { type: "Draw", seat: "E" },
    });
    assert.equal(drawn.status, 200);
    const discard = drawn.body.legalActions.find(
      (action) => action.type === "Discard",
    );
    assert.ok(discard !== undefined);
    const played = await post<ApiPayload>("/api/move", { game, action: discard });
    assert.equal(played.status, 200);

    const state = store.state(game);
    assert.ok(state !== undefined);
    const payload = await getState(game);

    const occurrences: { path: string; key: string }[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        if (TILE_KEY.test(value)) occurrences.push({ path, key: value });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          walk(child, path.length === 0 ? key : `${path}.${key}`);
        }
      }
    };
    walk(payload, "");

    const allowed = [
      /^view\.player\./,
      /^view\.opponents\[\d+\]\.(melds|discards|flowers|seasons)(\.|\[|$)/,
      /^view\.lastDiscard\.tile$/,
      /^view\.claimWindow\.tile$/,
      /^view\.fishing\[\d+\]\.wait(\[\d+\])?$/,
      /^view\.legalActions\[\d+\]\.(tile|tiles\[\d+\]|wait\[\d+\])$/,
      /^checker\./,
      /^table\[\d+\]\.(melds|discards|flowers|seasons)(\.|\[|$)/,
      /^outcome\.(winningTile|melds\[\d+\]\.tiles\[\d+\])$/,
    ];

    for (const opponent of state.players.filter((player) => player.seat !== "E")) {
      assert.ok(opponent.hand.length > 0);
      for (const key of opponent.hand) {
        for (const hit of occurrences.filter((entry) => entry.key === key)) {
          assert.ok(
            allowed.some((pattern) => pattern.test(hit.path)),
            `${opponent.seat} tile ${key} leaked at ${hit.path}`,
          );
        }
      }
    }

    for (const opponent of payload.view.opponents) {
      assert.equal("hand" in opponent, false);
    }
  });

  it("rejects an illegal move with the reducer's wording and changes nothing", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-illegal" });
    const game = created.body.game;
    const beforeState = serialize(store.state(game)!);
    const beforePayload = await getState(game);

    const tile = beforePayload.view.player.hand[0];
    assert.ok(tile !== undefined);
    const action: Action = { type: "Discard", seat: "E", tile };
    const expected = apply(store.state(game)!, action);
    assert.ok(isApplyError(expected));

    const response = await post<ApiError>("/api/move", { game, action });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: expected.error });
    assert.equal(serialize(store.state(game)!), beforeState);
    assert.deepEqual(await getState(game), beforePayload);
  });

  it("applies a legal move and advances the hand", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-legal" });
    const game = created.body.game;
    const before = store.state(game)!;

    const draw = created.body.legalActions.find((action) => action.type === "Draw");
    assert.ok(draw !== undefined);
    const drawn = await post<ApiPayload>("/api/move", { game, action: draw });
    assert.equal(drawn.status, 200);
    assert.equal(drawn.body.view.phase, "discard");
    assert.equal(drawn.body.view.player.hand.length, 14);
    assert.ok(drawn.body.view.wallRemaining < created.body.wallRemaining);
    assert.ok(drawn.body.events.some((line) => line.startsWith("E draws")));

    const discard = drawn.body.legalActions.find(
      (action) => action.type === "Discard",
    );
    assert.ok(discard !== undefined);
    const played = await post<ApiPayload>("/api/move", { game, action: discard });
    assert.equal(played.status, 200);
    assert.ok(played.body.events.some((line) => line.includes("discards")));
    assert.ok(store.state(game)!.eventSeq > before.eventSeq);
    assert.ok(
      played.body.view.phase === "finished" || played.body.view.turn === "E",
      `expected a human decision or a finished hand, got ${played.body.view.phase}/${played.body.view.turn}`,
    );
  });

  it("matches check.ts's wait report for the same 13 tiles", async () => {
    let payload: ApiPayload | null = null;
    for (let index = 0; index < 100 && payload === null; index++) {
      const created = await post<ApiPayload>("/api/new", { seed: `api-waits-${index}` });
      assert.equal(created.status, 200);
      if (created.body.checker.size === 13 && created.body.checker.waits.length > 0) {
        payload = created.body;
      }
    }
    assert.ok(payload !== null, "no seed produced a waiting hand");

    const player = payload.view.player;
    const melds = player.melds.map((meld) => `(${meld.tiles.join(" ")})`);
    const input = [...melds, ...player.hand].join(" ");
    const expected = checkHand(input);
    assert.ok(expected.size === 13);

    const checker = payload.checker;
    assert.ok(checker.size === 13);
    assert.equal(checker.waits.length, expected.waits.length);
    for (let index = 0; index < expected.waits.length; index++) {
      const actual = checker.waits[index];
      const wait = expected.waits[index]!;
      assert.ok(actual !== undefined);
      assert.equal(actual.tile, tileKey(wait.tile));
      assert.equal(actual.remaining, wait.remaining);
      assert.equal(actual.dead, wait.dead);
      assert.deepEqual(
        actual.matches.map((match) => match.id),
        wait.matches.map((match) => match.pattern.id),
      );
      assert.equal(actual.best?.id, wait.matches[0]?.pattern.id);
    }
  });
});
