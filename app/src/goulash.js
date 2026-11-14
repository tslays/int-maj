/**
 * The Goulash banner: a small, quiet panel over the middle of the table for
 * as long as the three exchanges last, so nobody mistakes the hand for an
 * ordinary one.
 *
 * It says only what the player needs at the moment: which of the three
 * exchanges is on, who your tiles go to, and how many you have picked. What a
 * Goulash is and why (a drawn hand is followed by one, Illustrated p. 21) is
 * the first-game tip's job (`tips.js`), shown once. The banner never takes a
 * touch: the hand under it stays in reach.
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
  panel.replaceChildren(title, steps, line("goulash-task", `Pass 3 tiles to ${partner}`), count);
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
