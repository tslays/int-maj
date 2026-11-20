/**
 * Licence and notices: a small, quiet link in the start screen's lower-left corner
 * opens a short sheet over it. It says what the code is licensed under, whose
 * books the game follows, and that the project is independent of them. Its two
 * links open the full LICENSE and NOTICE.md on GitHub in a new tab; nothing is
 * loaded until one is tapped. The guide has no card for it and the Settings
 * footer no link, so neither grows.
 */

import { $ } from "./shared.js";

/** The element that opened the sheet, so focus goes back to it on close. */
let opener = null;

/** Open the sheet over whatever is showing (the start screen). */
export function openLegal() {
  opener = document.activeElement;
  $("#legal-sheet").hidden = false;
  $("#legal-close").focus();
}

function closeLegal() {
  if ($("#legal-sheet").hidden) return;
  $("#legal-sheet").hidden = true;
  if (opener?.isConnected) opener.focus();
  opener = null;
}

if (typeof document !== "undefined" && $("#legal-sheet") !== null) {
  $("#legal-close").addEventListener("click", closeLegal);
  $("#legal-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLegal();
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || $("#legal-sheet").hidden) return;
      event.stopImmediatePropagation(); // the guide under it stays open
      closeLegal();
    },
    true,
  );
}
