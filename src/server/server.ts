/**
 * Zero-dependency HTTP server for the web table.
 *
 * Routes:
 *   GET  /                 the table page
 *   GET  /app.js, /app.css the client's plain ES module and stylesheet
 *   GET  /api/state?game=  one seat's view, legal actions and wait panel
 *   POST /api/new          deal a game from `{ seed }`
 *   POST /api/move         apply `{ game, action }`, return events as text
 *   POST /api/undo         replay to before the previous human decision
 *   POST /api/next         deal the next hand after a finished one
 *
 * Nothing here constructs game state: the store owns the sessions and
 * `statePayload` builds every response from `viewFor` plus `check.ts`. The
 * server binds nothing itself; `bin/serve.ts` listens on 127.0.0.1 only.
 */

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeEvent } from "../core/game/console.ts";
import type { Action } from "../core/game/actions.ts";
import { GameStore, statePayload, type SessionUpdate } from "./session.ts";

const WEB_ROOT = fileURLToPath(new URL("../../web/", import.meta.url));
const MAX_BODY_BYTES = 1_000_000;

const TILE_ART_PATH = /^\/tiles\/([A-Za-z0-9]+\.svg)$/;

const STATIC_FILES: Readonly<Record<string, string>> = Object.freeze({
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/tiles.js": "tiles.js",
  "/app.css": "app.css",
  "/table.jpg": "table.jpg",
});

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  "index.html": "text/html; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "tiles.js": "text/javascript; charset=utf-8",
  "app.css": "text/css; charset=utf-8",
  "table.jpg": "image/jpeg",
});

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface AppServerOptions {
  readonly store?: GameStore;
  readonly webRoot?: string;
}

function sendJson(res: ServerResponse, status: number, value: unknown, pretty = false): void {
  const body = JSON.stringify(value, null, pretty ? 2 : 0);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

async function serveStatic(
  res: ServerResponse,
  webRoot: string,
  file: string,
  contentType = CONTENT_TYPES[file] ?? "application/octet-stream",
): Promise<void> {
  let data: Buffer;
  try {
    data = await readFile(join(webRoot, file));
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${key} is required`);
  }
  return value;
}

function requireAction(record: Record<string, unknown>): Action {
  const value = record.action;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "action is required");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    throw new HttpError(400, "action.type is required");
  }
  if (typeof candidate.seat !== "string") {
    throw new HttpError(400, "action.seat is required");
  }
  return value as Action;
}

/** The public event log as text lines the client can append to its log. */
function responsePayload(update: SessionUpdate, extraEvents: readonly string[] = []) {
  return {
    ...statePayload(update.session),
    events: [
      ...update.events.flatMap((event) => describeEvent(event).split("\n")),
      ...extraEvents,
    ],
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  store: GameStore,
  webRoot: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" || req.method === "HEAD") {
    if (url.pathname === "/api/state") {
      const id = url.searchParams.get("game");
      if (id === null || id.length === 0) {
        sendJson(res, 400, { error: "game is required" });
        return;
      }
      const session = store.get(id);
      if (session === undefined) {
        sendJson(res, 404, { error: `unknown game: ${id}` });
        return;
      }
      sendJson(res, 200, statePayload(session), url.searchParams.has("pretty"));
      return;
    }

    const file = STATIC_FILES[url.pathname];
    if (file !== undefined) {
      await serveStatic(res, webRoot, file);
      return;
    }

    const art = TILE_ART_PATH.exec(url.pathname);
    if (art !== null) {
      await serveStatic(
        res,
        join(webRoot, "tiles"),
        art[1]!,
        "image/svg+xml; charset=utf-8",
      );
      return;
    }
    sendJson(res, 404, { error: "not found" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const body = asRecord(await readJson(req));

  if (url.pathname === "/api/new") {
    const seed = body.seed;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
      throw new HttpError(400, "seed must be a string or number");
    }
    const update = store.create(seed);
    sendJson(res, 200, { ...responsePayload(update), replaceLog: true });
    return;
  }

  if (url.pathname === "/api/move") {
    const game = requireString(body, "game");
    const action = requireAction(body);
    const update = store.move(game, action);
    if ("error" in update) {
      sendJson(res, 400, { error: update.error });
      return;
    }
    sendJson(res, 200, responsePayload(update));
    return;
  }

  if (url.pathname === "/api/undo") {
    const game = requireString(body, "game");
    const update = store.undo(game);
    if ("error" in update) {
      sendJson(res, 400, { error: update.error });
      return;
    }
    sendJson(res, 200, {
      ...statePayload(update.session),
      events: [
        ...update.session.events.flatMap((event) => describeEvent(event).split("\n")),
        "Undid the previous decision.",
      ],
      replaceLog: true,
    });
    return;
  }

  if (url.pathname === "/api/next") {
    const game = requireString(body, "game");
    const update = store.next(game);
    if ("error" in update) {
      sendJson(res, 400, { error: update.error });
      return;
    }
    sendJson(res, 200, responsePayload(update));
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

/** Build the server without listening; the caller owns the socket. */
export function createAppServer(options: AppServerOptions = {}): Server {
  const store = options.store ?? new GameStore();
  const webRoot = options.webRoot ?? WEB_ROOT;
  return createServer((req, res) => {
    void handle(req, res, store, webRoot).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      sendJson(res, 500, { error: "internal server error" });
    });
  });
}
