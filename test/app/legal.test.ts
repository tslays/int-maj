/**
 * Licence and notices: a quiet link in the start screen's lower-left corner opens a sheet that names
 * the licence (all rights reserved), the books the game follows and the publisher's independence
 * from the project. Its Licence page is the repository's LICENSE word for word,
 * its Credits page names every row of NOTICE.md's third-party table, and the
 * full OFL and MIT texts it shows equal the files shipped beside the work. It
 * never links to the repository.
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
const texts = readFileSync(new URL("../../app/src/notices-text.js", import.meta.url), "utf8");
const licence = readFileSync(new URL("../../LICENSE", import.meta.url), "utf8");
const notice = readFileSync(new URL("../../NOTICE.md", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const section = (open: string, close: string): string => {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start));
};

/** An HTML fragment's text, as a reader sees it: tags dropped, entities and spaces folded. */
const plain = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** A licence file's text with its line breaks and list dashes folded the same way. */
const flat = (text: string): string =>
  text
    .replace(/^- /gm, " ")
    .replace(/\s+/g, " ")
    .trim();

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

  it("never links to the repository: Licence and Credits are pages of the sheet", () => {
    const sheet = section('id="legal-sheet"', '<section class="start"');
    assert.doesNotMatch(sheet, /github\.com/);
    assert.match(sheet, /<button class="legal-row" type="button" data-page="legal-licence"><span>Licence<\/span>/);
    assert.match(sheet, /<button class="legal-row" type="button" data-page="legal-credits"><span>Credits<\/span>/);
    assert.match(sheet, /id="legal-licence" data-title="Licence" hidden/);
    assert.match(sheet, /id="legal-credits" data-title="Credits" hidden/);
    assert.match(code, /\$\("#legal-back"\)\.addEventListener\("click", back\)/);
  });

  it("the Licence page is LICENSE word for word", () => {
    assert.equal(plain(section('id="legal-licence-text"', '<button class="ghost legal-ask"')).replace(/^id="legal-licence-text"> /, ""), flat(licence));
  });

  it("asks for permission through Report a problem, the contact LICENSE names", () => {
    assert.match(licence, /To ask for permission, write to the copyright holder with "Report a problem"/);
    assert.doesNotMatch(licence, /github\.com/);
    assert.match(section('id="legal-licence"', 'id="legal-credits"'), /id="legal-report" type="button"><span>Ask for permission<\/span>/);
    assert.match(code, /closeLegal\(\);\s*\$\("#report"\)\.click\(\)/);
  });

  it("Credits names every piece of third-party material NOTICE.md lists, with its licence", () => {
    const credits = section('id="legal-credits"', '<section class="start"');
    const rows = notice.slice(notice.indexOf("## Third-party material"), notice.indexOf("## Names")).split("\n").filter((line) => /^\| (?!Material|---)/.test(line));
    assert.equal(rows.length, 5);
    const expect: readonly [RegExp, RegExp][] = [
      [/FluffyStuff/, /CC0 1\.0/],
      [/Cangjie6/, /creativecommons\.org\/licenses\/by-sa\/4\.0\/" target="_blank" rel="noopener">CC BY-SA 4\.0/],
      [/The Inter Project Authors/, /SIL Open Font License 1\.1 <button class="legal-more" type="button" data-licence="ofl"/],
      [/freesound\.org/, /CC0 1\.0/],
      [/three\.js authors/, /MIT licence <button class="legal-more" type="button" data-licence="mit"/],
    ];
    rows.forEach((row, index) => {
      const [who, terms] = expect[index]!;
      assert.match(row, who, `NOTICE.md row ${index + 1} is the expected material`);
      const card = credits.split('<article class="legal-credit">').find((part) => who.test(part)) ?? "";
      assert.match(card, terms, `Credits has ${who} with its licence`);
    });
  });

  it("the full OFL and MIT texts equal the licence files shipped beside the font and Three.js", async () => {
    const where: string = new URL("../../app/src/notices-text.js", import.meta.url).href;
    const { LICENCE_TEXTS } = (await import(where)) as { LICENCE_TEXTS: Record<string, string> };
    const ofl = readFileSync(new URL("../../app/assets/fonts/LICENSE.md", import.meta.url), "utf8").split("\n---\n")[1]!.trim();
    const mit = readFileSync(new URL("../../app/vendor/three/LICENSE", import.meta.url), "utf8").trim();
    assert.equal(LICENCE_TEXTS.ofl, ofl);
    assert.equal(LICENCE_TEXTS.mit, mit);
    assert.match(code, /import \{ LICENCE_TEXTS \} from "\.\/notices-text\.js"/);
    assert.doesNotMatch(texts, /fetch\(/);
  });

  it("opens over the start screen; Escape steps back a page, then closes it first", () => {
    assert.match(code, /\$\("#legal-close"\)\.addEventListener\("click", closeLegal\)/);
    assert.match(code, /event\.key !== "Escape"/);
    assert.match(code, /stopImmediatePropagation/);
    assert.match(code, /if \(current\(\) === HOME\) closeLegal\(\);\s*else back\(\);/);
  });

  it("loads nothing when it opens: no frame and no network call", () => {
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(code, /fetch\(|<iframe|XMLHttpRequest/);
  });

  it("is styled in the sheet's own card", () => {
    assert.match(css, /\.legal-card \{/);
    assert.match(css, /\.legal-card \{[^}]*width: min\(520px, 100%\)/);
    assert.match(css, /\.legal-bar \{[^}]*position: sticky/);
  });

  it("the repository has its licence and notice files", () => {
    assert.ok(existsSync(new URL("../../LICENSE", import.meta.url)), "LICENSE is missing");
    assert.ok(existsSync(new URL("../../NOTICE.md", import.meta.url)), "NOTICE.md is missing");
    assert.match(licence, /All rights reserved/);
    assert.equal(pkg.license, "UNLICENSED", "package.json names the licence");
  });

  it("the README points to the licence and the notices", () => {
    assert.match(readme, /all rights reserved[\s\S]*\[LICENSE\]\(LICENSE\)/);
    assert.match(readme, /\[NOTICE\.md\]\(NOTICE\.md\)/);
  });
});
