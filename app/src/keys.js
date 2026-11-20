/**
 * Playing from the keyboard: arrows choose a tile, Enter throws it, a letter
 * takes a call. The keys themselves live in `keymap.js`; nothing on the
 * table shows them. The guide's Keyboard card lists them (on a device with a
 * mouse), `?` opens it, and one first-game tip mentions it.
 *
 * Keys do nothing while a sheet, the start screen, practice or a result is
 * up, or while you type in a field: those have keys of their own.
 */

import { commandFor } from "./keymap.js";
import { claimsOpen } from "./claims.js";
import { openGuide } from "./guide.js";
import { goulashPickCount, legalDiscard, throwTile, tickFor, toggleGoulashPick } from "./input.js";
import { practiceOpen } from "./practice.js";
import { $, board, state } from "./shared.js";
import { pondZoomed, setPondZoom } from "./stage.js";
import { startOpen } from "./start.js";

/** The tile the keys stand on in a Goulash (half raised), or null. */
let cursor = null;

/** Whether the table should leave this key press alone. */
function blocked(event) {
  if (event.defaultPrevented || state.payload === null) return true;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return true;
  if (startOpen() || practiceOpen() || claimsOpen()) return true;
  if (!$("#result").hidden || !$("#hand-index").hidden) return true;
  return [...document.querySelectorAll(".hand-detail")].some((sheet) => !sheet.hidden);
}

const inGoulash = () => state.payload.legalActions.some((action) => action.type === "GoulashExchange");

/** The action buttons on screen now (the top-down view hides the claims). */
function buttons() {
  return [...$("#actions").querySelectorAll("button")].filter((button) => !button.disabled && button.offsetParent !== null);
}

/** Lift the tile `step` along from the lifted one (or put the Goulash cursor there). */
function move(step) {
  const hand = board.hand;
  if (hand.length === 0 || pondZoomed()) return;
  const goulash = inGoulash();
  const from = goulash ? cursor : board.lifted;
  const at = from === null ? -1 : hand.indexOf(from);
  let next;
  if (at < 0) next = step > 0 ? 0 : hand.length - 1;
  else next = Math.max(0, Math.min(hand.length - 1, at + (Number.isFinite(step) ? step : step > 0 ? hand.length : -hand.length)));
  const entry = hand[next];
  if (entry === from) return;
  if (goulash) {
    if (from !== null && hand.includes(from)) void board.peek(from, false);
    cursor = entry;
    void board.peek(entry, true);
  } else {
    if (board.lifted !== null) void board.lift(board.lifted, false);
    void board.lift(entry, true);
  }
  tickFor(entry);
}

/** Carry the lifted tile one place along the hand: your own order, so Sort goes off, as with a drag. */
function shift(step) {
  const entry = board.lifted;
  if (entry === null || pondZoomed() || inGoulash()) return;
  const at = board.hand.indexOf(entry);
  const other = board.hand[at + step];
  if (other === undefined) return;
  board.swap(entry, other);
  void board.layoutHand(new Set(), true);
}

/** Space or Enter on the table: throw the lifted tile, or work the Goulash pick. */
function press(send) {
  if (pondZoomed()) return;
  if (inGoulash()) {
    if (send && goulashPickCount() === 3) {
      $("#goulash-confirm")?.click();
      return;
    }
    if (cursor === null || !board.hand.includes(cursor) || state.busy) return;
    toggleGoulashPick(cursor);
    // A tile put back drops to the row; the cursor still stands on it.
    if (!board.raised.has(cursor)) void board.peek(cursor, true);
    return;
  }
  const entry = board.lifted;
  if (entry === null || legalDiscard(entry.key) === null) return;
  throwTile(entry);
}

/** A button by its letter; with several (two Chows) each press moves to the next, and Enter takes it. */
function pressAction(key) {
  const matches = buttons().filter((button) => button.getAttribute("aria-keyshortcuts") === key);
  if (matches.length === 0) return;
  if (matches.length === 1) {
    matches[0].click();
    return;
  }
  const at = matches.indexOf(document.activeElement);
  matches[(at + 1) % matches.length].focus();
}

window.addEventListener("keydown", (event) => {
  if (blocked(event)) return;
  const command = commandFor(event);
  if (command === null) return;
  // Enter or Space on a button you reached by keyboard is that button's own.
  const target = event.target;
  if ((command.type === "throw" || command.type === "pick") && target instanceof HTMLElement && target.matches("button:focus-visible, a:focus-visible")) return;
  if (event.repeat && command.type !== "move" && command.type !== "shift") {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  switch (command.type) {
    case "move":
      move(command.step);
      break;
    case "shift":
      shift(command.step);
      break;
    case "throw":
    case "pick":
      press(command.type === "throw");
      break;
    case "action":
      pressAction(command.key);
      break;
    case "button":
      buttons()[command.index]?.click();
      break;
    case "discards":
      setPondZoom(!pondZoomed());
      break;
    case "sort":
      $("#sort").click();
      break;
    case "hints":
      $("#hints").click();
      break;
    case "guide":
      openGuide("keyboard");
      break;
  }
});

/** A new prompt or a new hand: the Goulash cursor starts again. */
export function resetKeyCursor() {
  if (cursor !== null && board.hand.includes(cursor)) void board.peek(cursor, false);
  cursor = null;
}
