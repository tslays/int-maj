/**
 * The exchange of counters over the result card: the hand's payments, as
 * dyed counter sticks (`sticks.js`) thrown from each payer's side of the
 * screen to the receiver's, the way they are tossed across a real table. They
 * land, skid, knock together and come to rest (`throw.js`); the numbers on the
 * card count as each stick lands; a tag shows what each seat won or lost, and
 * after a few seconds the sticks fade.
 *
 * The sticks are only a picture: the rows start at the totals before the hand
 * and always end on the totals the table sent, whatever is skipped. A tap
 * anywhere, a key, or a reduced-motion setting ends it at once.
 */

import { exchangePlan, stickColor } from "./sticks.js";
import { createThrow, STICK_THICKNESS } from "./throw.js";

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };

const START_MS = 420; // let the card arrive first
const STAGGER_MS = 70; // between the sticks of one payment
const PHASE_GAP_MS = 1100; // between the winner's payments, the fishing payments, the differences
const HOLD_MS = 2500; // the sticks lie on the table this long once still
const FADE_MS = 500;

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

/**
 * Play the exchange.
 *
 * @param {object} input
 * @param {HTMLElement} input.host   the result panel: the sticks fly over it, and a tap on it skips
 * @param {Record<string, { row: HTMLElement, change: HTMLElement, total: HTMLElement }>} input.rows  each seat's row
 * @param {readonly object[]} input.ledger    the hand's ledger
 * @param {Record<string, number>} input.before  each seat's total before the hand
 * @param {Record<string, number>} input.deltas  each seat's change this hand
 * @param {(seat: string) => number} input.side  where a seat sits on screen: 0 you, 1 right, 2 across, 3 left
 * @param {(ms: number) => number} [input.scale] the table's pace
 * @param {(value: number, pan: number) => void} [input.onLand] a stick has landed (sound), panned -1..1 by where
 * @param {() => void} [input.onKnock] sticks knocked together (sound)
 * @returns {{ done: Promise<void>, finish: () => void }}
 */
export function playExchange({
  host,
  rows,
  ledger,
  before,
  deltas,
  side,
  scale = (ms) => ms,
  onLand = () => {},
  onKnock = () => {},
}) {
  const seats = Object.keys(rows);
  const now = Object.fromEntries(seats.map((seat) => [seat, { delta: 0, total: before[seat] }]));
  let layer = null;
  let frame = 0;
  let over = false;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  const onKey = (event) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") finish();
  };
  function finish() {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    layer?.remove();
    host.removeEventListener("pointerdown", finish, true);
    window.removeEventListener("keydown", onKey, true);
    for (const seat of seats) show(rows[seat], deltas[seat] ?? 0, before[seat] + (deltas[seat] ?? 0));
    resolve();
  }

  for (const seat of seats) show(rows[seat], 0, before[seat]);
  const phases = exchangePlan(ledger);
  const throws = [];
  let at = scale(START_MS);
  for (const phase of phases) {
    let longest = 0;
    for (const transfer of phase.transfers) {
      transfer.sticks.forEach((value, order) => {
        const delay = at + order * scale(STAGGER_MS);
        throws.push({ from: side(transfer.from), to: side(transfer.to), value, delay: delay / 1000, transfer });
        longest = Math.max(longest, order * scale(STAGGER_MS));
      });
    }
    if (phase.transfers.some((transfer) => transfer.sticks.length > 0)) at += longest + scale(PHASE_GAP_MS);
  }
  if (throws.length === 0 || reducedMotion.matches) {
    finish();
    return { done, finish };
  }

  host.addEventListener("pointerdown", finish, true);
  window.addEventListener("keydown", onKey, true);
  layer = document.createElement("div");
  layer.className = "stick-throw";
  layer.setAttribute("aria-hidden", "true");
  host.append(layer);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const physics = createThrow({ width, height, throws });
  const elements = physics.sticks.map((stick) => {
    const element = document.createElement("span");
    element.className = `stick stick-${stickColor(stick.value)}`;
    element.style.width = `${stick.length}px`;
    element.style.height = `${STICK_THICKNESS}px`;
    layer.append(element);
    return element;
  });

  const draw = () => {
    physics.sticks.forEach((stick, index) => {
      const element = elements[index];
      if (stick.state === "waiting") {
        element.style.opacity = "0";
        return;
      }
      const lift = stick.z / 110;
      element.style.opacity = "1";
      element.style.transform = `translate(${stick.x}px, ${stick.y}px) translate(-50%, -50%) rotate(${stick.angle}rad) scale(${1 + lift * 0.45})`;
      element.style.boxShadow = `0 1px 0 rgba(255,255,255,0.3) inset, ${4 + lift * 16}px ${6 + lift * 26}px ${4 + lift * 14}px rgba(0,0,0,${0.5 - lift * 0.25})`;
    });
  };

  // What each seat won or lost, shown once the sticks lie still.
  const tags = () => {
    for (const seat of seats) {
      const delta = deltas[seat] ?? 0;
      if (delta === 0) continue;
      const mine = physics.sticks.filter((stick) => throws[stick.index].transfer.to === seat);
      let x;
      let y;
      if (delta > 0 && mine.length > 0) {
        x = mine.reduce((sum, stick) => sum + stick.x, 0) / mine.length;
        y = mine.reduce((sum, stick) => sum + stick.y, 0) / mine.length;
      } else {
        const s = side(seat);
        x = s === 1 ? width - 44 : s === 3 ? 44 : width / 2;
        y = s === 0 ? height - 26 : s === 2 ? 26 : height / 2;
      }
      const tag = document.createElement("span");
      tag.className = `stick-tag ${delta > 0 ? "gain" : "loss"}`;
      tag.textContent = formatChange(delta);
      tag.style.left = `${Math.min(width - 44, Math.max(44, x))}px`;
      tag.style.top = `${Math.min(height - 26, Math.max(26, y))}px`;
      layer.append(tag);
    }
  };

  let last = performance.now();
  let stillSince = null;
  const tick = (time) => {
    if (over) return;
    const result = physics.step((time - last) / 1000);
    last = time;
    for (const stick of result.landed) {
      const { transfer } = throws[stick.index];
      for (const [seat, sign] of [
        [transfer.from, -1],
        [transfer.to, 1],
      ]) {
        now[seat].delta += sign * stick.value;
        now[seat].total += sign * stick.value;
        show(rows[seat], now[seat].delta, now[seat].total);
        bump(rows[seat].change);
      }
      onLand(stick.value, ((stick.x / width) * 2 - 1) * 0.7);
    }
    if (result.knocks > 0) onKnock();
    draw();
    if (physics.resting()) {
      if (stillSince === null) {
        stillSince = time;
        tags();
      } else if (time - stillSince > scale(HOLD_MS)) {
        const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-in", fill: "forwards" });
        fade.finished.then(finish, finish);
        return;
      }
    }
    frame = requestAnimationFrame(tick);
  };
  draw();
  frame = requestAnimationFrame(tick);
  return { done, finish };
}
