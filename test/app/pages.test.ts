/**
 * Page citations always name their book: the Illustrated and the Companion
 * number their pages independently, so a bare page number is ambiguous.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error plain browser module without types
import { bookPages, citePages, visibleSamples } from "../../app/src/pages.js";
import { COMPANION_UNILLUSTRATED_HANDS, ILLUSTRATED_ONLY_HANDS, PATTERNS } from "../../src/core/patterns/table.ts";
import { BOOK_TITLE, SAMPLES } from "../../src/core/patterns/samples.ts";

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

// The Companion sets: a table that chose the Companion sees nothing of the other book.
describe("a Companion-only table's page references and pictures", () => {
  it("names only the Companion's pages", () => {
    const pages = { illustrated: [40], companion: [49] };
    assert.equal(bookPages(pages), "Illustrated p. 40 · Companion p. 49");
    assert.equal(bookPages(pages, true), "Companion p. 49");
    assert.equal(bookPages({ illustrated: [30], companion: [] }, true), "");
  });

  it("drops the Illustrated pictures and the Illustrated source of a shared one", () => {
    const both = { sources: [{ book: BOOK_TITLE.illustrated, page: 38 }, { book: BOOK_TITLE.companion, page: 10 }], groups: [] };
    const only = { sources: [{ book: BOOK_TITLE.illustrated, page: 42 }], groups: [] };
    assert.equal(visibleSamples([both, only], false).length, 2);
    const seen = visibleSamples([both, only], true);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].sources, [{ book: BOOK_TITLE.companion, page: 10 }]);
  });

  it("agrees with the books: the unpictured Companion hands are the ones with no Companion picture", () => {
    // The pictured hand set is built from the Companion's "N/I" marks; the sample data is
    // read tile by tile from the pages. The two must name the same hands.
    const noCompanionPicture = PATTERNS.filter(
      (pattern) =>
        pattern.id !== "chinese-ordinary" && !(SAMPLES[pattern.id] ?? []).some((sample) => sample.book === "companion"),
    ).map((pattern) => pattern.id);
    assert.deepEqual(noCompanionPicture.sort(), [...ILLUSTRATED_ONLY_HANDS, ...COMPANION_UNILLUSTRATED_HANDS].sort());
  });
});
