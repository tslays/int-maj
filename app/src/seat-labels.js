/**
 * Seat labels (#122): with the centre pile the middle console is put away.
 * Each seat then shows only its wind letter (coral for the dealer, as on the
 * console), and a fish once it has shown one (C p. 55); no scores. The seat
 * whose turn it is glows in the console's cyan. The round and the tiles left
 * in the wall go in a badge under the menu.
 *
 * Each letter has one fixed place: on top of its seat's wall, at the wall's
 * dead centre (layout.js `WALL_TOP_CENTRE`). Plain DOM over the canvas; the
 * labels follow the camera (the zoomed view too), and nothing else moves them.
 */

import { placeLabel } from "./label-place.js";
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
 * `seats` with `rel`, `wind`, `dealer`, `fishing`, `turn`), placed
 * by `scene()` (see `placeSeatLabels`).
 */
export function showSeatLabels(info, scene) {
  if (labels === null) build();
  for (const seat of info.seats) {
    const element = labels[seat.rel];
    const key = JSON.stringify([seat.wind, seat.dealer, seat.fishing, seat.turn]);
    if (element.dataset.key !== key) {
      element.dataset.key = key;
      element.innerHTML =
        `<b class="seat-wind${seat.dealer ? " dealer" : ""}">${seat.wind}</b>` +
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
 * Put each label in its fixed place (label-place.js). `scene()` gives, in CSS
 * pixels: `anchor(rel)`, the top centre of the seat's wall on the screen;
 * `view`, the screen's size. Only the camera moves them.
 */
export function placeSeatLabels(scene) {
  if (labels === null || labels.every((element) => element.hidden)) return;
  const { anchor, view } = scene();
  labels.forEach((element, rel) => {
    if (element.hidden) return;
    const at = placeLabel({ anchor: anchor(rel), width: element.offsetWidth, height: element.offsetHeight, view });
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
    element.classList.toggle("off-screen", !at.shown);
  });
}

/** Rows: the console shows all this again, so the labels go. */
export function hideSeatLabels() {
  if (labels !== null) for (const element of labels) element.hidden = true;
  const badge = $("#wall-badge");
  if (badge) badge.hidden = true;
}
