/**
 * Hand input: tap to lift, tap again to discard, drag to re-arrange, swipe up
 * to throw, and picking the three tiles of a goulash exchange. A tap on the
 * ponds toggles the zoomed, top-down view of the discards.
 */

import { board, state } from "./shared.js";
import { pondTap, pondZoomed, renderer, setPondZoom } from "./stage.js";
import { sound } from "./sound.js";

let selected = null;
let press = null; // the tile under a held pointer
let goulashPicks = [];
let act = null;

/** `hooks.act` sends one of your decisions (owned by the turn loop in main.js). */
export function installInput(hooks) {
  act = hooks.act;
}

/** Drop any lifted tile (a new prompt starts with nothing selected). */
export function clearSelection() {
  selected = null;
}

/** A new goulash exchange starts with no tiles picked. */
export function resetGoulash() {
  goulashPicks = [];
}

/** The keys of the tiles picked for the goulash exchange so far. */
export function goulashKeys() {
  return goulashPicks.map((entry) => entry.key);
}

function legalDiscard(key) {
  return state.payload?.legalActions.find((action) => action.type === "Discard" && action.tile === key) ?? null;
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
  if (entry === null && (pondZoomed() || selected === null || state.busy || state.payload === null) && pondTap(event)) {
    setPondZoom(!pondZoomed());
    return;
  }
  if (state.busy || state.payload === null) return;
  const legal = state.payload.legalActions;

  if (legal.some((action) => action.type === "GoulashExchange")) {
    if (entry === null) return;
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
    return;
  }

  if (entry === null) {
    if (selected !== null) void board.lift(selected, false);
    selected = null;
    return;
  }
  // Press on a hand tile: a tap selects / moves the lift / discards, a drag re-arranges.
  const wasSelected = entry === selected;
  if (selected === null) {
    selected = entry;
    void board.lift(entry, true);
    tickFor(entry); // the first tap on a tile: it clicks up
  }
  press = { entry, wasSelected, x: event.clientX, y: event.clientY, dragging: false, id: event.pointerId };
  renderer.domElement.setPointerCapture?.(event.pointerId);
});

const DRAG_SLOP = 6;
/** A carried tile swiped this far up (css px), more up than sideways, is thrown on release. */
const THROW_RISE = 56;

function throwing(event) {
  const rise = press.y - event.clientY;
  return rise >= THROW_RISE && rise >= Math.abs(event.clientX - press.x);
}

/** With a mouse (or pen) the tile under the pointer is pre-selected: click discards. */
function hover(event) {
  if (press !== null || state.busy || state.payload === null || pondZoomed()) return;
  if (state.payload.legalActions.some((action) => action.type === "GoulashExchange")) return;
  const entry = board.pick(event);
  if (entry === selected) return;
  if (selected !== null) void board.lift(selected, false);
  selected = entry;
  if (entry !== null) {
    void board.lift(entry, true);
    tickFor(entry);
  }
}

renderer.domElement.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "touch" || press !== null || selected === null) return;
  void board.lift(selected, false);
  selected = null;
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch" && press === null) hover(event);
  if (press === null || event.pointerId !== press.id) return;
  if (!press.dragging) {
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_SLOP) return;
    press.dragging = true;
    if (selected !== null && selected !== press.entry) void board.lift(selected, false);
    selected = press.entry;
  }
  const armed = throwing(event);
  if (armed !== press.armed) {
    press.armed = armed;
    if (board.armThrow(press.entry, armed) && armed) tickFor(press.entry);
  }
  board.dragTo(press.entry, event);
});

function endPress(event, cancelled) {
  if (press === null || event.pointerId !== press.id) return;
  const { entry, wasSelected, dragging, armed } = press;
  press = null;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
  if (dragging) board.armThrow(entry, false);
  if (dragging && armed && !cancelled && legalDiscard(entry.key) !== null) {
    // Swiped up and let go: the tile is thrown onto the table.
    selected = null;
    board.noteThrow(entry);
    sound.cue("lift");
    void act(legalDiscard(entry.key));
    return;
  }
  if (dragging) {
    // Dropped: it settles where it was carried; nothing is thrown.
    selected = null;
    void board.settle();
    return;
  }
  if (cancelled) {
    if (selected !== null) void board.lift(selected, false);
    selected = null;
    return;
  }
  if (selected === entry) {
    if (!wasSelected) return; // first tap: it stays lifted
    selected = null;
    const discard = legalDiscard(entry.key);
    if (discard === null) {
      void board.lift(entry, false);
      return;
    }
    board.noteThrow(entry);
    sound.cue("lift");
    void act(discard);
    return;
  }
  // A second tile tapped while one is lifted: the lift moves to it (to compare
  // discards by touch); a second tap on that tile discards it.
  if (selected !== null) void board.lift(selected, false);
  selected = entry;
  void board.lift(entry, true);
  tickFor(entry);
}

renderer.domElement.addEventListener("pointerup", (event) => endPress(event, false));
renderer.domElement.addEventListener("pointercancel", (event) => endPress(event, true));
