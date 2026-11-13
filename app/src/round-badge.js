/**
 * The round badge (#122): with the centre pile the middle console is put
 * away, and the table carries no labels of its own. What the player needs at
 * a glance goes in one small badge under the menu, each figure under its own
 * caption: the round (the prevailing wind), the hand, the player's own seat
 * wind (coral when the player deals: the dealer is always East; with a fish
 * once the player has shown one, C p. 55) and the tiles left in the wall.
 * It stays no wider than the menu buttons, off the table. A bot's fish lies
 * in its claims lane instead (board.js `reconcileMelds`).
 */

import { $ } from "./shared.js";

const WIND_WORD = { E: "East", S: "South", W: "West", N: "North" };
export const FISH =
  '<svg class="seat-fish" viewBox="-36 -22 80 44" aria-label="fishing"><path d="M14,0 L36,-17 Q30,0 36,17Z" fill="#ff9a3c" stroke="#7a3a06" stroke-width="3" stroke-linejoin="round"/>' +
  '<ellipse cx="-6" cy="0" rx="26" ry="16" fill="#ff9a3c" stroke="#7a3a06" stroke-width="3"/><circle cx="-20" cy="-4" r="3.6" fill="#1b2326"/></svg>';

/** One captioned figure. */
function cell(caption, value, extra = "") {
  return `<span class="badge-cell${extra}"><small>${caption}</small><b>${value}</b></span>`;
}

/**
 * Show the badge for `info` (the console's: `round`, `hand`, `wall`, and
 * `seats` with `rel`, `wind`, `dealer`, `fishing`; rel 0 is the player).
 */
export function showRoundBadge(info) {
  const badge = $("#wall-badge");
  const you = info.seats.find((seat) => seat.rel === 0);
  const html =
    cell("Round", WIND_WORD[info.round]) +
    cell("Hand", String(info.hand)) +
    (you
      ? cell("You", WIND_WORD[you.wind] + (you.fishing ? FISH : ""), you.dealer ? " dealer" : "")
      : "") +
    cell("Wall", String(info.wall));
  if (badge.innerHTML !== html) badge.innerHTML = html;
  badge.hidden = false;
}

/** Rows: the console shows all this again, so the badge goes. */
export function hideRoundBadge() {
  const badge = $("#wall-badge");
  if (badge) badge.hidden = true;
}
