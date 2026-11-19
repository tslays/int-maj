/** The start screen's words, pure so Node tests can load them. */

const WIND = { E: "East", S: "South", W: "West", N: "North" };

/** "East round · hand 3 · 16,400 points": where the saved game stands, for the Continue card. */
export function continueNote(payload, totals) {
  const view = payload.view;
  return `${WIND[view.prevailingWind] ?? view.prevailingWind} round · hand ${view.handNumber} · ${totals[payload.seat].toLocaleString("en-US")} points`;
}
