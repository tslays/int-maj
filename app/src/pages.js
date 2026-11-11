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
 *
 * @param {{illustrated?: readonly number[], companion?: readonly number[]} | null | undefined} pages
 */
export function bookPages(pages) {
  return BOOKS.filter(([key]) => (pages?.[key]?.length ?? 0) > 0)
    .map(([key, name]) => citePages(name, pages[key]))
    .join(" · ");
}
