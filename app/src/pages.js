/**
 * Where a hand is printed, in words. A pure function so the wording can be
 * tested: the Companion rule sets know only the Companion, so Illustrated
 * pages never show there; with every hand in play both books are named.
 */

const list = (numbers) => (numbers.length > 1 ? `pp. ${numbers.join(", ")}` : `p. ${numbers[0]}`);

/**
 * @param {{ companion: readonly number[], illustrated: readonly number[] }} pages
 * @param {boolean} companionOnly  the hand is played with the Companion's hands only
 * @returns {string | null}  e.g. "Companion p. 49 · Illustrated p. 40", or null when there is nothing to cite
 */
export function describePages(pages, companionOnly) {
  const parts = [];
  if (pages.companion.length > 0) parts.push(`Companion ${list(pages.companion)}`);
  if (pages.illustrated.length > 0 && !companionOnly) parts.push(`Illustrated ${list(pages.illustrated)}`);
  return parts.length === 0 ? null : parts.join(" · ");
}
