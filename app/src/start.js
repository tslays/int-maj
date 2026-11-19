/**
 * The start screen: what you can do here, laid out at once.
 *
 * It opens over the table on every visit (a review board or a pinned seed go
 * straight to the table; a room link opens the room sheet over it) and again
 * from Main menu in Options. A game in progress is dealt underneath and offered first as
 * Continue; otherwise the first card plays against the bots, with their level
 * beside it. Play with friends opens the room sheet, and the row below opens
 * the guide, the index of all hands and the settings, as the table does.
 * On the first visit to a device How to play is marked as the place to begin.
 * While it is open the bots wait: the turn loop stops at its next step.
 */

import { openGuide } from "./guide.js";
import { $, scores, state, WIND_NAME } from "./shared.js";

let hooks = { onContinue() {}, onNewGame() {}, onFriends() {} };

export function startOpen() {
  return !$("#start").hidden;
}

/** "East round · hand 3 · 16,400": where the saved game stands, for the Continue card. */
export function continueNote(payload, totals) {
  const view = payload.view;
  const round = `${WIND_NAME[view.prevailingWind] ?? view.prevailingWind} round`;
  return `${round} · hand ${view.handNumber} · ${totals[payload.seat].toLocaleString("en-US")} points`;
}

/**
 * Show the screen. `game` is true when a game of your own is on the table:
 * Continue then leads and the bots card starts a new one instead.
 */
export function showStart({ game, first = false }) {
  const resumable = game && state.payload !== null && !state.online;
  $("#start-continue").hidden = !resumable;
  if (resumable) $("#start-continue-note").textContent = continueNote(state.payload, scores());
  $("#start-play-label").textContent = resumable ? "New game" : "Play vs bots";
  $("#start-play-note").textContent = resumable ? "Ends the game in progress" : "Three bots, on this device";
  $("#start-install").hidden = $("#install-open").hidden;
  // A first visit marks where to begin.
  $("#start-guide").classList.toggle("start-first", first);
  $("#start").hidden = false;
  document.body.classList.add("starting");
  (resumable ? $("#start-continue") : $("#start-play")).focus();
}

export function hideStart() {
  $("#start").hidden = true;
  document.body.classList.remove("starting");
}

/** `next.onContinue`, `next.onNewGame` and `next.onFriends` act on the choice. */
export function installStart(next) {
  hooks = next;
  $("#start-continue").addEventListener("click", () => {
    hideStart();
    hooks.onContinue();
  });
  $("#start-play").addEventListener("click", () => {
    hideStart();
    hooks.onNewGame();
  });
  $("#start-friends").addEventListener("click", () => hooks.onFriends());
  $("#start-guide").addEventListener("click", openGuide);
  $("#start-hands").addEventListener("click", () => $("#index-open").click());
  $("#start-settings").addEventListener("click", () => $("#options").click());
  $("#start-install").addEventListener("click", () => $("#install-open").click());
}
