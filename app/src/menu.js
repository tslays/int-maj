/**
 * The menu: the Calls and Sort buttons, and closing the help sheet (the
 * guide itself is `guide.js`). Sound, the house rules, the resets and the
 * Help and Report rows live in the Settings sheet, `options.js`.
 */

import { openGuide } from "./guide.js";
import { $, board, showToggle, state, toast } from "./shared.js";
import { sortPref } from "./sort-pref.js";

/** `hooks.run` resumes the turn loop. */
export function installMenu({ run }) {
  /* Calls: lit = you are offered calls on each discard; off = you are not asked. */
  $("#calls").addEventListener("click", () => {
    state.callsOff = !state.callsOff;
    showToggle("#calls", !state.callsOff);
    // Re-offer (or drop) the calls for the decision already on screen.
    if (!state.busy && state.payload !== null && state.payload.outcome === null) void run();
  });
  showToggle("#calls", !state.callsOff);

  /* Sort (#213): lit = the game keeps your tiles in order; off = they stay where you put them,
     new ones joining at the end. A stored preference: it holds across hands and games. */
  const showSort = (on) => showToggle("#sort", on);
  sortPref.onChange((on, reason) => {
    showSort(on);
    // Dragging a tile turns Sort off by itself: say so, so it is never a silent change (#269).
    if (!on && reason === "arranged") toast("Sort off: your order stays", { byHand: true });
  });
  showSort(sortPref.on);

  $("#sort").addEventListener("click", () => {
    if (sortPref.on) {
      sortPref.set(false);
      return;
    }
    sortPref.set(true);
    void board.autoSort();
  });
}

/* --------------------------------------------------------- help sheet */

function closeHelp() {
  $("#help-sheet").hidden = true;
}
$("#help").addEventListener("click", openGuide);
$("#help-close").addEventListener("click", closeHelp);
$("#help-sheet").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeHelp();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHelp();
});
