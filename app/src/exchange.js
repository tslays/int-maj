/**
 * The exchange of counters on the result card: the payments of the hand, as
 * dyed counter sticks (`sticks.js`) flying from each payer's row to the
 * receiver's row over the score table, while the numbers count with them.
 *
 * The sticks are only a picture: the rows start at the totals before the hand
 * and always end on the totals the table sent, whatever is skipped. A tap
 * anywhere on the card, or a reduced-motion setting, ends it at once.
 */

import { exchangePlan, stickColor } from "./sticks.js";

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

const FLIGHT_MS = 640; // one stick's flight
const STAGGER_MS = 95; // between the sticks of one payment
const PHASE_GAP_MS = 320; // between the winner's payments, the fishing payments, the differences
const START_MS = 380; // let the card arrive first
const SETTLE_MS = 700; // the piles stay a moment, then fade
const PILE = 8; // sticks in one column of a pile

const fmt = (points) => points.toLocaleString("en");

/** "+1,200", "−300", "±0", as the result rows write a change. */
export function formatChange(delta) {
  return delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}`;
}

/** Write a row's change and total. */
function show(row, delta, total) {
  row.change.textContent = formatChange(delta);
  row.change.className = delta > 0 ? "gain" : delta < 0 ? "loss" : "";
  row.total.textContent = fmt(total);
}

function bump(element) {
  element.animate?.([{ transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" });
}

/** A point on the quadratic curve from `a` through control `c` to `b`. */
function curve(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/**
 * Play the exchange.
 *
 * @param {object} input
 * @param {HTMLElement} input.table   the score table (`.result-scores`) the sticks fly over
 * @param {Record<string, { row: HTMLElement, change: HTMLElement, total: HTMLElement }>} input.rows  each seat's row
 * @param {readonly object[]} input.ledger    the hand's ledger
 * @param {Record<string, number>} input.before  each seat's total before the hand
 * @param {Record<string, number>} input.deltas  each seat's change this hand
 * @param {(ms: number) => number} [input.scale] the table's pace
 * @param {(value: number) => void} [input.onLand] a stick has landed (sound)
 * @returns {{ done: Promise<void>, finish: () => void }}
 */
export function playExchange({ table, rows, ledger, before, deltas, scale = (ms) => ms, onLand = () => {} }) {
  const seats = Object.keys(rows);
  const now = Object.fromEntries(seats.map((seat) => [seat, { delta: 0, total: before[seat] }]));
  const animations = new Set();
  let layer = null;
  let over = false;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  const finish = () => {
    if (over) return;
    over = true;
    for (const animation of animations) animation.cancel();
    layer?.remove();
    for (const seat of seats) show(rows[seat], deltas[seat] ?? 0, before[seat] + (deltas[seat] ?? 0));
    table.classList.remove("is-exchanging");
    resolve();
  };

  for (const seat of seats) show(rows[seat], 0, before[seat]);
  const phases = exchangePlan(ledger);
  const any = phases.some((phase) => phase.transfers.some((transfer) => transfer.sticks.length > 0));
  if (!any || reducedMotion.matches || typeof Element.prototype.animate !== "function") {
    finish();
    return { done, finish };
  }

  table.classList.add("is-exchanging");
  layer = document.createElement("div");
  layer.className = "stick-layer";
  layer.setAttribute("aria-hidden", "true");
  table.append(layer);

  // Where each seat's pile sits: just left of its change, centred on the row.
  const spot = (seat) => {
    const box = table.getBoundingClientRect();
    const row = rows[seat].row.getBoundingClientRect();
    const change = rows[seat].change.getBoundingClientRect();
    return { x: change.left - box.left - 34, y: row.top - box.top + row.height / 2 };
  };
  const piles = Object.fromEntries(seats.map((seat) => [seat, 0]));

  // Every flight is scheduled at once on the animation clock (a delay each),
  // so a busy main thread cannot bunch the sticks together; the numbers move
  // as each stick lands, and the last landing settles the card.
  const fly = (transfer, value, order, delay) => {
    const from = spot(transfer.from);
    const to = spot(transfer.to);
    const index = piles[transfer.to]++;
    const end = { x: to.x - Math.floor(index / PILE) * 9, y: to.y + 6 - (index % PILE) * 3.2 };
    const start = { x: from.x + ((order % 3) - 1) * 4, y: from.y };
    // Arc out to the left of the rows, further for a longer flight.
    const reach = Math.min(110, 40 + Math.abs(end.y - start.y) * 0.5);
    const control = { x: Math.max(14, Math.min(start.x, end.x) - reach), y: (start.y + end.y) / 2 - 18 };
    const tilt = ((order * 37) % 21) - 10;
    const rest = ((index * 23) % 11) - 5;
    const place = (at, turn, size) =>
      `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) rotate(${turn}deg) scale(${size})`;

    const stick = document.createElement("span");
    stick.className = `stick stick-${stickColor(value)}`;
    layer.append(stick);
    const frames = [];
    const steps = 12;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const at = curve(start, control, end, t);
      frames.push({
        transform: place(at, tilt + (180 + rest - tilt) * t, 1 + Math.sin(Math.PI * t) * 0.18),
        opacity: t === 0 ? 0 : 1,
        offset: t * 0.85,
      });
    }
    // A small bounce as it lands in the pile.
    frames.push({ transform: place({ x: end.x, y: end.y - 3 }, 180 + rest, 1.06), opacity: 1, offset: 0.93 });
    frames.push({ transform: place(end, 180 + rest, 1), opacity: 1, offset: 1 });
    const flight = stick.animate(frames, {
      duration: scale(FLIGHT_MS),
      delay,
      easing: "cubic-bezier(.35,.05,.25,1)",
      fill: "both",
    });
    animations.add(flight);
    return flight.finished.then(
      () => {
        if (over) return;
        for (const [seat, sign] of [
          [transfer.from, -1],
          [transfer.to, 1],
        ]) {
          now[seat].delta += sign * value;
          now[seat].total += sign * value;
          show(rows[seat], now[seat].delta, now[seat].total);
          bump(rows[seat].change);
        }
        onLand(value);
      },
      () => {},
    );
  };

  let at = scale(START_MS);
  const landings = [];
  for (const phase of phases) {
    let longest = 0;
    for (const transfer of phase.transfers) {
      transfer.sticks.forEach((value, order) => {
        const delay = order * scale(STAGGER_MS);
        landings.push(fly(transfer, value, order, at + delay));
        longest = Math.max(longest, delay);
      });
    }
    at += longest + scale(FLIGHT_MS) + scale(PHASE_GAP_MS);
  }
  void Promise.all(landings).then(() => {
    if (over) return;
    const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 360,
      delay: scale(SETTLE_MS),
      easing: "ease-in",
      fill: "forwards",
    });
    animations.add(fade);
    fade.finished.then(finish, () => {});
  });
  return { done, finish };
}
