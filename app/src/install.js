/**
 * Putting the game on the home screen, and getting a phone to turn.
 *
 * The install card shows on the turn-your-phone screen, where every phone
 * visitor lands first, and again behind Install app in Options, for those who
 * arrive already holding the phone sideways. It shows only in a phone's
 * browser; an installed copy (and a computer) never sees it.
 *
 * An iPhone cannot be locked to landscape by a web page, not even once
 * installed, so the turn-your-phone screen stays; after a moment it adds how
 * to switch off the orientation lock, for a phone that will not turn.
 */

/** "ios", "android" or null: which phone this is, installed or not. */
export function phoneKind({ userAgent = "", platform = "", maxTouchPoints = 0 }) {
  // An iPad says it is a Mac; only its touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return null;
}

/**
 * Which guide fits this browser, or null for none:
 * "ios" and "android" can install; the "-webview" kinds are a page opened
 * inside another app (a chat or a social feed), which cannot.
 */
export function installGuide({ userAgent = "", platform = "", maxTouchPoints = 0, standalone = false }) {
  if (standalone) return null;
  const kind = phoneKind({ userAgent, platform, maxTouchPoints });
  if (kind === "ios") return /Safari\//.test(userAgent) ? "ios" : "ios-webview";
  if (kind === "android") return /; wv\)/.test(userAgent) ? "android-webview" : "android";
  return null;
}

const GUIDES = ["ios", "ios-webview", "android", "android-webview"];

const $ = (selector) => document.querySelector(selector);

function device() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  };
}

/* The card lives on the turn-your-phone screen; the sheet borrows it. */
function openSheet() {
  $("#install-body").append($("#install"));
  $("#install-sheet").hidden = false;
  $("#install-close").focus();
}

function closeSheet() {
  if ($("#install-sheet").hidden) return;
  $("#install-sheet").hidden = true;
  $(".rotate").append($("#install"));
}

function mount() {
  const card = $("#install");
  if (card === null) return;

  const kind = phoneKind(device());
  if (kind !== null) $(`#rotate-lock [data-lock="${kind}"]`).hidden = false;
  else $('#rotate-lock [data-lock="other"]').hidden = false;

  // `?install=ios|android|...` shows one guide on any phone, for review.
  const forced = new URLSearchParams(location.search).get("install");
  const guide = GUIDES.includes(forced) ? forced : installGuide(device());
  if (guide === null) return;

  const steps = card.querySelector(`[data-guide="${guide}"]`);
  const button = $("#install-now");
  steps.hidden = false;
  card.hidden = false;
  $("#install-open").hidden = false;

  $("#install-open").addEventListener("click", openSheet);
  $("#install-close").addEventListener("click", closeSheet);
  $("#install-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeSheet();
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || $("#install-sheet").hidden) return;
      event.stopImmediatePropagation(); // the Options sheet under it stays open
      closeSheet();
    },
    true,
  );

  // Android's browser can install in one tap once it offers to; until it
  // does (or where it never does), the written steps stay.
  let offer = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    if (guide !== "android") return;
    event.preventDefault();
    offer = event;
    button.hidden = false;
    steps.hidden = true;
  });
  button.addEventListener("click", async () => {
    if (offer === null) return;
    const asked = offer;
    offer = null; // an offer can be used once
    button.hidden = true;
    steps.hidden = false;
    await asked.prompt();
  });
  window.addEventListener("appinstalled", () => {
    closeSheet();
    card.hidden = true;
    $("#install-open").hidden = true;
  });
}

if (typeof document !== "undefined") mount();
