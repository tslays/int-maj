/**
 * The table's API is a thin projection of the engine, so these tests pin the
 * contracts the 3D table depends on, calling `routeApi` exactly as the page
 * does in the browser:
 *   - the payload shape (view, legal actions, table, checker, outcome)
 *   - no opponent concealed hand ever appears in a payload
 *   - an illegal move returns the reducer's wording and changes nothing
 *   - a legal move advances the hand
 *   - the wait panel is exactly check.ts's own report for the same tiles
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  apply,
  isApplyError,
  serialize,
  type Action,
} from "../../src/core/game/index.ts";
import { checkHand } from "../../src/core/check.ts";
import { tileKey } from "../../src/core/tiles.ts";
import { createApiContext, routeApi, type ApiContext } from "../../src/table/api.ts";
import { GameStore, type StatePayload } from "../../src/table/session.ts";
import { viewFor } from "../../src/core/game/view.ts";

interface ApiPayload extends StatePayload {
  readonly events: readonly string[];
}

interface ApiError {
  readonly error: string;
}

const TILE_KEY = /^(?:[bco][1-9]|w[ESWN]|d[RGW]|f[1-4]|s[1-4])$/;

let store: GameStore;
let context: ApiContext;

before(() => {
  store = new GameStore({ defaultSeed: "api-test" });
  context = createApiContext(store);
});

/** One request, answered the way the page receives it: through JSON. */
function call<T>(method: string, path: string, body?: unknown): { status: number; body: T } {
  const url = new URL(path, "http://local.invalid");
  const answer = routeApi(context, { method, path: url.pathname, query: url.searchParams, body });
  assert.ok(answer !== null, `no route for ${path}`);
  return { status: answer.status, body: JSON.parse(JSON.stringify(answer.body)) as T };
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  return call<T>("POST", path, body);
}

async function getState(game: string): Promise<ApiPayload> {
  const response = call<ApiPayload>("GET", `/api/state?game=${encodeURIComponent(game)}`);
  assert.equal(response.status, 200);
  return response.body;
}

/** The table answers one decision at a time: ask until it is the human's move. */
async function stepToHuman(game: string): Promise<ApiPayload> {
  for (let step = 0; step < 400; step++) {
    const payload = await getState(game);
    if (payload.view.phase === "finished" || payload.legalActions.length > 0) return payload;
    const response = await post<ApiPayload | { done: boolean }>("/api/step", { game });
    assert.equal(response.status, 200);
  }
  throw new Error("the table did not reach the human's move");
}

