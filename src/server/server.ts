/**
 * Zero-dependency HTTP server for the web table.
 *
 * Routes:
 *   GET  /                 the table page
 *   GET  /app.js, /app.css the client's plain ES module and stylesheet
 *   GET  /api/state?game=  one seat's view, legal actions and wait panel
 *   GET  /api/scenario?state= a fixed review board (turn, claim, win, ...)
 *   POST /api/new          deal a game from `{ seed }`
 *   POST /api/move         apply `{ game, action }`, return events as text
 *   POST /api/undo         replay to before the previous human decision
 *   POST /api/step         the next single bot decision
 *   POST /api/next         deal the next hand after a finished one
 *
 * The API routes live in `api.ts` as one pure function, shared with the
 * offline browser build; this file only adds HTTP, static files and the build
 * stamp. The server binds nothing itself; `bin/serve.ts` listens on
 * 127.0.0.1 only.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApiContext, routeApi, type ApiContext } from "./api.ts";
import { GameStore } from "./session.ts";

const WEB_ROOT = fileURLToPath(new URL("../../web/", import.meta.url));
const MAX_BODY_BYTES = 1_000_000;

const TILE_ART_PATH = /^\/tiles\/([A-Za-z0-9]+\.svg)$/;

const STATIC_FILES: Readonly<Record<string, string>> = Object.freeze({
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/layout.js": "layout.js",
  "/tiles.js": "tiles.js",
  "/app.css": "app.css",
  "/table.jpg": "table.jpg",
  // Local design reference for the debug overlay (?overlay=1). The file is
  // gitignored, so a fresh checkout serves 404 until it is prepared.
  "/reference3.png": "reference3.png",
});

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  "index.html": "text/html; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "layout.js": "text/javascript; charset=utf-8",
  "tiles.js": "text/javascript; charset=utf-8",
  "app.css": "text/css; charset=utf-8",
  "table.jpg": "image/jpeg",
  "reference3.png": "image/png",
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

async function webStamp(webRoot: string): Promise<string> {
  const names = await readdir(webRoot, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of names) {
    if (!entry.isFile()) continue;
    const info = await stat(join(webRoot, entry.name));
    parts.push(`${entry.name}:${info.size}:${Math.floor(info.mtimeMs)}`);
  }
  parts.sort();
  return `${parts.join("|")}`;
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

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  context: ApiContext,
  webRoot: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  if (method !== "GET" && method !== "HEAD" && method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  const body = method === "POST" ? await readJson(req) : undefined;
  const answer = routeApi(context, {
    method,
    path: url.pathname,
    query: url.searchParams,
    body,
  });
  if (answer !== null) {
    sendJson(res, answer.status, answer.body, answer.pretty === true);
    return;
  }

  // A build stamp so an open page can notice that web/ changed and reload.
  if (url.pathname === "/api/build") {
    const stamp = await webStamp(webRoot);
    sendJson(res, 200, { stamp });
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
}

/** Build the server without listening; the caller owns the socket. */
export function createAppServer(options: AppServerOptions = {}): Server {
  const context = createApiContext(options.store ?? new GameStore());
  const webRoot = options.webRoot ?? WEB_ROOT;
  return createServer((req, res) => {
    void handle(req, res, context, webRoot).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      sendJson(res, 500, { error: "internal server error" });
    });
  });
}
