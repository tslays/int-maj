/**
 * Support int-maj: one quiet link in the Settings footer opens a sheet with
 * Ko-fi's own donation panel, so a player who wants to chip in can do it
 * without leaving the game. Nothing else ever mentions it. The panel is only
 * loaded while the sheet is open, so nobody else's device talks to Ko-fi.
 */

import { $ } from "./shared.js";

export const KOFI_PAGE = "https://ko-fi.com/int_maj";
export const KOFI_EMBED = `${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;
/** Past this the panel counts as not coming, and the plain link is offered. */
const LOAD_TIMEOUT_MS = 8000;

/** The embedded panel: payments allowed inside it, named for screen readers (never a `title`). */
export function supportFrame(doc) {
  const frame = doc.createElement("iframe");
  frame.src = KOFI_EMBED;
  frame.setAttribute("allow", "payment");
  frame.setAttribute("aria-label", "Ko-fi: support int-maj");
  frame.setAttribute("loading", "eager");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  return frame;
}

let waiting = 0;

function showFallback(shown) {
  $("#support-fallback").hidden = !shown;
}

function openSupport() {
  const well = $("#support-frame");
  showFallback(false);
  well.replaceChildren();
  $("#support-sheet").hidden = false;
  $("#support-close").focus();
  if (navigator.onLine === false) {
    showFallback(true);
    return;
  }
  const frame = supportFrame(document);
  frame.addEventListener("load", () => clearTimeout(waiting));
  frame.addEventListener("error", () => showFallback(true));
  clearTimeout(waiting);
  waiting = setTimeout(() => showFallback(true), LOAD_TIMEOUT_MS);
  well.append(frame);
}

function closeSupport() {
  if ($("#support-sheet").hidden) return;
  clearTimeout(waiting);
  $("#support-sheet").hidden = true;
  $("#support-frame").replaceChildren();
  $("#support-open").focus();
}

if (typeof document !== "undefined" && $("#support-sheet") !== null) {
  $("#support-open").addEventListener("click", openSupport);
  $("#support-close").addEventListener("click", closeSupport);
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