describe("table API", () => {
  it("returns the seat view, legal actions, table, ledger and wait panel", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-shape" });
    assert.equal(created.status, 200);
    assert.ok(
      created.body.events.some((line) => line.startsWith("E is dealt 14 tiles")),
    );
    const payload = created.body;

    assert.equal(typeof payload.game, "string");
    assert.equal(payload.seat, "E");
    assert.equal(payload.seed, "api-shape");
    assert.equal(payload.view.seat, "E");
    assert.equal(payload.view.dealer, "E", "the deal is yours");
    assert.equal(payload.view.player.hand.length, 14);
    assert.equal(payload.view.opponents.length, 3);
    assert.equal(payload.wallRemaining, payload.view.wallRemaining);
    assert.ok(
      payload.legalActions.length > 0 &&
        payload.legalActions.every((action) => action.type === "Discard"),
      "your first move is a discard",
    );
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
    assert.equal(payload.checker.size, 14);
    assert.ok(Array.isArray(payload.checker.matches));
    assert.equal(payload.outcome, null);
  });

  it("never puts another seat's concealed tiles in a payload", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-hidden" });
    const game = created.body.game;
    const discard = created.body.legalActions.find(
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
      /^view\.lastDraw\.tile$/,
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

    const action: Action = { type: "Draw", seat: "E" };
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
    assert.equal(created.body.view.dealer, "E", "the deal is yours");
    assert.equal(created.body.view.player.hand.length, 14);

    const discard = created.body.legalActions.find(
      (action) => action.type === "Discard",
    );
    assert.ok(discard !== undefined);
    const played = await post<ApiPayload>("/api/move", { game, action: discard });
    assert.equal(played.status, 200);
    assert.ok(played.body.events.some((line) => line.includes("discards")));
    assert.equal(played.body.view.player.hand.length, 13);
    assert.ok(store.state(game)!.eventSeq > before.eventSeq);
    assert.deepEqual(
      played.body.legalActions,
      [],
      "after your discard the table answers; nothing is yours to do yet",
    );
    assert.notEqual(played.body.view.turn, "E");
  });

  it("plays a whole hand one decision at a time", () => {
    const store = new GameStore({ defaultSeed: "api-whole-hand" });
    let { session } = store.create("api-whole-hand");
    const id = session.id;
    let decisions = 0;
    let steps = 0;

    for (let guard = 0; guard < 4000 && session.state.phase !== "finished"; guard++) {
      const view = viewFor(session.state, session.seat);
      if (view.legalActions.length > 0) {
        const applied = store.move(id, view.legalActions[0]);
        assert.ok(!("error" in applied));
        assert.ok("session" in applied);
        session = applied.session;
        decisions++;
        continue;
      }
      const before = session.steps.length;
      const stepped = store.step(id);
      assert.ok("session" in stepped, "the table always has an answer here");
      session = stepped.session;
      assert.equal(session.steps.length, before + 1, "a step applies exactly one action");
      steps++;
    }

    assert.equal(session.state.phase, "finished", "the hand plays to a result");
    assert.ok(decisions > 10, `the human made ${decisions} decisions`);
    assert.ok(steps > 30, `the table took ${steps} steps`);
  });

  it("undoes to the state before the decision it drops, bots included", () => {
    const store = new GameStore({ defaultSeed: "api-undo" });
    let { session } = store.create("api-undo");
    const id = session.id;
    const human = () => viewFor(session.state, session.seat).legalActions;
    const waitForHuman = () => {
      for (let guard = 0; guard < 200 && human().length === 0; guard++) {
        if (session.state.phase === "finished") return;
        const stepped = store.step(id);
        assert.ok("session" in stepped);
        session = stepped.session;
      }
    };
    const play = () => {
      const action = human()[0];
      assert.ok(action !== undefined);
      const applied = store.move(id, action);
      assert.ok("session" in applied);
      session = applied.session;
    };

    waitForHuman();
    play();
    waitForHuman();
    const before = serialize(session.state);
    play();
    waitForHuman();
    assert.notEqual(serialize(session.state), before);

    const undone = store.undo(id);
    assert.ok("session" in undone);
    assert.equal(serialize(undone.session.state), before);
  });

  it("answers one table action per step, never a round", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-step" });
    const game = created.body.game;
    assert.equal(created.body.view.dealer, "E", "the deal is yours");
    assert.ok(
      created.body.legalActions.every((action) => action.type === "Discard"),
      "your first move is a discard",
    );

    const first = created.body.legalActions.find(
      (action) => action.type === "Discard",
    );
    assert.ok(first !== undefined);
    const opened = await post<ApiPayload>("/api/move", { game, action: first });
    assert.equal(opened.status, 200);

    let throws = 0;
    for (let step = 0; step < 200; step++) {
      const response = await post<ApiPayload | { done: boolean }>("/api/step", { game });
      assert.equal(response.status, 200);
      if ("done" in response.body) break;
      const thrown = response.body.events.filter((line) => line.includes(" discards "));
      assert.ok(
        thrown.length <= 1,
        `one step threw ${thrown.length} discards: ${thrown.join(", ")}`,
      );
      throws += thrown.length;
    }

    assert.ok(throws >= 1, "the bots play their turns");
    const human = await getState(game);
    assert.ok(
      human.legalActions.length > 0 || human.view.phase === "finished",
      "the steps stop at the human's move",
    );
  });

  it("matches check.ts's wait report for the same 13 tiles", async () => {
    let payload: ApiPayload | null = null;
    for (let index = 0; index < 100 && payload === null; index++) {
      const created = await post<ApiPayload>("/api/new", { seed: `api-hand-${index}` });
      assert.equal(created.status, 200);
      const discard = created.body.legalActions.find(
        (action) => action.type === "Discard",
      );
      if (discard === undefined) continue;
      const played = await post<ApiPayload>("/api/move", {
        game: created.body.game,
        action: discard,
      });
      assert.equal(played.status, 200);
      const waiting = await getState(created.body.game);
      if (waiting.checker.size === 13) payload = waiting;
    }
    assert.ok(payload !== null, "no seed produced a 13-tile hand");

    const player = payload.view.player;
    const melds = player.melds.map((meld) => `(${meld.tiles.join(" ")})`);
    const input = [...melds, ...player.hand].join(" ");
    const expected = checkHand(input);
    assert.equal(expected.size, 13);

    const checker = payload.checker;
    if (checker.size !== 13) throw new Error("expected a 13-tile checker");
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

describe("hidden information in the event log", () => {
  /** Ask the table for decisions until the human must act, collecting every log line. */
  async function runToHuman(game: string, lines: string[]): Promise<ApiPayload> {
    for (let step = 0; step < 400; step++) {
      const payload = await getState(game);
      if (payload.view.phase === "finished" || payload.legalActions.length > 0) return payload;
      const answer = await post<ApiPayload | { done: boolean }>("/api/step", { game });
      assert.equal(answer.status, 200);
      if ("events" in answer.body) lines.push(...answer.body.events);
    }
    throw new Error("the table did not reach the human's move");
  }

  it("never names another seat's drawn or replacement tile", async () => {
    const created = await post<ApiPayload>("/api/new", { seed: "api-log-draws" });
    const game = created.body.game;
    const lines: string[] = [];
    let payload = created.body;
    for (let turn = 0; turn < 12 && payload.outcome === null; turn++) {
      const discard = payload.legalActions.find((action) => action.type === "Discard");
      if (discard === undefined) {
        const pass = payload.legalActions.find((action) => action.type === "Pass") ?? payload.legalActions[0]!;
        const moved = await post<ApiPayload>("/api/move", { game, action: pass });
        lines.push(...moved.body.events);
      } else {
        const moved = await post<ApiPayload>("/api/move", { game, action: discard });
        lines.push(...moved.body.events);
      }
      payload = await runToHuman(game, lines);
      if (payload.view.lastDraw !== null) {
        assert.equal(payload.view.lastDraw.seat, "E", "only your own draw is in the view");
      }
    }
    const opponentDraws = lines.filter((line) => /^[SWN] draws /.test(line));
    assert.ok(opponentDraws.length > 0, "the bots drew");
    for (const line of opponentDraws) {
      assert.match(line, /^[SWN] draws a tile( from the loose tiles)?$/, line);
    }
    for (const line of lines.filter((text) => /^[SWN] sets aside /.test(text))) {
      assert.match(line, /and draws a replacement$/, line);
    }
  });

  it("plays a Goulash through all three exchanges, showing only your own tiles", async () => {
    const drawn = call<ApiPayload>("GET", "/api/scenario?state=drawn").body;
    assert.equal(drawn.outcome?.kind, "drawn");
    const game = drawn.game;
    const dealt = await post<ApiPayload>("/api/next", { game });
    assert.equal(dealt.status, 200);
    assert.equal(dealt.body.view.phase, "exchange", "a drawn Western hand is followed by a Goulash");

    const lines: string[] = [];
    let payload = dealt.body;
    let exchanges = 0;
    for (let guard = 0; guard < 20 && payload.view.phase === "exchange"; guard++) {
      payload = await runToHuman(game, lines);
      if (payload.view.phase !== "exchange") break;
      const pick = payload.legalActions.find((action) => action.type === "GoulashExchange");
      assert.ok(pick !== undefined, "you are offered three tiles to pass");
      // R-100: opposite first, then the right, then the left.
      assert.deepEqual(payload.view.goulash, { stage: exchanges, partner: ["W", "S", "N"][exchanges] });
      const moved = await post<ApiPayload>("/api/move", { game, action: pick });
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      lines.push(...moved.body.events);
      exchanges += 1;
      payload = moved.body;
    }
    payload = await runToHuman(game, lines);
    assert.equal(exchanges, 3, "you pass tiles three times");
    assert.notEqual(payload.view.phase, "exchange", "play starts after the third exchange");

    const goulash = lines.filter((line) => line.startsWith("Goulash"));
    assert.equal(goulash.length, 6, "two pairings in each of three exchanges");
    for (const line of goulash) {
      assert.match(
        line,
        /^Goulash [123]: (you give \S+ \S+ \S+ to [SWN] and receive \S+ \S+ \S+|[ESWN] and [ESWN] exchange three tiles)$/,
        line,
      );
    }
  });
});
