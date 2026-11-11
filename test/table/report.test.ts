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

describe("house rules at the table", () => {
  const COMPANION_ONLY = { companionHandsOnly: true };
  const LEFT_OUT = ["all-kong", "buried-treasure", "mixed-pung"];

  it("deals a game under the rule and says so in every payload", async () => {
    const api = createLocalApi(null);
    const dealt = (await api.request("/api/new", { seed: "house-1", houseRules: COMPANION_ONLY })) as {
      houseRules: { companionHandsOnly: boolean };
      view: { excludedHands: string[] };
    };
    assert.equal(dealt.houseRules.companionHandsOnly, true);
    assert.deepEqual([...dealt.view.excludedHands].sort(), LEFT_OUT);

    const plain = (await api.request("/api/new", { seed: "house-1" })) as typeof dealt;
    assert.equal(plain.houseRules.companionHandsOnly, false);
    assert.deepEqual(plain.view.excludedHands, []);

    await assert.rejects(api.request("/api/new", { seed: "x", houseRules: { companionHandsOnly: "yes" } }));
    const offered = (await api.request("/api/house-rules")) as { companionHandsOnly: { hands: string[] } };
    assert.deepEqual(offered.companionHandsOnly.hands, [
      "Buried Treasure (Concealed Mah Jong)",
      "All Kong",
      "Mixed Pung",
    ]);
  });

  it("changes the rule only at the next deal, and the report replays it", () => {
    const store = new GameStore();
    const { session } = store.create("house-2", COMPANION_ONLY);
    playOut(store, session.id);
    assert.deepEqual([...(store.state(session.id)!.excludedHands ?? [])].sort(), LEFT_OUT);

    // Same rules: an ordinary step. Changed rules: the step carries the new list.
    const next = store.next(session.id, { companionHandsOnly: false });
    assert.ok(!("error" in next));
    assert.deepEqual(next.session.steps.at(-1), { type: "NextHand", excludedHands: [] });
    assert.equal(store.state(session.id)!.excludedHands, undefined);
    playOut(store, session.id);

    const live = store.get(session.id)!;
    const text = buildReport(live, INFO);
    assert.match(text, /^House rules: \(none\)$/m);
    const parsed = parseReport(text);
    assert.ok(!("error" in parsed));
    assert.deepEqual([...(parsed.excludedHands ?? [])].sort(), LEFT_OUT);
    assert.equal(JSON.stringify(replayReport(parsed).state), JSON.stringify(live.state));

    // A saved game keeps its rules through a restore.
    const restored = new GameStore().restore(JSON.parse(JSON.stringify(store.snapshot(session.id))));
    assert.ok(!("error" in restored));
    assert.equal(JSON.stringify(restored.session.state), JSON.stringify(live.state));
  });

  it("keeps the rule when the next hand is dealt without naming one", () => {
    const store = new GameStore();
    const { session } = store.create("house-3", COMPANION_ONLY);
    playOut(store, session.id);
    const state = store.state(session.id)!;
    if (state.gameOver === true) return;
    const next = store.next(session.id);
    assert.ok(!("error" in next));
    assert.deepEqual(next.session.steps.at(-1), { type: "NextHand" });
    assert.deepEqual([...(next.session.state.excludedHands ?? [])].sort(), LEFT_OUT);
  });
});
