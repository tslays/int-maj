/**
 * Licence and notices: a small, quiet link in the start screen's lower-left corner
 * opens a sheet over it. Its first page says what the code is licensed under,
 * whose books the game follows, and that the project is independent of them.
 * Two rows lead on, inside the same sheet: Licence shows the repository's
 * LICENSE word for word, and Credits names every piece of third-party material
 * with its licence, the full OFL and MIT texts a tap away. Everything is part
 * of the app, so it reads offline and nothing links to the repository. It
 * also opens from a row in Settings' More tab; the guide has no card for it.
 */

import { LICENCE_TEXTS } from "./notices-text.js";
import { $ } from "./shared.js";

const HOME = "legal-home";

/** The element that opened the sheet, so focus goes back to it on close. */
let opener = null;
/** The row that opened the page showing, so Back returns focus to it. */
let row = null;

const pages = () => document.querySelectorAll("#legal-sheet .legal-page");

/** Show one page of the sheet; the heading and Back follow it. */
function show(id) {
  for (const page of pages()) page.hidden = page.id !== id;
  const page = $(`#${id}`);
  $("#legal-title").textContent = page.dataset.title;
  $("#legal-back").hidden = id === HOME;
  $("#legal-sheet .legal-card").scrollTop = 0;
}

const current = () => [...pages()].find((page) => !page.hidden)?.id ?? HOME;

/** Open the sheet over whatever is showing (the start screen), on its first page. */
export function openLegal() {
  opener = document.activeElement;
  show(HOME);
  $("#legal-sheet").hidden = false;
  $("#legal-close").focus();
}

function closeLegal() {
  if ($("#legal-sheet").hidden) return;
  $("#legal-sheet").hidden = true;
  if (opener?.isConnected) opener.focus();
  opener = null;
  row = null;
}

function back() {
  show(HOME);
  (row ?? $("#legal-close")).focus();
  row = null;
}

/**
 * A licence paragraph as running text: a line the file wrapped (a long one) runs
 * on into the next, so the text fits the card; a short line, a heading or the
 * end of a clause, keeps its break.
 */
function reflow(paragraph) {
  return paragraph.replace(/^(.{50,})\n/gm, "$1 ");
}

/** Show or hide one licence's full text under its Credits card, filled on first use. */
function toggleFull(button) {
  const full = button.closest(".legal-credit").querySelector(".legal-full");
  if (full.childElementCount === 0) {
    for (const paragraph of LICENCE_TEXTS[button.dataset.licence].split(/\n{2,}/)) {
      const p = document.createElement("p");
      p.textContent = reflow(paragraph);
      full.append(p);
    }
  }
  full.hidden = !full.hidden;
  button.setAttribute("aria-expanded", String(!full.hidden));
  button.textContent = full.hidden ? "Show licence" : "Hide licence";
}

if (typeof document !== "undefined" && $("#legal-sheet") !== null) {
  $("#legal-close").addEventListener("click", closeLegal);
  $("#legal-back").addEventListener("click", back);
  $("#legal-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLegal();
  });
  for (const button of document.querySelectorAll("#legal-sheet .legal-row")) {
    button.addEventListener("click", () => {
      row = button;
      show(button.dataset.page);
      $("#legal-back").focus();
    });
  }
  for (const button of document.querySelectorAll("#legal-sheet .legal-more")) {
    button.addEventListener("click", () => toggleFull(button));
  }
  // Asking for permission goes through Report a problem: this sheet makes way for it.
  $("#legal-report").addEventListener("click", () => {
    closeLegal();
    $("#report").click();
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || $("#legal-sheet").hidden) return;
      event.stopImmediatePropagation(); // the guide under it stays open
      if (current() === HOME) closeLegal();
      else back();
    },
    true,
  );
}
