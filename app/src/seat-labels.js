/**
 * Seat labels (#122): with the centre pile the middle console is put away, so
 * what it showed moves to the edges. Each seat gets a small label on the felt
 * just inside its wall - its wind (coral for the dealer, as on the console),
 * its score, a fish once it has shown one (C p. 55) - and the seat whose turn
 * it is glows in the console's cyan. The round and the tiles left in the wall
 * go in a badge under the menu.
 *
 * Plain DOM over the canvas. `place` gets each seat's point on the screen
 * from the board, so the labels follow the camera (the zoomed view too).
 */

import { $ } from "./shared.js";

const WIND_WORD = { E: "East", S: "South", W: "West", N: "North" };
const FISH =
  '<svg class="seat-fish" viewBox="-36 -22 80 44" aria-label="fishing"><path d="M14,0 L36,-17 Q30,0 36,17Z" fill="#ff9a3c" stroke="#7a3a06" stroke-width="3" stroke-linejoin="round"/>' +
  '<ellipse cx="-6" cy="0" rx="26" ry="16" fill="#ff9a3c" stroke="#7a3a06" stroke-width="3"/><circle cx="-20" cy="-4" r="3.6" fill="#1b2326"/></svg>';

let labels = null;

function build() {
  labels = [0, 1, 2, 3].map((rel) => {
    const element = document.createElement("div");
    element.className = "seat-label";
    element.dataset.rel = String(rel);
    element.hidden = true;
    document.body.append(element);
    return element;
  });
}

/**
 * Show the labels for `info` (the console's: `round`, `hand`, `wall`, and
 * `seats` with `rel`, `wind`, `score`, `dealer`, `fishing`, `turn`), at the
 * screen points `point(rel)` gives.
 */
export function showSeatLabels(info, point) {
  if (labels === null) build();
  for (const seat of info.seats) {
    const element = labels[seat.rel];
    const key = JSON.stringify(seat);
    if (element.dataset.key !== key) {
      element.dataset.key = key;
      element.innerHTML =
        `<b class="seat-wind${seat.dealer ? " dealer" : ""}">${seat.wind}</b>` +
        `<span class="seat-score">${seat.score.toLocaleString("en")}</span>` +
        (seat.fishing ? FISH : "");
      element.classList.toggle("turn", seat.turn);
    }
    element.hidden = false;
  }
  placeSeatLabels(point);
  const badge = $("#wall-badge");
  badge.hidden = false;
  badge.textContent = `${WIND_WORD[info.round]} ${info.hand} · ${info.wall} left`;
}

/** Follow the camera: put each label at its seat's point on the screen. */
export function placeSeatLabels(point) {
  if (labels === null) return;
  labels.forEach((element, rel) => {
    if (element.hidden) return;
    const at = point(rel);
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
  });
}

/** Rows: the console shows all this again, so the labels go. */
export function hideSeatLabels() {
  if (labels !== null) for (const element of labels) element.hidden = true;
  const badge = $("#wall-badge");
  if (badge) badge.hidden = true;
}
