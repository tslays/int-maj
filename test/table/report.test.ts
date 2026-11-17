/**
 * The problem report: built from a really played game, it replays to the
 * identical state, and it holds only the seed and the decisions.
 */

import assert from "node:assert/strict";
import { GOULASH_NO_HALF_LIMIT } from "../../src/core/game/hands.ts";
import { describe, it } from "node:test";

import { chooseAction } from "../../src/core/game/bot.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { GameStore, houseRulesOf } from "../../src/table/session.ts";
import { buildReport, isReportText, parseReport, replayReport, type ReportSettings } from "../../src/table/report.ts";
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
    assert.deepEqual(Object.keys(parsed).sort(), ["dealer", "dice", "excludedHands", "format", "humanSteps", "seed", "steps"]);
    // A default table leaves no hand out; it carries only the Goulash house rule.
    assert.deepEqual(parsed.excludedHands, [GOULASH_NO_HALF_LIMIT]);
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
  // These cases are about the hand set; the Goulash rule is off so the
  // exclusion lists hold hands only.
  const COMPANION = { handSet: "companion", goulashNoHalfLimit: false, winNeedsFish: false } as const;
  const PICTURED = { handSet: "companion-pictured", goulashNoHalfLimit: false, winNeedsFish: false } as const;
  const ILLUSTRATED = ["all-kong", "buried-treasure", "mixed-pung"];
  const UNPICTURED = [
    "blue-mountains", "down-you-go", "dragons-run", "dragons-scales", "driven-snow",
    "ods-evens", "robin", "up-you-go", "white-elephant",
  ];

  it("deals a game under the hand set and says so in every payload", async () => {
    const api = createLocalApi(null);
    const dealt = (await api.request("/api/new", { seed: "house-1", houseRules: COMPANION })) as {
      houseRules: { handSet: string };
      view: { excludedHands: string[] };
    };
    assert.equal(dealt.houseRules.handSet, "companion");
    assert.deepEqual([...dealt.view.excludedHands].sort(), ILLUSTRATED);

    const pictured = (await api.request("/api/new", { seed: "house-1", houseRules: PICTURED })) as typeof dealt;
    assert.equal(pictured.houseRules.handSet, "companion-pictured");
    assert.deepEqual([...pictured.view.excludedHands].sort(), [...ILLUSTRATED, ...UNPICTURED].sort());

    const plain = (await api.request("/api/new", { seed: "house-1" })) as typeof dealt;
    assert.equal(plain.houseRules.handSet, "all");
    assert.deepEqual(plain.view.excludedHands, []);

    await assert.rejects(api.request("/api/new", { seed: "x", houseRules: { handSet: "most" } }));
    const offered = (await api.request("/api/house-rules")) as {
      total: number;
      handSets: { id: string; leftOut: string[]; inPlay: number }[];
    };
    const index = async (set: string) => ((await api.request(`/api/hands?set=${set}`)) as { hands: unknown[] }).hands.length;
    assert.equal(offered.total, await index("all"));
    for (const set of offered.handSets) assert.equal(set.inPlay, await index(set.id), `${set.id}: as the hand index counts`);
    assert.deepEqual(offered.handSets.map((set) => set.inPlay), [88, 85, 76, 73]);
    assert.deepEqual(offered.handSets.map((set) => set.id), ["all", "companion", "companion-pictured", "rare"]);
    assert.deepEqual(offered.handSets.map((set) => set.leftOut.length), [0, 3, 12, 16]);
    assert.ok(offered.handSets[1]!.leftOut.includes("Mixed Pung"));
    assert.ok(offered.handSets[2]!.leftOut.includes("Robin"));
    assert.ok(offered.handSets[3]!.leftOut.includes("Crazy Chows"));
    assert.ok(offered.handSets[3]!.leftOut.includes("Big Robert (half limit)"), "only the mixed-numbers reading");
    assert.ok(!offered.handSets[3]!.leftOut.includes("Big Robert"));

    const rare = (await api.request("/api/new", {
      seed: "house-1",
      houseRules: { ...PICTURED, handSet: "rare" },
    })) as typeof dealt;
    assert.equal(rare.houseRules.handSet, "rare", "read back from the dealt state");
    assert.deepEqual(
      [...rare.view.excludedHands].sort(),
      [...ILLUSTRATED, ...UNPICTURED, "big-robert-mixed", "crazy-chows", "little-robert", "three-philosophers"].sort(),
    );
  });

  it("bars half-limit hands in a Goulash unless the table turns it off (C p. 55)", async () => {
    const api = createLocalApi(null);
    type Dealt = { houseRules: { goulashNoHalfLimit: boolean } };
    const plain = (await api.request("/api/new", { seed: "goulash-rule" })) as Dealt;
    assert.equal(plain.houseRules.goulashNoHalfLimit, true, "on by default");
    const off = (await api.request("/api/new", {
      seed: "goulash-rule",
      houseRules: { goulashNoHalfLimit: false, winNeedsFish: false },
    })) as Dealt;
    assert.equal(off.houseRules.goulashNoHalfLimit, false);
    await assert.rejects(api.request("/api/new", { seed: "x", houseRules: { goulashNoHalfLimit: "yes" } }));

    // A hand dealt before the rule existed reads back as played without it.
    const store = new GameStore();
    const { session } = store.create("goulash-rule-old", { handSet: "all", goulashNoHalfLimit: false, winNeedsFish: false });
    assert.equal(store.state(session.id)!.excludedHands, undefined);
    assert.equal(houseRulesOf(store.state(session.id)!).goulashNoHalfLimit, false);
    assert.match(buildReport(store.get(session.id)!, INFO), /^House rules: hand set all, half-limit hands in a Goulash allowed, a win needs no announcement$/m);
  });

  it("logs whether the hand in play is a Goulash, and whether half-limit hands are barred in it", () => {
    const store = new GameStore();
    const { session } = store.create("goulash-log", PICTURED);
    const live = store.get(session.id)!;
    assert.match(buildReport(live, INFO), /^Goulash: no \(this hand is not a Goulash\)$/m);

    // The same table, in a Goulash hand, with the bar on and then off.
    const inGoulash = (barred: boolean) => ({
      ...live,
      state: {
        ...live.state,
        goulash: true,
        excludedHands: [
          ...(live.state.excludedHands ?? []).filter((id) => id !== GOULASH_NO_HALF_LIMIT),
          ...(barred ? [GOULASH_NO_HALF_LIMIT] : []),
        ],
      },
    });
    assert.match(buildReport(inGoulash(true), INFO), /^Goulash: yes, half-limit hands barred in this hand$/m);
    assert.match(buildReport(inGoulash(false), INFO), /^Goulash: yes, half-limit hands allowed in this hand$/m);
  });

  it("changes the hand set only at the next deal, and the report replays it", () => {
    const store = new GameStore();
    const { session } = store.create("house-2", PICTURED);
    playOut(store, session.id);
    assert.equal(houseRulesOf(store.state(session.id)!).handSet, "companion-pictured");

    // Same rules: an ordinary step. Changed rules: the step carries the new list.
    const next = store.next(session.id, { handSet: "all", goulashNoHalfLimit: false, winNeedsFish: false });
    assert.ok(!("error" in next));
    assert.deepEqual(next.session.steps.at(-1), { type: "NextHand", excludedHands: [] });
    assert.equal(store.state(session.id)!.excludedHands, undefined);
    playOut(store, session.id);

    const live = store.get(session.id)!;
    const text = buildReport(live, INFO);
    assert.match(text, /^House rules: hand set all, half-limit hands in a Goulash allowed, a win needs no announcement$/m);
    const parsed = parseReport(text);
    assert.ok(!("error" in parsed));
    assert.equal(parsed.excludedHands?.length, ILLUSTRATED.length + UNPICTURED.length);
    assert.equal(JSON.stringify(replayReport(parsed).state), JSON.stringify(live.state));

    // A saved game keeps its rules through a restore.
    const restored = new GameStore().restore(JSON.parse(JSON.stringify(store.snapshot(session.id))));
    assert.ok(!("error" in restored));
    assert.equal(JSON.stringify(restored.session.state), JSON.stringify(live.state));
  });

  it("keeps the hand set when the next hand is dealt without naming one", () => {
    const store = new GameStore();
    const { session } = store.create("house-3", COMPANION);
    playOut(store, session.id);
    if (store.state(session.id)!.gameOver === true) return;
    const next = store.next(session.id);
    assert.ok(!("error" in next));
    assert.deepEqual(next.session.steps.at(-1), { type: "NextHand" });
    assert.equal(houseRulesOf(next.session.state).handSet, "companion");
  });
});

