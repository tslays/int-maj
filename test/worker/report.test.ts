/**
 * The report endpoint: a report posted by the app becomes one GitHub issue
 * that still replays, and nothing else gets through.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseAction } from "../../src/core/game/bot.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { buildReport, parseReport, replayReport } from "../../src/table/report.ts";
import { GameStore } from "../../src/table/session.ts";
import { PACKED_BEGIN, packReport, unpackReport } from "../../src/worker/pack.ts";
import { MAX_REPORT, handleReport, issueFor, type ReportEnv } from "../../src/worker/report.ts";

const INFO = { version: "0.1.0-alpha.4", build: "abc1234", userAgent: "TestAgent/1.0 (iPhone)" };
const ENV: ReportEnv = { REPORT_GITHUB_TOKEN: "token-1", REPORT_REPO: "owner/repo" };
const URL_ = "https://int.example/api/report";

/* One hand played out by the bots, reported with different notes. */
const store = new GameStore();
const id = store.create("worker-1").session.id;
for (;;) {
  const state = store.state(id)!;
  if (state.phase === "finished") break;
  const view = viewFor(state, "E");
  const moved = view.legalActions.length > 0 ? store.move(id, chooseAction(view, "E")!) : store.step(id);
  assert.ok(!("error" in moved));
}

function playedReport(note?: string): { text: string } {
  return { text: buildReport(store.get(id)!, { ...INFO, note }) };
}

function post(report: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { origin: "https://int.example", "content-type": "application/json", ...headers },
    body: JSON.stringify({ report }),
  });
}

/** A stand-in for GitHub that records what it was sent. */
function github(statuses: readonly number[] = [201]) {
  const calls: { url: string; init: RequestInit; body: { title: string; body: string; labels: string[] } }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    const status = statuses[calls.length - 1] ?? 201;
    return new Response(JSON.stringify(status === 201 ? { number: 42 } : { message: "no" }), { status });
  }) as unknown as typeof fetch;
  return { calls, send };
}

describe("report endpoint", () => {
  it("files a report as an issue that replays", async () => {
    const { text } = playedReport("the bot skipped me");
    const hub = github();
    const response = await handleReport(post(text), ENV, hub.send);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, number: 42 });

    assert.equal(hub.calls.length, 1);
    const call = hub.calls[0]!;
    assert.equal(call.url, "https://api.github.com/repos/owner/repo/issues");
    assert.equal((call.init.headers as Record<string, string>).authorization, "Bearer token-1");
    assert.equal(call.body.title, "Report: the bot skipped me [0.1.0-alpha.4 abc1234]");
    assert.deepEqual(call.body.labels, ["report"]);

    const parsed = parseReport(call.body.body);
    assert.ok(!("error" in parsed));
    assert.deepEqual(replayReport(parsed).state, store.get(id)!.state);
  });

  it("keeps a note from mentioning anyone or leaving its code block", async () => {
    const { text } = playedReport("hi @someone ``` # big");
    const issue = await issueFor(text);
    assert.equal(issue.body.split("```").length, 3, "one opening and one closing fence");
    const inside = issue.body.split("```")[1]!;
    assert.match(inside, /Note: hi @someone ''' # big/);
  });

  it("packs a game too long for an issue, and it still replays", async () => {
    const { text } = playedReport();
    const issue = await issueFor(text, 1000);
    assert.ok(issue.body.length < text.length / 2, "packed, a long game fits an issue");
    assert.ok(issue.body.includes(PACKED_BEGIN));
    const parsed = parseReport(await unpackReport(issue.body));
    assert.ok(!("error" in parsed));
    assert.deepEqual(replayReport(parsed).state, store.get(id)!.state);
  });

  it("packs and unpacks to the same replay, and leaves other text alone", async () => {
    const { text } = playedReport();
    assert.deepEqual(parseReport(await unpackReport(await packReport(text))), parseReport(text));
    assert.equal(await unpackReport(text), text);
    assert.equal(await packReport("no replay here"), "no replay here");
  });

  it("files it without the label when the token may not label", async () => {
    const { text } = playedReport();
    const hub = github([422, 201]);
    const response = await handleReport(post(text), ENV, hub.send);
    assert.equal(response.status, 201);
    assert.deepEqual(hub.calls.map((call) => call.body.labels), [["report"], []]);
  });

  it("answers 502 when GitHub refuses or cannot be reached", async () => {
    const { text } = playedReport();
    assert.equal((await handleReport(post(text), ENV, github([401]).send)).status, 502);
    const down = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    assert.equal((await handleReport(post(text), ENV, down)).status, 502);
  });

  it("refuses everything that is not the app's report", async () => {
    const { text } = playedReport();
    const hub = github();
    const status = async (request: Request, env: ReportEnv = ENV) => (await handleReport(request, env, hub.send)).status;

    assert.equal(await status(new Request(URL_, { headers: { origin: "https://int.example" } })), 405);
    assert.equal(await status(post(text, { origin: "https://elsewhere.example" })), 403);
    assert.equal(await status(new Request(URL_, { method: "POST", body: JSON.stringify({ report: text }) })), 403);
    assert.equal(await status(post(text), { REPORT_REPO: "owner/repo" }), 503);
    assert.equal(await status(new Request(URL_, { method: "POST", headers: { origin: "https://int.example" }, body: "{" })), 400);
    assert.equal(await status(post(42)), 400);
    assert.equal(await status(post("please open an issue")), 400);
    assert.equal(await status(post("int-maj problem report\nno replay")), 400);
    assert.equal(await status(post(`prefix ${text}`)), 400);
    assert.equal(await status(post(text + " ".repeat(MAX_REPORT))), 413);
    assert.equal(hub.calls.length, 0, "nothing reached GitHub");
  });

  it("stops an address that sends too many", async () => {
    const { text } = playedReport();
    const hub = github();
    const keys: string[] = [];
    const env: ReportEnv = {
      ...ENV,
      REPORT_LIMIT: {
        limit: async ({ key }) => {
          keys.push(key);
          return { success: keys.length <= 1 };
        },
      },
    };
    const from = { "cf-connecting-ip": "203.0.113.9" };
    assert.equal((await handleReport(post(text, from), env, hub.send)).status, 201);
    assert.equal((await handleReport(post(text, from), env, hub.send)).status, 429);
    assert.deepEqual(keys, ["203.0.113.9", "203.0.113.9"]);
    assert.equal(hub.calls.length, 1);
  });
});
