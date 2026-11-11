/**
 * Page citations, always with the book's name. The table cites two books
 * that number their pages independently - *The Game of Mah Jong Illustrated*
 * and *The Mah Jong Player's Companion* - so a bare "p. 38" would send a
 * player to the wrong book half the time. Pure words, no browser.
 */

const BOOKS = [
  ["illustrated", "Illustrated"],
  ["companion", "Companion"],
];

/** "Illustrated p. 38", "Companion pp. 10, 27". */
export function citePages(book, pages) {
  return `${book} ${pages.length > 1 ? "pp." : "p."} ${pages.join(", ")}`;
}

/**
 * Every book a hand is printed in, the primary book first:
 * "Illustrated p. 38 · Companion pp. 10, 27". Empty when there is no page.
 * A table playing with the Companion's hands only has no use for the other
 * book, so `companionOnly` leaves the Illustrated out.
 *
 * @param {{illustrated?: readonly number[], companion?: readonly number[]} | null | undefined} pages
 * @param {boolean} [companionOnly]
 */
export function bookPages(pages, companionOnly = false) {
  return BOOKS.filter(([key]) => !(companionOnly && key === "illustrated") && (pages?.[key]?.length ?? 0) > 0)
    .map(([key, name]) => citePages(name, pages[key]))
    .join(" · ");
}

/**
 * A hand's printed sample pictures, as a Companion-only table sees them: the
 * Illustrated book's pictures are dropped, and a picture both books print
 * keeps only its Companion source.
 *
 * @template {{ sources: readonly { book: string, page: number }[] }} T
 * @param {readonly T[]} samples
 * @param {boolean} companionOnly
 * @returns {T[]}
 */
export function visibleSamples(samples, companionOnly) {
  if (!companionOnly) return [...samples];
  const out = [];
  for (const sample of samples) {
    const sources = sample.sources.filter((source) => source.book.includes("Companion"));
    if (sources.length > 0) out.push({ ...sample, sources });
  }
  return out;
}
