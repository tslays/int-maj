/**
 * The landing page (`site/`, https://www.mah-jong.workers.dev): its Play
 * buttons open the tester site, every file it names is in the build, it has
 * no browser tooltips (AGENTS.md), and it names the books only by title.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { buildSite } from "../../scripts/build-site.ts";

const TESTERS = "https://int.mah-jong.workers.dev";

describe("the landing page", () => {
  let out = "";
  let page = "";
  let css = "";
  before(async () => {
    out = mkdtempSync(join(tmpdir(), "int-maj-site-"));
    await buildSite(out);
    page = readFileSync(join(out, "index.html"), "utf8");
    css = readFileSync(join(out, "site.css"), "utf8");
  });
  after(() => rmSync(out, { recursive: true, force: true }));

  it("has Play buttons, and each opens the tester site", () => {
    const plays = [...page.matchAll(/<a\b[^>]*\bdata-play\b[^>]*>/g)].map((match) => match[0]);
    assert.ok(plays.length >= 2, "a Play button at the top and in the hero");
    for (const tag of plays) assert.match(tag, new RegExp(`href="${TESTERS}"`), tag);
    assert.match(page, />Play now</);
  });

  it("has every file it names in the build", () => {
    const refs = [
      ...page.matchAll(/\b(?:src|href|content)="([^"#:]+\.(?:webp|png|svg|css|woff2))"/g),
      ...page.matchAll(/srcset="([^"]+)"/g),
      ...css.matchAll(/url\("([^"]+)"\)/g),
    ].flatMap((match) => match[1]!.split(",").map((part) => part.trim().split(/\s+/)[0]!));
    assert.ok(refs.length > 10);
    for (const ref of refs) assert.ok(existsSync(join(out, ref)), `missing ${ref}`);
  });

  it("shows no browser tooltip", () => {
    const text = page.replace(/<title>[^<]*<\/title>/, "");
    assert.doesNotMatch(text, /\stitle=["']/);
    assert.doesNotMatch(text, /<title[\s>]/);
  });

  it("names the books only by title", () => {
    assert.match(page, /<cite>The Game of Mah Jong Illustrated<\/cite>/);
    assert.match(page, /<cite>The Mah Jong Player's Companion<\/cite>/);
    // A page citation such as "p. 58" would invite quoting; the page has none.
    assert.doesNotMatch(page.replace(/<[^>]+>/g, " "), /\bpp?\.\s*\d/);
  });

  it("keeps the licence notes beside the borrowed font and icons", () => {
    assert.ok(existsSync(join(out, "assets/fonts/LICENSE.md")));
    assert.ok(existsSync(join(out, "assets/icons/LICENSE.md")));
  });
});
