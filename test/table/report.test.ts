/**
 * The problem report: built from a really played game, it replays to the
 * identical state, and it holds only the seed and the decisions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseAction } from "../../src/core/game/bot.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { GameStore } from "../../src/table/session.ts";
import { buildReport, isReportText, parseReport, replayReport } from "../../src/table/report.ts";
import { createLocalApi } from "../../src/table/local.ts";

const INFO = { version: "0.1.0-alpha.1", build: "abc1234", userAgent: "TestAgent/1.0 (iPhone)" };

function playOut(store: GameStore, id: string): void {
  for (;;) {
    const state = store.state(id)!;
    if (state.phase === "finished") return;
    const view = viewFor(state, "E");
    if (view.legalActions.length > 0) {
      const moved = store.move(id, chooseAction(view, "E")!);
      assert.ok(!("error" in moved));
    } else {
      assert.ok(!("error" in store.step(id)));
    }
  }
}

describe("problem report", () => {
  it("replays a played hand to an identical state", () => {
    const store = new GameStore();
    const { session } = store.create("report-1");
    playOut(store, session.id);
    const live = store.get(session.id)!;
    const text = buildReport(live, { ...INFO, note: "the bot\nskipped me" });
    assert.ok(isReportText(text));
    const parsed = parseReport(text);
    assert.ok(!("error" in parsed));
    const replayed = replayReport(parsed);
    assert.deepEqual(replayed.state, live.state);
    assert.deepEqual(replayed.events, live.events);
  });

  it("replays a report cut off mid-hand", () => {
    const store = new GameStore();
    const { session } = store.create("report-2");
    for (let i = 0; i < 12; i++) store.step(session.id);
    const live = store.get(session.id)!;
    const parsed = parseReport(buildReport(live, INFO));
    assert.ok(!("error" in parsed));
    assert.deepEqual(replayReport(parsed).state, live.state);
  });

  it("carries the header facts and a one-line note", () => {
    const store = new GameStore();
    const { session } = store.create("report-3");
    const text = buildReport(session, { ...INFO, note: "line one\nline two" });
    assert.match(text, /^int-maj problem report\nVersion: 0\.1\.0-alpha\.1\nBuild: abc1234\nUser agent: TestAgent\/1\.0 \(iPhone\)\n/);
    assert.match(text, /\nNote: line one line two\n/);
  });

  it("holds only the seed and decisions: no state, hands or wall", () => {
    const store = new GameStore();
    const { session } = store.create("report-4");
    playOut(store, session.id);
    const text = buildReport(store.get(session.id)!, INFO);
    const parsed = parseReport(text);
    assert.ok(!("error" in parsed));
    assert.deepEqual(Object.keys(parsed).sort(), ["dealer", "format", "humanSteps", "seed", "steps"]);
    for (const step of parsed.steps) assert.ok(!("hand" in step) && !("wall" in step) && !("state" in step));
    assert.ok(!text.includes('"wall"') && !text.includes('"players"') && !text.includes('"concealed"'));
  });

  it("rejects damaged reports", () => {
    assert.ok("error" in parseReport("nothing here"));
    assert.ok("error" in parseReport("-----BEGIN REPLAY-----\n{oops\n-----END REPLAY-----"));
    assert.ok("error" in parseReport('-----BEGIN REPLAY-----\n{"format":"x"}\n-----END REPLAY-----'));
  });

  it("is available through the in-page API once a game is dealt", async () => {
    const api = createLocalApi(null);
    assert.equal(api.report(INFO), null);
    await api.request("/api/new", { seed: "report-5" });
    const text = api.report(INFO);
    assert.ok(text !== null && isReportText(text));
  });
});
