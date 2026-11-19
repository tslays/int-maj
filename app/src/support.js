/**
 * Support int-maj: one quiet link in the Settings footer opens a short sheet
 * whose one button opens int-maj's Ko-fi page. The page opens on top of the
 * game (a new tab, or the in-app browser of an installed app) rather than
 * inside it, because only Ko-fi's own page offers every way to pay: Apple Pay
 * and PayNow cannot run inside another site's frame. Nothing else in the app
 * ever mentions it, and nothing is loaded from Ko-fi until the button is tapped.
 */

import { $ } from "./shared.js";

export const KOFI_PAGE = "https://ko-fi.com/int_maj";

function openSupport() {
  $("#support-sheet").hidden = false;
  $("#support-go").focus();
}

function closeSupport() {
  if ($("#support-sheet").hidden) return;
  $("#support-sheet").hidden = true;
  $("#support-open").focus();
}

if (typeof document !== "undefined" && $("#support-sheet") !== null) {
  $("#support-open").addEventListener("click", openSupport);
  $("#support-close").addEventListener("click", closeSupport);
  // Back from Ko-fi, the player finds Settings as they left it.
  $("#support-go").addEventListener("click", () => setTimeout(closeSupport, 0));
  $("#support-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSupport();
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || $("#support-sheet").hidden) return;
      event.stopImmediatePropagation(); // the Settings sheet under it stays open
      closeSupport();
    },
    true,
  );
}
