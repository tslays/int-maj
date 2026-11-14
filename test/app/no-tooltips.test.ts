/**
 * The app shows no tooltips. The browser's own pop-up box (a `title` on any
 * element, including an image or an SVG `<title>`) is never used, and no
 * custom hover box is added either. The scan reads the shipped source, so a
 * new one fails the suite; `scripts/smoke.ts` checks the live page as well.
 * Explanations go in visible text, the guide, or an `aria-label`.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

/** Each way a tooltip gets into the page, by what the code writes. */
const WAYS: readonly { name: string; pattern: RegExp }[] = [
  { name: "a title property (el.title = ...)", pattern: /\.title\s*=(?!=)/ },
  { name: "a title attribute set in code", pattern: /setAttribute\(\s*["']title["']/ },
  { name: "a title attribute in markup", pattern: /\stitle=["'\\]/ },
  { name: "a title element (SVG or HTML)", pattern: /<title[\s>]/ },
  { name: "a title made by createElement", pattern: /createElement(?:NS)?\([^)]*["']title["']/ },
  { name: "a title read by CSS", pattern: /attr\(\s*(?:title|data-tip)/ },
  { name: "the word tooltip", pattern: /tooltip/i },
];

/** The page's own `<title>` names the browser tab; it is not a tooltip. */
const DOCUMENT_TITLE = /<title>[^<]*<\/title>/;

/** Every line of `text` that one of the ways matches, as `line: name`. */
function findTooltips(text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (const { name, pattern } of WAYS) {
      if (pattern.test(line)) found.push(`line ${index + 1}: ${name}: ${line.trim()}`);
    }
  });
  return found;
}

/** The app's files that can put something on screen: the scripts, the page and its styles. */
function appFiles(): { file: string; text: string }[] {
  const scripts = readdirSync(join(APP, "src"), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join("src", name));
  return ["index.html", "styles.css", ...scripts].map((file) => {
    const text = readFileSync(join(APP, file), "utf8");
    return { file, text: file === "index.html" ? text.replace(DOCUMENT_TITLE, "") : text };
  });
}

describe("no tooltips", () => {
  it("the app shows no title tooltip and no hover box", () => {
    const found = appFiles().flatMap(({ file, text }) => findTooltips(text).map((hit) => `${file} ${hit}`));
    assert.deepEqual(found, [], "every tooltip is removed, or its words moved into visible text or an aria-label");
  });

  it("catches each way a tooltip gets in", () => {
    assert.match(findTooltips('row.title = "Concealed";')[0]!, /a title property/);
    assert.match(findTooltips('button.setAttribute("title", words);')[0]!, /a title attribute set in code/);
    assert.match(findTooltips('html = \'<span title="Pin">\';')[0]!, /a title attribute in markup/);
    assert.match(findTooltips('svg.innerHTML = "<svg><title>Pin</title></svg>";')[0]!, /a title element/);
    assert.match(findTooltips('document.createElementNS(ns, "title");')[0]!, /a title made by createElement/);
    assert.match(findTooltips(".tile::after { content: attr(title); }")[0]!, /a title read by CSS/);
    assert.match(findTooltips("const tooltip = makeBox();")[0]!, /the word tooltip/);
  });

  it("leaves alone the titles of cards, arguments and reads", () => {
    assert.deepEqual(findTooltips('{ title: "The aim", text: "..." }'), []);
    assert.deepEqual(findTooltips('function showTip(id, text, title = "Tip") {}'), []);
    assert.deepEqual(findTooltips('const title = document.createElement("h2");'), []);
    assert.deepEqual(findTooltips('el("h3", "", card.title);'), []);
    assert.deepEqual(findTooltips('if (hand.title == "x") return;'), []);
  });

  it("does not count the page's own document title", () => {
    const page = "<head>\n    <title>International Mahjong</title>\n  </head>";
    assert.deepEqual(findTooltips(page.replace(DOCUMENT_TITLE, "")), []);
  });
});
