/**
 * The start screen: what you can do here, laid out at once.
 *
 * It opens over the table on every visit (a review board or a pinned seed go
 * straight to the table; a room link opens the room sheet over it) and again
 * from Main menu in Settings. A game in progress is dealt underneath and offered first as
 * Continue; otherwise the first card plays against the bots, with their level
 * beside it. Play with friends opens the room sheet, Practice its drills
 * (`practice.js`; the bots wait meanwhile), and the row below opens
 * the guide, the index of all hands and the settings, as the table does.
 * On the first visit to a device How to play is marked as the place to begin.
 * While it is open the bots wait: the turn loop stops at its next step.
 */

import { openGuide } from "./guide.js";
import { openLegal } from "./legal.js";
import { $, scores, state } from "./shared.js";
import { continueNote } from "./start-note.js";

let hooks = { onContinue() {}, onNewGame() {}, onFriends() {}, onPractice() {} };

export function startOpen() {
  return !$("#start").hidden;
}

/**
 * Focus for keyboard play only: on a touch screen a focused button would
 * open with its ring drawn round it.
 */
export function focusForKeys(element) {
  if (element === null || window.matchMedia("(pointer: coarse)").matches) return;
  element.focus();
}

/**
 * Show the screen. `game` is true when a game of your own is on the table:
 * Continue then leads and the bots card starts a new one instead.
 */
export function showStart({ game, first = false }) {
  const resumable = game && state.payload !== null && !state.online;
  $("#start-continue").hidden = !resumable;
  $("#start-new-confirm").hidden = true;
  if (resumable) $("#start-continue-note").textContent = continueNote(state.payload, scores());
  $("#start-play-label").textContent = resumable ? "New game" : "Play vs bots";
  $("#start-play-note").textContent = resumable ? "Ends the game in progress" : "Three bots, on this device";
  $("#start-install").hidden = $("#install-open").hidden;
  // A first visit marks where to begin.
  $("#start-guide").classList.toggle("start-first", first);
  $("#start").hidden = false;
  document.body.classList.add("starting");
  focusForKeys(resumable ? $("#start-continue") : $("#start-play"));
}

export function hideStart() {
  $("#start").hidden = true;
  document.body.classList.remove("starting");
}

/** `next.onContinue`, `onNewGame`, `onFriends` and `onPractice` act on the choice. */
export function installStart(next) {
  hooks = next;
  // The focus `showStart` gives is for keyboard play: its ring stays hidden until a key is pressed,
  // so a mouse or touch user never sees a button chosen for them.
  window.addEventListener("keydown", () => document.body.classList.add("keys-on"), true);
  window.addEventListener("pointerdown", () => document.body.classList.remove("keys-on"), true);
  $("#start-continue").addEventListener("click", () => {
    hideStart();
    hooks.onContinue();
  });
  // With a game to continue, a new one ends it, so it asks first.
  const askNew = (asking) => {
    $("#start-new-confirm").hidden = !asking;
  };
  $("#start-play").addEventListener("click", () => {
    if (!$("#start-continue").hidden) {
      askNew(true);
      $("#start-new-keep").focus();
      return;
    }
    hideStart();
    hooks.onNewGame();
  });
  $("#start-new-keep").addEventListener("click", () => {
    askNew(false);
    $("#start-play").focus();
  });
  $("#start-new-go").addEventListener("click", () => {
    askNew(false);
    hideStart();
    hooks.onNewGame();
  });
  $("#start-friends").addEventListener("click", () => hooks.onFriends());
  $("#start-practice").addEventListener("click", () => {
    hideStart();
    hooks.onPractice();
  });
  $("#start-guide").addEventListener("click", openGuide);
  $("#start-hands").addEventListener("click", () => $("#index-open").click());
  $("#start-settings").addEventListener("click", () => $("#options").click());
  $("#start-install").addEventListener("click", () => $("#install-open").click());
  $("#start-notice").addEventListener("click", openLegal);
}
