#!/usr/bin/env node
/**
 * Serve the offline build (`dist/`) as plain static files, the way any web
 * host will: no API, no game logic on the server. Use it to try the built app
 * before deploying it.
 *
 *   npm run build && npm run preview
 *   npm run preview -- --port 8091
 *   npm run preview -- --lan     # also reachable from a phone on your Wi-Fi
 *
 * `--lan` binds every network interface, so anyone on the same network can
 * open the page. Over a plain-http LAN address the phone plays the game but
 * cannot install it offline: browsers allow service workers only on https or
 * localhost.
 */

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const argv = process.argv.slice(2);
const port = Number(option(argv, "--port") ?? 8091);
const lan = argv.includes("--lan");
const host = lan ? "0.0.0.0" : "127.0.0.1";

try {
  await stat(join(DIST, "index.html"));
} catch {
  console.error("No build found: run `npm run build` first.");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(DIST, path));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      // The service worker must always be re-checked, or updates never land.
      "cache-control": path === "/sw.js" ? "no-cache" : "public, max-age=60",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
});

server.listen(port, host, () => {
  console.log(`Offline build on http://127.0.0.1:${port}/`);
  if (!lan) return;
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        console.log(`  on your network: http://${entry.address}:${port}/`);
      }
    }
  }
});
