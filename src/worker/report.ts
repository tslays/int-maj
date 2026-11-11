/**
 * `POST /api/report`: the app's "Report a problem" lands here and becomes an
 * issue in the game's GitHub repository, where the report can be read and
 * replayed (`npm run replay`).
 *
 * The endpoint is public, so it only accepts what the app sends: a same-origin
 * JSON post holding one well-formed report of bounded size, a few per minute
 * per address. The issue shows the report inside a code block, so nothing in
 * a note can mention a user or draw markup.
 */

import { parseReport } from "../table/report.ts";
import { packReport } from "./pack.ts";

export interface ReportEnv {
  /** A GitHub token that may write issues in `REPORT_REPO`; a Worker secret. */
  readonly REPORT_GITHUB_TOKEN?: string;
  /** `owner/name` of the repository that receives the issues. */
  readonly REPORT_REPO?: string;
  /** Cloudflare's rate limiter, where it is bound. */
  readonly REPORT_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** The largest report accepted, about forty hands: packed, it still fits an issue. */
export const MAX_REPORT = 300_000;
/** GitHub refuses an issue body above 65536 characters. */
const MAX_PLAIN = 60_000;
const TITLE_NOTE = 70;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function header(text: string, name: string): string {
  const match = new RegExp(`^${name}: (.*)$`, "m").exec(text);
  return match?.[1]?.trim() ?? "";
}

/** The issue for one report text; a report longer than `maxPlain` is packed. */
export async function issueFor(report: string, maxPlain = MAX_PLAIN): Promise<{ title: string; body: string }> {
  // A code block ends at a backtick fence, and a report has no use for one.
  const text = report.replaceAll("`", "'").trim();
  const note = header(text, "Note");
  const said = note === "" || note === "(none)" ? "no note" : note.slice(0, TITLE_NOTE) + (note.length > TITLE_NOTE ? "..." : "");
  const build = [header(text, "Version"), header(text, "Build")].filter((part) => part !== "").join(" ");
  const shown = text.length > maxPlain ? await packReport(text) : text;
  return {
    title: `Report: ${said}${build === "" ? "" : ` [${build}]`}`,
    body: [
      "Sent with the app's Report button. To replay it, save the block as `report.txt` and run `npm run replay -- report.txt`.",
      "",
      "```text",
      shown,
      "```",
      "",
    ].join("\n"),
  };
}

async function createIssue(
  env: ReportEnv,
  issue: { title: string; body: string },
  send: typeof fetch,
  labels: readonly string[],
): Promise<Response> {
  return send(`https://api.github.com/repos/${env.REPORT_REPO}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.REPORT_GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "int-maj-report",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ...issue, labels }),
  });
}

export async function handleReport(request: Request, env: ReportEnv, send: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const origin = request.headers.get("origin");
  if (origin === null || origin !== new URL(request.url).origin) return json(403, { error: "not from the app" });
  if (!env.REPORT_GITHUB_TOKEN || !env.REPORT_REPO) return json(503, { error: "reports are not set up on this site" });

  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.REPORT_LIMIT !== undefined && !(await env.REPORT_LIMIT.limit({ key: address })).success) {
    return json(429, { error: "too many reports, try again in a minute" });
  }

  let report: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_REPORT + 1000) return json(413, { error: "the report is too large" });
    report = (JSON.parse(raw) as { report?: unknown } | null)?.report;
  } catch {
    return json(400, { error: "not JSON" });
  }
  if (typeof report !== "string" || report.length > MAX_REPORT) return json(400, { error: "no report" });
  if (!report.startsWith("int-maj problem report\n")) return json(400, { error: "not a report" });
  const parsed = parseReport(report);
  if ("error" in parsed) return json(400, { error: parsed.error });

  const issue = await issueFor(report);
  try {
    let created = await createIssue(env, issue, send, ["report"]);
    // A token that may not create the label must not lose the report.
    if (created.status === 422) created = await createIssue(env, issue, send, []);
    if (!created.ok) {
      console.error(`GitHub answered ${created.status}: ${(await created.text()).slice(0, 300)}`);
      return json(502, { error: "the report could not be filed" });
    }
    const { number } = (await created.json()) as { number?: unknown };
    return json(201, { ok: true, number: typeof number === "number" ? number : null });
  } catch (error) {
    console.error(`GitHub could not be reached: ${String(error)}`);
    return json(502, { error: "the report could not be filed" });
  }
}
