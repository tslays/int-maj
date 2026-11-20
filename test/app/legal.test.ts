/**
 * Licence and notices: a quiet link in the start screen's lower-left corner opens a sheet that names
 * the licence (all rights reserved), the books the game follows and the publisher's independence
 * from the project. The repository's LICENSE and NOTICE.md must exist, and the
 * sheet's links must point at them.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../../app/index.html", import.meta.url), "utf8");
const code = readFileSync(new URL("../../app/src/legal.js", import.meta.url), "utf8");
const guide = readFileSync(new URL("../../app/src/guide.js", import.meta.url), "utf8");
const start = readFileSync(new URL("../../app/src/start.js", import.meta.url), "utf8");
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
  it("opens from a quiet link in the start screen's lower-left corner, and nowhere else", () => {
    assert.match(
      section('<section class="start" id="start"', "</section>"),
      /<\/div>\s*<p class="start-fine"><button class="start-fine-link" id="start-notice" type="button">Licence and notices<\/button><\/p>/,
    );
    assert.match(start, /import \{ openLegal \} from "\.\/legal\.js"/);
    assert.match(start, /\$\("#start-notice"\)\.addEventListener\("click", openLegal\)/);
    assert.doesNotMatch(guide, /openLegal|Licence and notices/, "the guide has no card for it");
    assert.doesNotMatch(section('id="option-links"', "</nav>"), /legal|licen[cs]e/i, "the Settings footer stays short");
  });

  it("stays small and muted in the lower-left corner: the build label's grey, a fine size, no button look", () => {
    const place = /\.start-fine \{([^}]*)\}/.exec(css)?.[1] ?? "";
    assert.match(place, /position: fixed/);
    assert.match(place, /left: calc\(var\(--safe-l\) - 10px\)/);
    assert.match(place, /bottom: max\(2px, env\(safe-area-inset-bottom\)\)/);
    const rule = /\.start-fine-link \{([^}]*)\}/.exec(css)?.[1] ?? "";
    assert.match(rule, /font-size: 11px/);
    assert.match(rule, /color: rgba\(255, 255, 255, 0\.38\)/);
    assert.match(rule, /background: none/);
    assert.match(rule, /min-height: 32px/, "still easy to tap");
  });

  it("names the licence, the books, the publisher and that the project is independent", () => {
    const sheet = section('id="legal-sheet"', '<section class="start"');
    assert.match(sheet, /All rights reserved/);
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

  it("opens over the start screen and Escape closes it first", () => {
    assert.match(code, /\$\("#legal-close"\)\.addEventListener\("click", closeLegal\)/);
    assert.match(code, /event\.key !== "Escape"/);
    assert.match(code, /stopImmediatePropagation/);
  });

  it("loads nothing when it opens: no frame and no network call", () => {
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(code, /fetch\(|<iframe|XMLHttpRequest/);
  });

  it("is styled in the sheet's own card", () => {
    assert.match(css, /\.legal-card \{/);
    assert.match(css, /\.legal-links a \{/);
  });

  it("has the repository licence and notice files the sheet links to", () => {
    assert.ok(existsSync(new URL("../../LICENSE", import.meta.url)), "LICENSE is missing");
    assert.ok(existsSync(new URL("../../NOTICE.md", import.meta.url)), "NOTICE.md is missing");
    assert.match(readFileSync(new URL("../../LICENSE", import.meta.url), "utf8"), /All rights reserved/);
    assert.equal(pkg.license, "UNLICENSED", "package.json names the licence");
  });

  it("the README points to the licence and the notices", () => {
    assert.match(readme, /all rights reserved[\s\S]*\[LICENSE\]\(LICENSE\)/);
    assert.match(readme, /\[NOTICE\.md\]\(NOTICE\.md\)/);
  });
});
