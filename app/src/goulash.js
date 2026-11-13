/**
 * The Goulash banner: a panel over the middle of the table for as long as the
 * three exchanges last, so nobody mistakes the hand for an ordinary one.
 *
 * It says what the hand is and why (a drawn hand is followed by a Goulash,
 * Illustrated p. 21), which of the three exchanges is on, who your tiles go
 * to, and how many of the three you have picked. It never takes a touch: the
 * hand under it stays in reach.
 */

import { $, board, seatName, state } from "./shared.js";

const SIDE = ["", "on your right", "opposite you", "on your left"];

let shownStage = null;

function line(className, text) {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

/** Show the banner for this view's exchange, or take it away outside a Goulash exchange. */
export function refreshGoulash(view = state.payload?.view) {
  const panel = $("#goulash");
  const goulash = view?.goulash ?? null;
  if (goulash === null) {
    panel.hidden = true;
    shownStage = null;
    return;
  }
  if (shownStage === goulash.stage && !panel.hidden) {
    // Same exchange: your tiles are in and the others are still choosing.
    if (state.payload.legalActions.length === 0) showGoulashPicked(0);
    return;
  }
  shownStage = goulash.stage;

  const steps = document.createElement("div");
  steps.className = "goulash-steps";
  for (let index = 0; index < 3; index++) {
    const dot = document.createElement("span");
    if (index < goulash.stage) dot.className = "done";
    if (index === goulash.stage) dot.className = "now";
    steps.append(dot);
  }
  steps.append(`Exchange ${goulash.stage + 1} of 3`);

  const partner = `${seatName(goulash.partner)}, ${SIDE[board.rel(goulash.partner)]}`;
  const count = line("goulash-count", "");
  count.id = "goulash-count";

  const title = document.createElement("h2");
  title.textContent = "Goulash";
  panel.replaceChildren(
    line("goulash-kicker", "The last hand was drawn, so this is a"),
    title,
    // From the second exchange the swap is known; say instead where the new tiles are (#119).
    line(
      "goulash-rule",
      goulash.stage === 0
        ? "Before play, everyone swaps three tiles, three times."
        : "The tiles you just received are marked in teal.",
    ),
    line("goulash-rule", "No chows this hand, except in a special hand."),
    steps,
    line("goulash-task", `Tap 3 tiles to pass to ${partner}`),
    count,
  );
  // Replay the entrance for each new exchange.
  panel.hidden = true;
  void panel.offsetWidth;
  panel.hidden = false;
  showGoulashPicked(0);
}

/** How many of the three tiles are picked so far. */
export function showGoulashPicked(picked) {
  const count = $("#goulash-count");
  if (!count) return;
  const sent = picked === 0 && state.payload?.legalActions.length === 0;
  count.textContent = sent ? "Passed. Waiting for the others." : `${picked} of 3 picked`;
  count.classList.toggle("ready", picked === 3);
}
