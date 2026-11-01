/**
 * Review states (`?state=turn|claim|...`) are the answer to "show me that
 * screen alone", so the contract is narrow and worth pinning:
 *   - every named state really is its state, replayed through the reducer
 *   - rebuilding one gives the same board, byte for byte
 *   - the payload carries the content the page promises (a chow variant, a
 *     live wait, a win with its pattern, ...)
 *   - the route serves it by name and reuses the board until it is played
 */

import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { viewFor } from "../src/core/game/view.ts";
import { createAppServer } from "../src/server/server.ts";
import {
  GameStore,
  statePayload,
  type StatePayload,
} from "../src/server/session.ts";
import {
  buildScenario,
  SCENARIO_NAMES,
  SCENARIOS,
  type ScenarioName,
} from "../src/server/scenarios.ts";

interface ScenarioPayload extends StatePayload {
  readonly state: ScenarioName;
  readonly title: string;
  readonly events: readonly string[];
}

function payloadFor(name: ScenarioName): StatePayload {
  return statePayload({ ...buildScenario(name), id: name });
}

describe("review states", () => {
  it("replays every scenario to exactly its own board", () => {
    for (const name of SCENARIO_NAMES) {
      const session = buildScenario(name);
      const view = viewFor(session.state, session.seat);
      assert.ok(
        SCENARIOS[name].at(view, session.state),
        `${name} stopped somewhere else`,
      );
      assert.equal(session.seed, SCENARIOS[name].seed, `${name} seed`);
      assert.equal(session.seat, "E", `${name} seats the viewer at East`);
    }
  });

  it("builds the same board every time", () => {
    for (const name of SCENARIO_NAMES) {
      const first = payloadFor(name);
      const second = payloadFor(name);
      assert.deepEqual(
        { ...second, game: "" },
        { ...first, game: "" },
        `${name} is not deterministic`,
      );
    }
  });

  it("shows what its name promises", () => {
    const turn = payloadFor("turn");
    assert.equal(turn.view.phase, "discard");
    assert.equal(turn.view.player.hand.length, 14);
    assert.ok(turn.legalActions.some((action) => action.type === "Discard"));

    const claim = payloadFor("claim");
    const chows = claim.legalActions.filter(
      (action) => action.type === "Claim" && action.kind === "chow",
    );
    assert.equal(claim.view.phase, "claim");
    assert.notEqual(claim.view.claimWindow, null);
    assert.ok(chows.length >= 2, "a chow window needs two runs to choose between");

    const wait = payloadFor("wait");
    assert.ok(wait.checker.size === 13 && wait.checker.waits.length > 0);
    assert.equal(wait.view.fishing.length, 0, "the wait page shows a plain wait");

    const fishing = payloadFor("fishing");
    assert.equal(fishing.view.player.hand.length, 13);
    assert.ok(fishing.view.fishing.some((entry) => entry.seat === "E"));

    const win = payloadFor("win");
    assert.equal(win.outcome?.kind, "win");
    assert.equal(win.outcome?.winner, "E");
    assert.ok(typeof win.outcome?.patternName === "string");
    assert.ok(typeof win.outcome?.points === "number");

    const drawn = payloadFor("drawn");
    assert.equal(drawn.outcome?.kind, "drawn");
    assert.equal(drawn.outcome?.winner, null);

    const result = payloadFor("result");
    assert.equal(result.outcome?.kind, "win");
    assert.ok(
      (result.outcome?.fishing.length ?? 0) >= 3,
      "the result card shows a fishing settlement",
    );
    assert.equal(result.outcome?.unknown, 0, "no calculate entry goes unpaid");
  });

  it("serves each state by name and keeps its board until it moves", async () => {
    const store = new GameStore({ defaultSeed: "scenario-test" });
    const server: Server = createAppServer({ store });
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
    await promise;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const first = await fetch(`${base}/api/scenario?state=claim`);
      assert.equal(first.status, 200);
      const one = (await first.json()) as ScenarioPayload;
      assert.equal(one.state, "claim");
      assert.equal(one.title, SCENARIOS.claim.title);
      assert.ok(one.events.length > 0, "the log replays the hand");

      const second = await fetch(`${base}/api/scenario?state=claim`);
      const two = (await second.json()) as ScenarioPayload;
      assert.equal(two.game, one.game, "a second load reuses the fixed board");
      assert.deepEqual(two.table, one.table);

      const unknown = await fetch(`${base}/api/scenario?state=nope`);
      assert.equal(unknown.status, 400);

      const missing = await fetch(`${base}/api/scenario`);
      assert.equal(missing.status, 400);
    } finally {
      server.closeAllConnections();
      const closed = Promise.withResolvers<void>();
      server.close(() => closed.resolve());
      await closed.promise;
    }
  });
});
