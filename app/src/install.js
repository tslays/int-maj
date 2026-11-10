/**
 * The install card on the "turn your phone" screen: how to put the game on
 * the home screen, for the phone in hand. It shows only in a phone's browser;
 * an installed copy (and a computer) never sees it.
 */

/**
 * Which guide fits this browser, or null for none:
 * "ios" and "android" can install; the "-webview" kinds are a page opened
 * inside another app (a chat or a social feed), which cannot.
 */
export function installGuide({ userAgent = "", platform = "", maxTouchPoints = 0, standalone = false }) {
  if (standalone) return null;
  // An iPad says it is a Mac; only its touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (ios) return /Safari\//.test(userAgent) ? "ios" : "ios-webview";
  if (/Android/.test(userAgent)) return /; wv\)/.test(userAgent) ? "android-webview" : "android";
  return null;
}

const GUIDES = ["ios", "ios-webview", "android", "android-webview"];

function mount() {
  const card = document.getElementById("install");
  if (card === null) return;

  // `?install=ios|android|...` shows one guide on any phone, for review.
  const forced = new URLSearchParams(location.search).get("install");
  const guide = GUIDES.includes(forced)
    ? forced
    : installGuide({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      });
  if (guide === null) return;

  const steps = card.querySelector(`[data-guide="${guide}"]`);
  const button = document.getElementById("install-now");
  steps.hidden = false;
  card.hidden = false;

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
    card.hidden = true;
  });
}

if (typeof document !== "undefined") mount();
