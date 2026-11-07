#!/usr/bin/env node
/**
 * Build the offline table: a static folder that plays the whole game in the
 * browser, with no server behind it.
 *
 *   npm run build            # writes dist/
 *   node tools/build-web.ts --out some/dir
 *
 * What it does, with no dependencies:
 *
 * 1. Walks the module graph from `src/web/local.ts` (the in-page API) and
 *    turns each TypeScript file into plain JavaScript with Node's own type
 *    stripper, rewriting `./x.ts` imports to `./x.js`. The engine is the same
 *    source the tests run; nothing is reimplemented for the browser.
 * 2. Copies the client (`web/`) and tile art next to it, marks the page
 *    `data-transport="local"` so `app.js` answers its API in-page, and adds
 *    the install metadata an iPhone needs for "Add to Home Screen".
 * 3. Writes a service worker that pre-caches every file under a cache named
 *    after the content hash, so the installed app opens in airplane mode and
 *    a new deploy replaces the old files in one step.
 */

import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const WEB = join(ROOT, "web");
const ENTRY = join(SRC, "web", "local.ts");

/** Client files copied as they are; design references stay local. */
const WEB_FILES = ["app.js", "layout.js", "tiles.js", "app.css"] as const;

const APP_NAME = "International Mahjong";
const SHORT_NAME = "Mahjong";
const THEME_COLOR = "#1f3b2d";

const IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+?)\.ts\2/g;

export interface BuildResult {
  readonly outDir: string;
  readonly files: readonly string[];
  readonly version: string;
}

function parseOut(argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  if (index >= 0 && argv[index + 1] !== undefined) return resolve(argv[index + 1]!);
  return join(ROOT, "dist");
}

/** Strip one module's types and point its relative imports at `.js` files. */
function transpile(source: string): { code: string; imports: string[] } {
  const stripped = stripTypeScriptTypes(source, { mode: "strip" });
  const imports: string[] = [];
  const code = stripped.replace(IMPORT_SPECIFIER, (_match, lead: string, quote: string, path: string) => {
    imports.push(`${path}.ts`);
    return `${lead}${quote}${path}.js${quote}`;
  });
  return { code, imports };
}

/** Every module reachable from the entry, as `src/`-relative `.js` outputs. */
async function buildEngine(outDir: string): Promise<string[]> {
  const written: string[] = [];
  const seen = new Set<string>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.startsWith(SRC)) throw new Error(`import leaves src/: ${file}`);
    const { code, imports } = transpile(await readFile(file, "utf8"));
    if (/\bfrom\s*["']node:/.test(code)) {
      throw new Error(`${relative(ROOT, file)} imports a Node built-in; it cannot run in the browser`);
    }
    const target = join("engine", relative(SRC, file)).replace(/\.ts$/, ".js");
    await mkdir(dirname(join(outDir, target)), { recursive: true });
    await writeFile(join(outDir, target), code);
    written.push(target);
    for (const specifier of imports) queue.push(resolve(dirname(file), specifier));
  }
  return written;
}

async function copyClient(outDir: string): Promise<string[]> {
  const written: string[] = [];
  for (const name of WEB_FILES) {
    await cp(join(WEB, name), join(outDir, name));
    written.push(name);
  }
  await mkdir(join(outDir, "tiles"), { recursive: true });
  for (const name of await readdir(join(WEB, "tiles"))) {
    if (!name.endsWith(".svg")) continue;
    await cp(join(WEB, "tiles", name), join(outDir, "tiles", name));
    written.push(`tiles/${name}`);
  }
  await cp(join(WEB, "tiles", "LICENSE.md"), join(outDir, "tiles", "LICENSE.md"));
  await mkdir(join(outDir, "icons"), { recursive: true });
  for (const name of await readdir(join(WEB, "icons"))) {
    if (!/\.(png|svg)$/.test(name)) continue;
    await cp(join(WEB, "icons", name), join(outDir, "icons", name));
    written.push(`icons/${name}`);
  }
  return written;
}

const HEAD_EXTRAS = `
    <meta name="theme-color" content="${THEME_COLOR}" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${SHORT_NAME}" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="icon" href="icons/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />`;

/**
 * Register the worker, and reload once when a new deploy takes over. The game
 * is saved after every move, so the reload resumes the same hand.
 */
const SW_REGISTER = `
    <script>
      if ("serviceWorker" in navigator) {
        const hadController = navigator.serviceWorker.controller !== null;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (hadController) location.reload();
        });
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    </script>`;

async function writePage(outDir: string): Promise<void> {
  let html = await readFile(join(WEB, "index.html"), "utf8");
  const replace = (from: string | RegExp, to: string) => {
    const next = html.replace(from, to);
    if (next === html) throw new Error(`index.html no longer contains ${String(from)}`);
    html = next;
  };
  replace(/<html lang="en">/, `<html lang="en" data-transport="local">`);
  replace(/<title>[^<]*<\/title>/, `<title>${APP_NAME}</title>${HEAD_EXTRAS}`);
  // The design overlay is a gitignored local file; the offline page has none.
  replace(/\s*src="reference3\.png"/, "");
  replace(/<\/body>/, `${SW_REGISTER}\n  </body>`);
  await writeFile(join(outDir, "index.html"), html);
}

async function writeManifest(outDir: string): Promise<void> {
  const manifest = {
    name: APP_NAME,
    short_name: SHORT_NAME,
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "landscape",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
  await writeFile(join(outDir, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function hashFiles(outDir: string, files: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update(await readFile(join(outDir, file)));
  }
  return hash.digest("hex").slice(0, 12);
}

function serviceWorker(version: string, files: readonly string[]): string {
  return `// Generated by tools/build-web.ts. Cache-first: the app runs offline.
const CACHE = "int-maj-${version}";
const FILES = ${JSON.stringify(["./", ...files], null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches
      .match(event.request, { ignoreSearch: true })
      .then((hit) => hit ?? fetch(event.request)),
  );
});
`;
}

export async function build(outDir: string): Promise<BuildResult> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const files = [
    ...(await copyClient(outDir)),
    ...(await buildEngine(outDir)),
  ];
  await writePage(outDir);
  await writeManifest(outDir);
  files.push("index.html", "manifest.webmanifest");
  const version = await hashFiles(outDir, files);
  await writeFile(join(outDir, "version.txt"), `${version}\n`);
  await writeFile(join(outDir, "sw.js"), serviceWorker(version, files));
  return { outDir, files, version };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await build(parseOut(process.argv.slice(2)));
  console.log(
    `Built ${result.files.length} files into ${relative(process.cwd(), result.outDir) || "."} (version ${result.version})`,
  );
}
