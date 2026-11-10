/**
 * The menu: the Calls, Sort, Sound and New game buttons, and the help sheet.
 */

import { sound } from "./sound.js";
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

  /* Sound: lit = on by default; the choice is remembered on the device. */
  function showSound() {
    showToggle("#sound", !sound.muted);
  }
  showSound();

  $("#sound").addEventListener("click", () => {
    sound.setMuted(!sound.muted);
    showSound();
    sound.cue("press"); // heard only when sound has just been turned on
  });

  $("#new-game").addEventListener("click", () => void newGame());
}

/* --------------------------------------------------------- help sheet */

function closeHelp() {
  $("#help-sheet").hidden = true;
}
$("#help").addEventListener("click", () => {
  $("#help-sheet").hidden = false;
  $("#help-close").focus();
});
$("#help-close").addEventListener("click", closeHelp);
$("#help-sheet").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeHelp();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHelp();
});
