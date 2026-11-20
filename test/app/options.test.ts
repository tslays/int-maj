/**
 * The Settings sheet keeps one shape: four tabs of settings, each ending in the
 * same quiet reset for that tab, and a fifth tab, More, for everything that is
 * not a setting. No bar is pinned under the tabs, and the way out (Main menu,
 * or Room online) sits in the header.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../../app/index.html", import.meta.url), "utf8");
const code = readFileSync(new URL("../../app/src/options.js", import.meta.url), "utf8");

const section = (open: string, close: string): string => {
  const start = html.indexOf(open);
  assert.notEqual(start, -1, `missing ${open}`);
  return html.slice(start, html.indexOf(close, start));
};

const sheet = section('id="options-sheet"', '<div class="hand-detail" id="room-sheet"');
const head = section('<header class="options-head">', "</header>");

describe("Settings sheet", () => {
  it("has five tabs, the last one More", () => {
    const tabs = [...head.matchAll(/data-tab="(\w+)"/g)].map((match) => match[1]);
    assert.deepEqual(tabs, ["game", "table", "style", "rules", "more"]);
    assert.match(code, /const TABS = \["game", "table", "style", "rules", "more"\]/);
  });

  it("has no footer: nothing is pinned under the tabs", () => {
    assert.doesNotMatch(sheet, /<footer|option-links|options-foot/);
  });

  it("keeps the way out in the header, and the pending note in the Rules tab", () => {
    assert.match(head, /id="main-menu"/);
    assert.match(head, /id="room-open"/);
    assert.doesNotMatch(head, /hand-set-pending/);
    assert.match(section('id="panel-rules"', "</section>"), /id="hand-set-pending"/);
  });

  for (const [tab, label] of [
    ["game", "Reset game settings"],
    ["table", "Reset table settings"],
    ["style", "Reset style"],
    ["rules", "Reset house rules"],
  ]) {
    it(`ends the ${tab} tab with its own reset`, () => {
      const panel = section(`id="panel-${tab}"`, "</section>");
      assert.equal(panel.match(/class="tab-reset"/g)?.length, 1);
      assert.match(panel, new RegExp(`<div class="tab-reset">\\s*<button class="option-link" id="${tab}-reset" type="button">${label}</button>\\s*</div>\\s*$`));
    });
  }

  it("lists every place that is not a setting under More, then Reset all settings", () => {
    const more = section('id="panel-more"', "</section>");
    const rows = [...more.matchAll(/class="more-row" id="([\w-]+)"/g)].map((match) => match[1]);
    assert.deepEqual(rows, ["help", "report", "support-open", "install-open", "legal-open"]);
    assert.ok(more.indexOf('id="reset-settings"') > more.indexOf("</nav>"), "Reset all comes after the rows");
    assert.match(more, /id="reset-confirm"/);
  });
});
