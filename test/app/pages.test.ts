/**
 * Page references in the app: a table playing with the Companion's hands only
 * never shows the Illustrated book, in the hand sheet or the result card.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PATTERNS } from "../../src/core/patterns/table.ts";
import { pagesOf } from "../../src/core/game/closest.ts";

// @ts-expect-error - a plain browser module without type declarations
const { describePages } = await import("../../app/src/pages.js");

describe("page references", () => {
  it("names both books when every hand is in play, and only the Companion otherwise", () => {
    const odds = pagesOf(PATTERNS.find((pattern) => pattern.id === "chinese-odds"));
    assert.deepEqual(odds, { companion: [49], illustrated: [40] });
    assert.equal(describePages(odds, false), "Companion p. 49 · Illustrated p. 40");
    assert.equal(describePages(odds, true), "Companion p. 49");
  });

  it("lists several pages and cites nothing for a hand the Companion lacks", () => {
    const sparrow = pagesOf(PATTERNS.find((pattern) => pattern.id === "sparrows-sanctuary"));
    assert.equal(describePages(sparrow, true), "Companion pp. 21, 49, 53");
    const kong = pagesOf(PATTERNS.find((pattern) => pattern.id === "all-kong"));
    assert.equal(describePages(kong, false), "Illustrated p. 30");
    assert.equal(describePages(kong, true), null);
  });

  it("keeps every Illustrated page out of a Companion-only hand's references", () => {
    for (const pattern of PATTERNS) {
      if (pattern.illustratedPages.length === 0) continue;
      const text = describePages(pagesOf(pattern), true);
      assert.ok(text === null || !text.includes("Illustrated"), pattern.id);
    }
  });
});
