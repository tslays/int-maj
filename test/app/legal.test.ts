/**
 * Licence and notices: the last card of Help's "More" tab opens a sheet that names
 * the MIT licence, the books the game follows and the publisher's independence
 * from the project. The repository's LICENSE and NOTICE.md must exist, and the
 * sheet's links must point at them.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../../app/index.html", import.meta.url), "utf8");
const code = readFileSync(new URL("../../app/src/legal.js", import.meta.url), "utf8");
const guide = readFileSync(new URL("../../app/src/guide.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/styles.css", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const section = (open: string, close: string): string => {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start));
};

const REPO = "https://github.com/tslays/int-maj/blob/main";

describe("Licence and notices", () => {
  it("opens from Help's last card, not from the Settings footer, which stays short", () => {
    assert.doesNotMatch(section('id="option-links"', "</nav>"), /legal|licen[cs]e/i);
    assert.match(guide, /import \{ openLegal \} from "\.\/legal\.js"/);
    assert.match(guide, /title: "Licence and notices"[\s\S]*?addEventListener\("click", openLegal\)/);
  });

  it("names the licence, the books, the publisher and that the project is independent", () => {
    const sheet = section('id="legal-sheet"', '<section class="start"');
    assert.match(sheet, /MIT licence/);
    assert.match(sheet, /<i>The Game of Mah Jong Illustrated<\/i>/);
    assert.match(sheet, /<i>The Mah Jong Player's Companion<\/i>/);
    assert.match(sheet, /Patricia A\. Thompson and Betty Maloney/);
    assert.match(sheet, /Kangaroo Press/);
    assert.match(sheet, /independent project\. It is not made, endorsed or sponsored/);
  });

  it("links to the full LICENSE and NOTICE on GitHub, in a new tab", () => {
    const links = section('class="legal-links"', "</nav>");
    assert.match(links, new RegExp(`href="${REPO}/LICENSE" target="_blank" rel="noopener"`));
    assert.match(links, new RegExp(`href="${REPO}/NOTICE\\.md" target="_blank" rel="noopener"`));
  });

  it("sits over the guide and closes before it: later in the page, Escape caught first", () => {
    assert.ok(html.indexOf('id="legal-sheet"') > html.indexOf('id="help-sheet"'), "drawn above Help");
    assert.match(code, /\$\("#legal-close"\)\.addEventListener\("click", closeLegal\)/);
    assert.match(code, /event\.key !== "Escape"/);
    assert.match(code, /stopImmediatePropagation/);
  });

  it("loads nothing when it opens: no frame and no network call", () => {
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(code, /fetch\(|<iframe|XMLHttpRequest/);
  });

  it("is styled in the sheet's own card, not the start screen's", () => {
    assert.match(css, /\.legal-card \{/);
    assert.match(css, /\.legal-links a \{/);
    assert.doesNotMatch(section('id="start"', "</section>"), /legal/i);
  });

  it("has the repository licence and notice files the sheet links to", () => {
    assert.ok(existsSync(new URL("../../LICENSE", import.meta.url)), "LICENSE is missing");
    assert.ok(existsSync(new URL("../../NOTICE.md", import.meta.url)), "NOTICE.md is missing");
    assert.match(readFileSync(new URL("../../LICENSE", import.meta.url), "utf8"), /^MIT License/);
    assert.equal(pkg.license, "MIT", "package.json names the licence");
  });

  it("the README points to the licence and the notices", () => {
    assert.match(readme, /\[MIT licence\]\(LICENSE\)/);
    assert.match(readme, /\[NOTICE\.md\]\(NOTICE\.md\)/);
  });
});
