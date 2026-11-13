/**
 * What the table's modules share: the DOM shorthand, the one piece of mutable
 * game state, the board, storage, the transport and a few small helpers.
 */

import { Board } from "./board.js";

export const SEATS = ["E", "S", "W", "N"];
export const WIND_NAME = { E: "East", S: "South", W: "West", N: "North" };

export const $ = (selector) => document.querySelector(selector);

/** The running game: the local api, the latest answer, and the loop's flags. */
export const state = {
  api: null,
  payload: null,
  busy: false,
  /** New game was asked for while busy; the turn loop starts it when it stops. */
  newGameWanted: false,
  callsOff: false,
};
export const board = new Board();

export function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function request(path, body) {
  return state.api.request(path, body);
}

export function seatName(seat) {
  if (seat === state.payload.seat) return "You";
  const entry = state.payload.table.find((item) => item.seat === seat);
  return entry ? WIND_NAME[entry.wind] : seat;
}

export function ledgerTotals(ledger) {
  const totals = { E: 0, S: 0, W: 0, N: 0 };
  for (const entry of ledger) {
    if (entry.points === null) continue;
    totals[entry.to] += entry.points;
    totals[entry.from] -= entry.points;
  }
  return totals;
}

/** The book's counters: every player starts with 16,000 points (Illustrated p. 23). */
export const STARTING_POINTS = 16000;

export function scores() {
  const current = ledgerTotals(state.payload.view.ledger);
  const result = {};
  for (const seat of SEATS) result[seat] = STARTING_POINTS + (state.payload.scoresBefore?.[seat] ?? 0) + current[seat];
  return result;
}

export function faceChip(key) {
  const chip = document.createElement("span");
  chip.className = "chip";
  if (key === null) {
    chip.classList.add("chip-back");
    return chip;
  }
  const image = document.createElement("img");
  image.src = `assets/faces/${key}.svg`;
  image.alt = key;
  if (key === "dW") chip.classList.add("chip-white");
  chip.append(image);
  return chip;
}

/** The hand set the hand on the table was dealt under (every hand before a game). */
export function handSetInForce() {
  return state.payload?.houseRules?.handSet ?? "all";
}

/** True when the hand on the table is played with the Companion's hands only. */
export function companionRules() {
  return handSetInForce() !== "all";
}

export function toast(text) {
  const element = $("#toast");
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.hidden = true), 3200);
}

/* A menu toggle shows its state by its glow alone: lit = on, the label stays the word. */
export function showToggle(selector, on) {
  const button = $(selector);
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", String(on));
}
