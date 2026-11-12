/**
 * Hand input: tap to lift, tap again to discard, drag to re-arrange, swipe up
 * to throw, and picking the three tiles of a goulash exchange. A tap on the
 * ponds toggles the zoomed, top-down view of the discards.
 */

import { showGoulashPicked } from "./goulash.js";
import { $, board, state } from "./shared.js";
import { pondTap, pondZoomed, renderer, setPondZoom } from "./stage.js";
import { sound } from "./sound.js";

let press = null; // the tile under a held pointer
let goulashPicks = [];
let act = null;

/** `hooks.act` sends one of your decisions (owned by the turn loop in main.js). */
export function installInput(hooks) {
  act = hooks.act;
}

/**
 * A prompt that asks for a throw starts with nothing lifted. `keep` leaves a
 * tile you are studying raised: the bots' turns and claim windows (no throw
 * possible) must not disturb it.
 */
export function clearSelection(keep = false) {
  if (keep || board.lifted === null) return;
  void board.lift(board.lifted, false);
}

/** A new goulash exchange starts with no tiles picked. */
export function resetGoulash() {
  goulashPicks = [];
}

/** The keys of the tiles picked for the goulash exchange so far. */
export function goulashKeys() {
  return goulashPicks.map((entry) => entry.key);
}

/** The Discard action for this tile, if you may throw it now: only on your own turn, never while the table runs. */
function legalDiscard(key) {
  if (state.busy || state.payload === null) return null;
  return state.payload.legalActions.find((action) => action.type === "Discard" && action.tile === key) ?? null;
}

/** The quiet click of a hand tile, pitched by where it sits along the hand. */
function tickFor(entry) {
  const at = board.hand.indexOf(entry);
  sound.cue("tick", { pitch: board.hand.length > 1 ? at / (board.hand.length - 1) : 0.5 });
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  // Zoomed, the hand is off screen: no tile is under the finger.
  const entry = pondZoomed() ? null : board.pick(event);
  // A tap on the ponds (not on a hand tile, and with no tile lifted to put
  // down) zooms in on them from above; a tap anywhere zooms back. It works
  // while the bots play too: that is when you study the discards.
  if (entry === null && (pondZoomed() || board.lifted === null || state.busy || state.payload === null) && pondTap(event)) {
    setPondZoom(!pondZoomed());
    return;
  }
  // Your hand can be arranged and tiles lifted at any time, the bots' turns
  // included; throwing is checked by `legalDiscard` below.
  if (state.payload === null) return;
  const legal = state.payload.legalActions;

  if (legal.some((action) => action.type === "GoulashExchange")) {
    if (state.busy || entry === null) return;
    const index = goulashPicks.indexOf(entry);
    if (index >= 0) {
      goulashPicks.splice(index, 1);
      void board.lift(entry, false);
      tickFor(entry);
    } else if (goulashPicks.length < 3) {
      goulashPicks.push(entry);
      void board.lift(entry, true);
      tickFor(entry);
    }
    const confirm = $("#goulash-confirm");
    if (confirm) confirm.disabled = goulashPicks.length !== 3;
    showGoulashPicked(goulashPicks.length);
    return;
  }

  if (entry === null) {
    if (board.lifted !== null) void board.lift(board.lifted, false);
    return;
  }
  // Press on a hand tile: a tap selects / moves the lift / discards, a drag re-arranges.
  const wasSelected = entry === board.lifted;
  if (board.lifted === null) {
    void board.lift(entry, true);
    tickFor(entry); // the first tap on a tile: it clicks up
  }
  press = {
    entry,
    wasSelected,
    touch: event.pointerType === "touch",
    x: event.clientX,
    y: event.clientY,
    dragging: false,
    id: event.pointerId,
  };
  renderer.domElement.setPointerCapture?.(event.pointerId);
});

const DRAG_SLOP = 6;
/** A carried tile swiped this far up (css px), more up than sideways, is thrown on release. */
const THROW_RISE = 56;

function throwing(event) {
  const rise = press.y - event.clientY;
  return rise >= THROW_RISE && rise >= Math.abs(event.clientX - press.x);
}

/**
 * With a mouse (or pen) the tile under the pointer is pre-selected: on your
 * turn a click discards it. On the bots' turns it lifts and marks its copies
 * in the ponds just the same, so you can look at your options early; a click
 * then throws nothing (`legalDiscard`).
 */
function hover(event) {
  if (press !== null || state.payload === null || pondZoomed()) return;
  if (state.payload.legalActions.some((action) => action.type === "GoulashExchange")) return;
  const entry = board.pick(event);
  if (entry === board.lifted) return;
  if (board.lifted !== null) void board.lift(board.lifted, false);
  if (entry !== null) {
    void board.lift(entry, true);
    tickFor(entry);
  }
}

renderer.domElement.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "touch" || press !== null || board.lifted === null) return;
  void board.lift(board.lifted, false);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch" && press === null) hover(event);
  if (press === null || event.pointerId !== press.id) return;
  if (!press.dragging) {
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_SLOP) return;
    press.dragging = true;
    if (board.lifted !== null && board.lifted !== press.entry) void board.lift(board.lifted, false);
    board.lifted = press.entry;
  }
  // A swipe up swells the tile only where letting go would throw it.
  const armed = legalDiscard(press.entry.key) !== null && throwing(event);
  if (armed !== press.armed) {
    press.armed = armed;
    if (board.armThrow(press.entry, armed) && armed) tickFor(press.entry);
  }
  board.dragTo(press.entry, event);
});

function endPress(event, cancelled) {
  if (press === null || event.pointerId !== press.id) return;
  const { entry, wasSelected, dragging, armed, touch } = press;
  press = null;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
  if (dragging) board.armThrow(entry, false);
  if (dragging && armed && !cancelled && legalDiscard(entry.key) !== null) {
    // Swiped up and let go: the tile is thrown onto the table.
    board.noteThrow(entry);
    sound.cue("lift");
    void act(legalDiscard(entry.key));
    return;
  }
  if (dragging) {
    // Dropped: it settles where it was carried; nothing is thrown.
    void board.settle();
    return;
  }
  if (cancelled) {
    if (board.lifted !== null) void board.lift(board.lifted, false);
    return;
  }
  if (board.lifted === entry) {
    if (!wasSelected) return; // first tap: it stays lifted
    const discard = legalDiscard(entry.key);
    if (discard === null) {
      // Nothing to throw (the bots play): a second touch tap puts the tile back; a mouse
      // click leaves the hovered tile up, as the hover would only lift it again.
      if (touch) void board.lift(entry, false);
      return;
    }
    board.noteThrow(entry);
    sound.cue("lift");
    void act(discard);
    return;
  }
  // A second tile tapped while one is lifted: the lift moves to it (to compare
  // discards by touch); a second tap on that tile discards it.
  if (board.lifted !== null) void board.lift(board.lifted, false);
  void board.lift(entry, true);
  tickFor(entry);
}

renderer.domElement.addEventListener("pointerup", (event) => endPress(event, false));
renderer.domElement.addEventListener("pointercancel", (event) => endPress(event, true));
