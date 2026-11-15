/**
 * `POST /api/report`: the app's "Report a problem" lands here and becomes an
 * issue in the game's GitHub repository, where the report can be read and
 * replayed (`npm run replay`).
 *
 * The endpoint is public, so it only accepts what the app sends: a same-origin
 * JSON post holding one well-formed report of bounded size, a few per minute
 * per address. The issue shows the report inside a code block, so nothing in
 * a note can mention a user or draw markup. A report may carry up to three
 * photos; each is kept in a private store under a random key, and the issue
 * names only those keys.
 */

import { parseReport } from "../table/report.ts";
import { packReport } from "./pack.ts";
import { MAX_PHOTOS, MAX_PHOTO_BASE64, decodePhoto } from "./photo.ts";

/** The private store of report photos: an R2 bucket, bound as `REPORT_PHOTOS`. */
export interface PhotoStore {
  put(key: string, bytes: Uint8Array<ArrayBuffer>, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

export interface ReportEnv {
  /** A GitHub token that may write issues in `REPORT_REPO`; a Worker secret. */
  readonly REPORT_GITHUB_TOKEN?: string;
  /** `owner/name` of the repository that receives the issues. */
  readonly REPORT_REPO?: string;
  /** Cloudflare's rate limiter, where it is bound. */
  readonly REPORT_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Where a report's photos are kept, where it is bound. Private: nothing reads them back over HTTP. */
  readonly REPORT_PHOTOS?: PhotoStore;
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

/**
 * The issue for one report text; a report longer than `maxPlain` is packed.
 * Each of `photoKeys` names one of the report's photos in the private store.
 */
export async function issueFor(
  report: string,
  maxPlain = MAX_PLAIN,
  photoKeys: readonly string[] = [],
): Promise<{ title: string; body: string }> {
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
      ...photoKeys.flatMap((key, index) => [
        `Photo ${index + 1} of ${photoKeys.length}, in the private store (not public): \`${key}\``,
        "",
      ]),
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
  let photos: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_REPORT + MAX_PHOTOS * MAX_PHOTO_BASE64 + 1000) {
      return json(413, { error: "the report is too large" });
    }
    const body = JSON.parse(raw) as { report?: unknown; photos?: unknown } | null;
    report = body?.report;
    photos = body?.photos;
  } catch {
    return json(400, { error: "not JSON" });
  }
  if (typeof report === "string" && report.length > MAX_REPORT) return json(413, { error: "the report is too large" });
  if (typeof report !== "string") return json(400, { error: "no report" });
  if (!report.startsWith("int-maj problem report\n")) return json(400, { error: "not a report" });
  const parsed = parseReport(report);
  if ("error" in parsed) return json(400, { error: parsed.error });

  // Every photo is checked before any is kept, and all are kept before the
  // issue names them, so the issue never points at a photo that is not there.
  const list = photos === undefined || photos === null ? [] : photos;
  if (!Array.isArray(list)) return json(400, { error: "the photos are not a list" });
  if (list.length > MAX_PHOTOS) return json(400, { error: `a report takes at most ${MAX_PHOTOS} photos` });
  const decodedPhotos: Uint8Array<ArrayBuffer>[] = [];
  for (const photo of list) {
    if (typeof photo !== "string") return json(400, { error: "the photo is not a JPEG" });
    const decoded = decodePhoto(photo);
    if ("error" in decoded) return json(400, { error: decoded.error });
    decodedPhotos.push(decoded.bytes);
  }
  const store = env.REPORT_PHOTOS;
  const photoKeys: string[] = [];
  // Photos that are not filed with their report are removed again.
  const discard = async (): Promise<void> => {
    if (store === undefined) return;
    await Promise.all(photoKeys.map((key) => store.delete(key).catch(() => undefined)));
  };
  if (decodedPhotos.length > 0) {
    if (store === undefined) return json(503, { error: "photos are not set up on this site" });
    for (const bytes of decodedPhotos) {
      const key = crypto.randomUUID();
      try {
        await store.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
      } catch (error) {
        console.error(`a photo could not be stored: ${String(error)}`);
        await discard();
        return json(502, { error: "the photo could not be stored" });
      }
      photoKeys.push(key);
    }
  }

  const issue = await issueFor(report, MAX_PLAIN, photoKeys);
  try {
    let created = await createIssue(env, issue, send, ["report"]);
    // A token that may not create the label must not lose the report.
    if (created.status === 422) created = await createIssue(env, issue, send, []);
    if (!created.ok) {
      console.error(`GitHub answered ${created.status}: ${(await created.text()).slice(0, 300)}`);
      await discard();
      return json(502, { error: "the report could not be filed" });
    }
    const { number } = (await created.json()) as { number?: unknown };
    return json(201, { ok: true, number: typeof number === "number" ? number : null });
  } catch (error) {
    console.error(`GitHub could not be reached: ${String(error)}`);
    await discard();
    return json(502, { error: "the report could not be filed" });
  }
}
