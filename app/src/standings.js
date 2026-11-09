/**
 * The final standings: the four seats ranked by their total score at the end
 * of the game. Pure, so it needs no browser and is tested on real engine hands.
 *
 * The book says only that "the player with the highest score after a
 * predetermined number of hands has been played wins the game" (Illustrated
 * p. 16). It gives no tie-break, so none is invented: seats with equal totals
 * share a rank ("1, 1, 3, 4"), and a tie for first names every tied seat a
 * winner. Equal seats keep seat order (E, S, W, N) only so the list is stable.
 */

const SEATS = ["E", "S", "W", "N"];

/**
 * @param {Record<string, number>} totals each seat's total score
 * @returns {{ seat: string, total: number, rank: number, tied: boolean, winner: boolean }[]}
 *   best first
 */
export function rankSeats(totals) {
  const sorted = SEATS.map((seat) => ({ seat, total: totals[seat] })).sort((a, b) => b.total - a.total);
  return sorted.map((entry) => {
    const rank = 1 + sorted.filter((other) => other.total > entry.total).length;
    const tied = sorted.filter((other) => other.total === entry.total).length > 1;
    return { ...entry, rank, tied, winner: rank === 1 };
  });
}

/** "East wins the game" / "East and West tie for the win"; `name` gives a seat's words. */
export function winnerLine(ranking, name) {
  const winners = ranking.filter((entry) => entry.winner).map((entry) => name(entry.seat));
  if (winners.length === 1) return `${winners[0]} wins the game`;
  const last = winners.pop();
  return `${winners.join(", ")} and ${last} tie for the win`;
}
