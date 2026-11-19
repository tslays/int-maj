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

  it("loads nothing from Ko-fi: no frame, the page opens only from its button", () => {
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(code, /iframe/);
  });

  it("opens int-maj's own Ko-fi page on top of the game, where every way to pay works", () => {
    assert.match(
      section('id="support-sheet"', '<section class="start"'),
      /<a [^>]*id="support-go"[^>]*href="https:\/\/ko-fi\.com\/int_maj" target="_blank" rel="noopener"/,
    );
    assert.match(code, /"https:\/\/ko-fi\.com\/int_maj"/);
  });
});
