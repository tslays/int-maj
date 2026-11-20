/**
 * Playing from the keyboard with a handful of keys whose meaning follows the
 * situation (`keymap.js`): at your hand ← → lift a tile and Enter throws it;
 * ↑ goes to the buttons above it, where ← → choose and Enter presses; Esc
 * passes. When a discard is offered and there is nothing to throw, the
 * buttons are chosen at once.
 *
 * Nothing on the table shows the keys: the guide's "With a keyboard" card lists them
 * (on a device with a mouse) and one first-game tip (`tips.js`) points there.
 * They do nothing while a sheet, the start screen, practice or a result is
 * up, or while you type in a field: those have keys of their own.
 */

import { commandFor, wrap } from "./keymap.js";
import { claimsOpen } from "./claims.js";
import { legalDiscard, throwTile, tickFor, toggleGoulashPick } from "./input.js";
import { practiceOpen } from "./practice.js";
import { $, board, state } from "./shared.js";
import { pondZoomed } from "./stage.js";
import { startOpen } from "./start.js";

/** The tile the keys stand on in a Goulash (half raised), or null. */
let cursor = null;
/** Whether the last thing you used was the keyboard: only then do the buttons take focus by themselves. */
let keyboard = false;

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

/** The button the keys stand on, or null when they stand on the hand. */
function chosen() {
  const active = document.activeElement;
  return active instanceof HTMLButtonElement && buttons().includes(active) ? active : null;
}

/** Lift the tile `step` along from the lifted one (or move the Goulash cursor), round the ends. */
function moveInHand(step) {
  const hand = board.hand;
  if (hand.length === 0 || pondZoomed()) return;
  const goulash = inGoulash();
  const from = goulash ? cursor : board.lifted;
  const at = from === null ? -1 : hand.indexOf(from);
  const next = at < 0 ? (step > 0 ? 0 : hand.length - 1) : wrap(at + step, hand.length);
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

/** Enter at the hand: throw the lifted tile, or pick in a Goulash. */
function pressInHand() {
  if (pondZoomed()) return;
  if (inGoulash()) {
    if (cursor === null || !board.hand.includes(cursor) || state.busy) return;
    toggleGoulashPick(cursor);
    // A tile put back drops to the row; the cursor still stands on it.
    if (!board.raised.has(cursor)) void board.peek(cursor, true);
    return;
  }
  const entry = board.lifted;
  if (entry !== null && legalDiscard(entry.key) !== null) throwTile(entry);
}

function moveInButtons(step) {
  const all = buttons();
  const at = all.indexOf(chosen());
  if (all.length > 0) all[wrap(at + step, all.length)].focus();
}

window.addEventListener("pointerdown", () => {
  keyboard = false;
}, true);

// Capture: ahead of the sheets' own Escape, so an open sheet still closes first and nothing passes.
window.addEventListener(
  "keydown",
  (event) => {
    if (blocked(event)) return;
    const button = chosen();
    const command = commandFor(event, button === null ? "hand" : "buttons");
    if (command === null) return;
    event.preventDefault();
    keyboard = true;
    if (event.repeat && command.type !== "move") return;
    switch (command.type) {
      case "move":
        if (button === null) moveInHand(command.step);
        else moveInButtons(command.step);
        break;
      case "press":
        if (button === null) pressInHand();
        else button.click();
        break;
      case "zone":
        if (command.to === "buttons") buttons()[0]?.focus();
        else button?.blur();
        break;
      case "pass":
        buttons().find((item) => item.classList.contains("act-pass") && item.dataset.pass === "true")?.click();
        break;
    }
  },
  true,
);

/**
 * New choices are on screen (`showChoices` in main.js): the Goulash cursor
 * starts again, and when a discard is offered and you cannot throw, the
 * buttons are chosen for a keyboard player, starting at Pass.
 */
export function keysOnChoices() {
  if (cursor !== null && board.hand.includes(cursor)) void board.peek(cursor, false);
  cursor = null;
  const canThrow = state.payload.legalActions.some((action) => action.type === "Discard");
  if (keyboard && !canThrow && !inGoulash()) buttons()[0]?.focus();
}
