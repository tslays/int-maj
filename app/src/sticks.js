/**
 * The counter sticks: what a payment looks like in the players' own counters.
 * Pure, so it needs no browser and is tested on real engine hands.
 *
 * The values and how many of each a player starts with are the Illustrated's
 * Western counters (p. 23): 10 × 100, 8 × 500, 7 × 1000 and 1 × 4000, 16 000
 * in all. The Illustrated gives them no colours; the Companion (p. 55) makes
 * them from "small sticks dipped in the appropriate coloured dye" and names
 * the colours for the same set: ten yellow (100), eight green (500), seven
 * blue (1000) and one red (4000). Every payment is a multiple of 100
 * (Illustrated p. 22), so every payment can be shown in sticks.
 *
 * Neither book says how change is made, so a payment is simply shown in the
 * fewest sticks. That is a picture of the payment, nothing more: the scores
 * come from the ledger, never from the sticks.
 */

/** The four sticks, largest first: value, colour, and how many a player starts with. */
export const STICKS = Object.freeze([
  Object.freeze({ value: 4000, color: "red", count: 1 }),
  Object.freeze({ value: 1000, color: "blue", count: 7 }),
  Object.freeze({ value: 500, color: "green", count: 8 }),
  Object.freeze({ value: 100, color: "yellow", count: 10 }),
]);

/** A stick's colour by its value. */
export function stickColor(value) {
  const stick = STICKS.find((entry) => entry.value === value);
  if (!stick) throw new Error(`no counter is worth ${value}`);
  return stick.color;
}

/**
 * A payment in the fewest sticks, largest first: 1200 is [1000, 100, 100].
 * Throws on a payment the sticks cannot make (negative, or not in hundreds).
 */
export function sticksFor(points) {
  if (!Number.isInteger(points) || points < 0 || points % 100 !== 0) {
    throw new Error(`${points} cannot be paid in counters`);
  }
  const sticks = [];
  let left = points;
  for (const { value } of STICKS) {
    while (left >= value) {
      sticks.push(value);
      left -= value;
    }
  }
  return sticks;
}

/**
 * The exchange to animate, from the ledger: phases in ledger order, one per
 * run of entries of the same kind (the winner's payments fly together, then
 * the fishing payments, then the differences between losers). Within a
 * phase, payments between the same two seats are merged. Entries with no
 * points are left out.
 *
 * @param {readonly { kind?: string, from: string, to: string, points: number | null }[]} ledger
 * @returns {{ kind: string, transfers: { from: string, to: string, points: number, sticks: number[] }[] }[]}
 */
export function exchangePlan(ledger) {
  const phases = [];
  for (const entry of ledger) {
    if (entry.points === null || entry.points <= 0) continue;
    const kind = entry.kind ?? "other";
    let phase = phases[phases.length - 1];
    if (!phase || phase.kind !== kind) {
      phase = { kind, transfers: [] };
      phases.push(phase);
    }
    const same = phase.transfers.find((transfer) => transfer.from === entry.from && transfer.to === entry.to);
    if (same) same.points += entry.points;
    else phase.transfers.push({ from: entry.from, to: entry.to, points: entry.points, sticks: [] });
  }
  for (const phase of phases) {
    // A sum agreed at the table (a Goulash pool) need not be in hundreds: its
    // odd remainder has no stick, but the numbers still come from the ledger.
    for (const transfer of phase.transfers) transfer.sticks = sticksFor(transfer.points - (transfer.points % 100));
  }
  return phases;
}
