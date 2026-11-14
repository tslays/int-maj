/**
 * The top-down view of the ponds hides the claim buttons (Chow, Pong, Kong,
 * Fishing) so the whole table shows; the table view brings them back. Pass and
 * Mah Jong are not claim buttons and stay. The rule lives in the stylesheet,
 * so this reads it there.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const STYLES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "styles.css");

/** The stylesheet with its comments removed, so a rule is matched by its selector and body. */
function css(): string {
  return readFileSync(STYLES, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the top-down pond view", () => {
  it("hides the claim buttons, fishing included", () => {
    assert.match(css(), /html\.pond-zoom \.act-claim\s*\{\s*display:\s*none;?\s*\}/);
  });

  it("keeps Pass and Mah Jong on screen", () => {
    const hidden = css().match(/html\.pond-zoom[^{]*\{[^}]*\}/g) ?? [];
    for (const rule of hidden) {
      assert.doesNotMatch(rule, /\.act-(pass|win)\b/, `the zoomed view must not hide ${rule}`);
    }
  });

  it("does not hide the buttons outside the zoomed view", () => {
    // A rule whose selector is the bare `.act-claim` (not one under `html.pond-zoom`).
    assert.doesNotMatch(css(), /(?:^|\})\s*\.act-claim\s*\{[^}]*display:\s*none/);
  });
});
