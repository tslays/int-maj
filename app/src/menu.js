/**
 * The menu: the Calls, Sort and New game buttons, and closing the help sheet
 * (the guide itself is `guide.js`). Sound,
 * the house rules and the Help and Report buttons live in `options.js`.
 */

import { openGuide } from "./guide.js";
import { $, board, showToggle, state } from "./shared.js";

/** `hooks.run` resumes the turn loop; `hooks.newGame` starts a fresh game. */
export function installMenu({ run, newGame }) {
  /* Calls: lit = you are offered calls on each discard; off = you are not asked. */
  $("#calls").addEventListener("click", () => {
    state.callsOff = !state.callsOff;
    showToggle("#calls", !state.callsOff);
    // Re-offer (or drop) the calls for the decision already on screen.
    if (!state.busy && state.payload !== null && state.payload.outcome === null) void run();
  });
  showToggle("#calls", !state.callsOff);

  /* Sort: lit = the game sorts your tiles; off = you arrange them yourself (by dragging). */
  function showSort(custom) {
    showToggle("#sort", !custom);
  }
  board.onCustomChange = showSort;
  showSort(board.custom);

  $("#sort").addEventListener("click", () => {
    if (board.custom) void board.autoSort();
    else board.setCustom(true);
  });

  $("#new-game").addEventListener("click", () => void newGame());
}

/* --------------------------------------------------------- help sheet */

function closeHelp() {
  $("#help-sheet").hidden = true;
}
$("#help").addEventListener("click", openGuide);
$("#menu-help").addEventListener("click", openGuide);
$("#help-close").addEventListener("click", closeHelp);
$("#help-sheet").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeHelp();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHelp();
});
