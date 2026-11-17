/** The home-screen name: each site's own name goes into the page and the manifest. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleShortName, withShortName, type ShortNameEnv } from "../../src/worker/short-name.ts";

const PAGE = `<head>
    <title>International Mahjong</title>
    <meta name="apple-mobile-web-app-title" content="int-maj" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
  </head>`;
const MANIFEST = JSON.stringify({ name: "International Mahjong", short_name: "int-maj", start_url: "./" });

function assets(files: Record<string, string>): ShortNameEnv["ASSETS"] {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const body = files[path];
      if (body === undefined) return new Response("missing", { status: 404 });
      const type = path.endsWith(".webmanifest") ? "application/manifest+json" : "text/html; charset=utf-8";
      return new Response(body, { headers: { "content-type": type, "cache-control": "no-cache" } });
    },
  };
}

const ASSETS = assets({ "/": PAGE, "/index.html": PAGE, "/manifest.webmanifest": MANIFEST });
const get = (path: string, method = "GET") => new Request(`https://int.example${path}`, { method });

describe("home-screen name", () => {
  it("writes the site's name into the page's Apple title and leaves the rest of the page alone", () => {
    const page = withShortName("/", PAGE, "int-dev");
    assert.match(page, /<meta name="apple-mobile-web-app-title" content="int-dev" \/>/);
    assert.equal(page.replace('content="int-dev"', 'content="int-maj"'), PAGE);
  });

  it("writes the site's name into the manifest's short_name and keeps the full name", () => {
    const manifest = JSON.parse(withShortName("/manifest.webmanifest", MANIFEST, "int-dev")) as Record<string, string>;
    assert.equal(manifest.short_name, "int-dev");
    assert.equal(manifest.name, "International Mahjong");
    assert.equal(manifest.start_url, "./");
  });

  it("escapes the name inside the page's attribute", () => {
    const page = withShortName("/", PAGE, 'a"<b>&');
    assert.match(page, /content="a&quot;&lt;b&gt;&amp;"/);
  });

  it("serves the page with the tester site's name through the Worker", async () => {
    const response = await handleShortName(get("/"), { APP_SHORT_NAME: "int-maj", ASSETS });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await response.text(), /content="int-maj"/);
  });

  it("serves the dev site's manifest with int-dev through the Worker", async () => {
    const response = await handleShortName(get("/manifest.webmanifest"), { APP_SHORT_NAME: "int-dev", ASSETS });
    assert.equal(response.headers.get("content-type"), "application/manifest+json");
    assert.equal((JSON.parse(await response.text()) as { short_name: string }).short_name, "int-dev");
  });

  it("passes the built file through unchanged when no site name is set", async () => {
    const response = await handleShortName(get("/manifest.webmanifest"), { ASSETS });
    assert.equal(await response.text(), MANIFEST);
  });

  it("passes other methods and failed reads through, untouched", async () => {
    const head = await handleShortName(get("/", "HEAD"), { APP_SHORT_NAME: "int-dev", ASSETS });
    assert.equal(head.status, 200);
    const missing = await handleShortName(get("/index.html"), { APP_SHORT_NAME: "int-dev", ASSETS: assets({}) });
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), "missing");
  });
});
