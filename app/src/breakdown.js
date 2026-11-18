/**
 * The score sheet behind "Score" on the result card (#212): the engine's
 * itemised ground score and doubles as rows, plus the two notes on payments.
 * Pure, so `test/app/breakdown.test.ts` needs no browser.
 */

const power = (n) => String(n).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[digit]);

/**
 * @param {readonly {kind: string, what: string, amount: number, cite: string}[] | null | undefined} items
 * @param {{cite?: boolean}} [options]  cite: show the sheet line next to each item
 * @returns {{ground: object[], doubles: object[]} | null} null when there is nothing to itemise
 */
export function breakdownRows(items, { cite = true } = {}) {
  if (!items || items.length === 0) return null;
  const row = (item) => ({
    what: item.what,
    value: item.kind === "ground" ? `+${item.amount}` : `×2${power(item.amount)}`.replace("×2⁰", "×2"),
    cite: cite ? item.cite : "",
  });
  return {
    ground: items.filter((item) => item.kind === "ground").map(row),
    doubles: items.filter((item) => item.kind === "double").map((item) => ({
      what: item.what,
      value: item.amount === 1 ? "1 double" : `${item.amount} doubles`,
      cite: cite ? item.cite : "",
    })),
  };
}

/** The two standing notes under the breakdown. */
export const PAYMENT_NOTES = [
  "Each payment rounds to the nearest 100: over 50 rounds up, 50 or less rounds down.",
  "The three losers also settle among themselves, so a loser can end up with a gain.",
];
