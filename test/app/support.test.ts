/**
 * Support int-maj: one quiet link in the Settings footer and nowhere else,
 * a sheet that loads Ko-fi's panel only when opened, and a plain link when
 * the panel cannot come.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../../app/index.html", import.meta.url), "utf8");
const code = readFileSync(new URL("../../app/src/support.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/styles.css", import.meta.url), "utf8");

const section = (open: string, close: string): string => {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start));
};

describe("Support int-maj", () => {
  it("is a link in the Settings footer", () => {
    assert.match(section('id="option-links"', "</nav>"), /id="support-open"[^>]*>Support int-maj</);
  });

  it("is not on the start screen or anywhere else in the page", () => {
    assert.doesNotMatch(section('<section class="start" id="start"', "</section>"), /support|ko-fi/i);
    assert.equal(html.match(/id="support-open"/g)?.length, 1);
  });

  it("stays in the footer when Settings is opened from the start screen", () => {
    assert.match(css, /\.option-links\.from-start \.option-link:not\([^)]*#support-open[^)]*\)/);
  });

  it("loads Ko-fi only when opened: no frame in the page itself", () => {
    assert.doesNotMatch(html, /<iframe/);
    assert.match(section('id="support-sheet"', '<section class="start"'), /id="support-frame"><\/div>/);
  });

  it("embeds the int_maj panel, with payments allowed and no title tooltip", () => {
    assert.match(code, /"https:\/\/ko-fi\.com\/int_maj"/);
    assert.match(code, /hidefeed=true&widget=true&embed=true&preview=true/);
    assert.match(code, /setAttribute\("allow", "payment"\)/);
    assert.match(code, /setAttribute\("aria-label"/);
  });

  it("offers the plain Ko-fi link when the panel cannot load", () => {
    assert.match(section('id="support-sheet"', '<section class="start"'), /id="support-fallback" hidden>[\s\S]*href="https:\/\/ko-fi\.com\/int_maj" target="_blank" rel="noopener"/);
  });
});