describe("the player's settings in a report", () => {
  const RULES = { handSet: "all", goulashNoHalfLimit: true, winNeedsFish: false } as const;
  const SETTINGS: ReportSettings = {
    botLevel: "medium",
    pace: "normal",
    hintStyle: "mixed",
    animations: true,
    sound: true,
    largeDiscards: true,
    discards: "rows",
    hints: true,
    tips: true,
    pinned: [],
    rules: RULES,
  };
  const CHOSEN: ReportSettings = {
    botLevel: "hard",
    pace: "faster",
    hintStyle: "discovery",
    animations: false,
    sound: false,
    largeDiscards: false,
    discards: "pile",
    hints: false,
    tips: false,
    pinned: ["a-hand", "b-hand"],
    rules: { handSet: "companion", goulashNoHalfLimit: false, winNeedsFish: true },
  };

  it("lists every stored choice, and the rules chosen against the rules in force", () => {
    const store = new GameStore();
    const { session } = store.create("settings-1", RULES);
    const text = buildReport(session, { ...INFO, settings: CHOSEN });
    assert.match(
      text,
      /^Settings: bot level hard, pace faster, hint style discovery, animations off, sound off, large discards off, discards pile, hints off, tips off$/m,
    );
    assert.match(text, /^Pinned hands: a-hand, b-hand$/m);
    assert.match(
      text,
      /^Rules chosen: hand set companion, half-limit hands in a Goulash allowed, a win needs the fish shown \(change starts next hand\)$/m,
    );
    assert.match(text, /^House rules: hand set all, half-limit hands in a Goulash barred, a win needs no announcement$/m);
  });

  it("says the chosen rules are in force when they are the hand's rules", () => {
    const store = new GameStore();
    const { session } = store.create("settings-2", RULES);
    const text = buildReport(session, { ...INFO, settings: SETTINGS });
    assert.match(text, /^Rules chosen: hand set all, half-limit hands in a Goulash barred, a win needs no announcement \(in force in this hand\)$/m);
    assert.match(text, /^Pinned hands: none$/m);
  });

  it("names at most three pinned hands", () => {
    const store = new GameStore();
    const { session } = store.create("settings-3", RULES);
    const text = buildReport(session, { ...INFO, settings: { ...SETTINGS, pinned: ["a", "b", "c", "d"] } });
    assert.match(text, /^Pinned hands: a, b, c$/m);
  });

  it("keeps every value to one line, so a value cannot forge a header", () => {
    const store = new GameStore();
    const { session } = store.create("settings-4", RULES);
    const text = buildReport(session, {
      ...INFO,
      note: "ok",
      settings: { ...SETTINGS, botLevel: "hard\nNote: forged", pinned: ["x\ny"] },
    });
    assert.equal(text.match(/^Note:/gm)?.length, 1);
    assert.match(text, /^Settings: bot level hard Note: forged, pace normal/m);
    assert.match(text, /^Pinned hands: x y$/m);
  });

  it("leaves the Settings lines out when the app sends none", () => {
    const store = new GameStore();
    const { session } = store.create("settings-5", RULES);
    assert.doesNotMatch(buildReport(session, INFO), /^(Settings|Pinned hands|Rules chosen):/m);
  });

  it("keeps the choices out of the replay block, which still replays to the same state", () => {
    const store = new GameStore();
    const { session } = store.create("settings-6", RULES);
    playOut(store, session.id);
    const live = store.get(session.id)!;
    const text = buildReport(live, { ...INFO, settings: CHOSEN });
    const parsed = parseReport(text);
    assert.ok(!("error" in parsed));
    assert.equal(JSON.stringify(replayReport(parsed).state), JSON.stringify(live.state));
    assert.doesNotMatch(text.slice(text.indexOf("-----BEGIN REPLAY-----")), /botLevel|hintStyle|pinned|rules/);
  });
});
