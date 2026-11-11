/**
 * Page citations always name their book: the Illustrated and the Companion
 * number their pages independently, so a bare page number is ambiguous.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error plain browser module without types
import { bookPages, citePages } from "../../app/src/pages.js";
import { PATTERNS } from "../../src/core/patterns/table.ts";

describe("page citations", () => {
  it("names the book and counts the pages", () => {
    assert.equal(citePages("Illustrated", [38]), "Illustrated p. 38");
    assert.equal(citePages("Companion", [10, 27]), "Companion pp. 10, 27");
  });

  it("lists the primary book first and skips a book without a page", () => {
    assert.equal(
      bookPages({ illustrated: [38], companion: [10, 27] }),
      "Illustrated p. 38 · Companion pp. 10, 27",
    );
    assert.equal(bookPages({ illustrated: [30], companion: [] }), "Illustrated p. 30");
    assert.equal(bookPages({ illustrated: [], companion: [60] }), "Companion p. 60");
    assert.equal(bookPages(null), "");
  });

  it("cites a named book for every catalogue hand", () => {
    for (const pattern of PATTERNS) {
      assert.match(bookPages(pattern.pages), /^(Illustrated|Companion) pp?\. \d/, pattern.id);
    }
  });

  it("keeps the two catalogues apart: 54 Illustrated hands, 35 Companion-only", () => {
    const illustrated = PATTERNS.filter((pattern) => pattern.pages.illustrated.length > 0);
    assert.equal(illustrated.length, 54);
    assert.equal(PATTERNS.length - illustrated.length, 35);
  });
});
