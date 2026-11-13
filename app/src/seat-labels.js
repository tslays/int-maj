/**
 * Seat labels (#122): with the centre pile the middle console is put away, so
 * what it showed moves to the edges. Each seat gets a small label at its
 * wall - its wind (coral for the dealer, as on the console), its score, a
 * fish once it has shown one (C p. 55) - and the seat whose turn it is glows
 * in the console's cyan. The round and the tiles left in the wall go in a
 * badge under the menu.
 *
 * A label never covers a discard, a claimed meld, a player's wall or a
 * panel (`label-place.js` finds its spot, nearest the pond on its seat's
 * side). Plain DOM over the canvas; the labels follow the camera (the
 * zoomed view too) and the table as it changes.
 */

import { placeLabels } from "./label-place.js";
import { $ } from "./shared.js";

const WIND_WORD = { E: "East", S: "South", W: "West", N: "North" };
export const FISH =
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
 * `seats` with `rel`, `wind`, `score`, `dealer`, `fishing`, `turn`), placed
 * by `scene()` (see `placeSeatLabels`).
 */
export function showSeatLabels(info, scene) {
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
  placeSeatLabels(scene);
  const badge = $("#wall-badge");
  badge.hidden = false;
  badge.textContent = `${WIND_WORD[info.round]} ${info.hand} · ${info.wall} left`;
}

/**
 * Put the labels where they cover nothing they must not (label-place.js).
 * `scene()` gives, in CSS pixels: `spots(rel)`, the seat's spots on the
 * screen best first; `obstacles`, the rectangles no label may cover; `view`,
 * the screen's size. The viewer's label is placed first, then the seat
 * across, then the sides.
 */
export function placeSeatLabels(scene) {
  if (labels === null || labels.every((element) => element.hidden)) return;
  const { spots, obstacles, view } = scene();
  const order = [0, 2, 1, 3].filter((rel) => !labels[rel].hidden);
  const places = placeLabels({
    labels: order.map((rel) => ({ width: labels[rel].offsetWidth, height: labels[rel].offsetHeight, candidates: spots(rel) })),
    obstacles,
    view,
  });
  order.forEach((rel, index) => {
    labels[rel].style.left = `${places[index].x}px`;
    labels[rel].style.top = `${places[index].y}px`;
  });
}

/** Rows: the console shows all this again, so the labels go. */
export function hideSeatLabels() {
  if (labels !== null) for (const element of labels) element.hidden = true;
  const badge = $("#wall-badge");
  if (badge) badge.hidden = true;
}
