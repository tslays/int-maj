/**
 * The 3D table: game loop, decisions and screens.
 *
 * The game runs in the page (`engine/table/local.js`, the same routes as the
 * dev server). Each answer is handed to the board, which animates the change;
 * the loop then either lets the bots take their next decision, one per beat,
 * or shows you the choices the engine offers.
 */

import { createLocalApi } from "../engine/table/local.js";
import { Board } from "./board.js";
import { explainSettlement } from "./settlement.js";
import { sound } from "./sound.js";
import { ALL_FACES, initTiles, preloadFaces, tileOrder } from "./tiles.js";
import { mountStage, renderer, requestRender, screenPoint, sleep, updateConsole, viewport } from "./stage.js";

const SEATS = ["E", "S", "W", "N"];
const WIND_NAME = { E: "East", S: "South", W: "West", N: "North" };
const CALL_WORD = { pung: "Pung", kong: "Kong", chow: "Chow", mahjong: "Mah Jong" };
const BEAT_AFTER_THROW = 320;
const BEAT_AFTER_DRAW = 140;

const $ = (selector) => document.querySelector(selector);

let api = null;
let payload = null;
let busy = false;
let selected = null;
let press = null; // the tile under a held pointer
let goulashPicks = [];
const board = new Board();

/* --------------------------------------------------------- transport */

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function request(path, body) {
  return api.request(path, body);
}

/* --------------------------------------------------------- helpers */

function seatName(seat) {
  if (seat === payload.seat) return "You";
  const entry = payload.table.find((item) => item.seat === seat);
  return entry ? WIND_NAME[entry.wind] : seat;
}

function ledgerTotals(ledger) {
  const totals = { E: 0, S: 0, W: 0, N: 0 };
  for (const entry of ledger) {
    if (entry.points === null) continue;
    totals[entry.to] += entry.points;
    totals[entry.from] -= entry.points;
  }
  return totals;
}

/** The book's counters: every player starts with 16,000 points (p. 23). */
const STARTING_POINTS = 16000;

function scores() {
  const current = ledgerTotals(payload.view.ledger);
  const result = {};
  for (const seat of SEATS) result[seat] = STARTING_POINTS + (payload.scoresBefore?.[seat] ?? 0) + current[seat];
  return result;
}

function refreshConsole() {
  const view = payload.view;
  const totals = scores();
  updateConsole({
    round: view.prevailingWind,
    hand: view.handNumber,
    wall: payload.wall.remaining,
    seats: payload.table.map((entry) => ({
      rel: board.rel(entry.seat),
      wind: entry.wind,
      score: totals[entry.seat],
      dealer: entry.dealer,
      turn: view.phase !== "finished" && view.turn === entry.seat,
    })),
  });
}

function faceChip(key) {
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

/* --------------------------------------------------------- call-outs */

async function callOut(seat, word, hold = 700) {
  const element = document.createElement("div");
  element.className = `callout${word === "Mah Jong" ? " callout-win" : ""}`;
  element.textContent = word;
  const point = screenPoint(board.seatPoint(seat));
  element.style.left = `${Math.max(70, Math.min(viewport.width - 70, point.x))}px`;
  element.style.top = `${Math.max(40, Math.min(viewport.height - viewport.strip - 30, point.y))}px`;
  document.body.append(element);
  await sleep(hold);
  element.classList.add("callout-out");
  setTimeout(() => element.remove(), 300);
}

/* --------------------------------------------------------- applying answers */

let previousFishing = new Set();

/** Hand an answer to the board; announce calls; wait for the animation. */
async function apply(next, { animated = true } = {}) {
  const before = payload;
  payload = next;
  refreshConsole();
  const calls = await board.reconcile(next, { animated });
  refreshConsole();
  const announcements = [];
  for (const call of calls) {
    announcements.push(callOut(call.seat, CALL_WORD[call.kind] ?? call.kind));
    if (call.seat !== next.seat) sound.cue("notice", board.ear(call.seat));
  }
  const fishing = new Set(next.view.fishing.map((entry) => entry.seat));
  for (const seat of fishing) {
    if (!previousFishing.has(seat) && before !== null) {
      announcements.push(callOut(seat, "Fishing"));
      sound.cue("fishing", board.ear(seat));
    }
  }
  previousFishing = fishing;
  void refreshHints();
  if (announcements.length > 0) await sleep(650);
  return before;
}

/* --------------------------------------------------------- the loop */

function onlyPass(actions) {
  return actions.length > 0 && actions.every((action) => action.type === "Pass");
}

/** Let the table run until it needs you, then show your choices. */
async function run() {
  if (busy || payload === null) return;
  busy = true;
  try {
    for (;;) {
      if (payload.outcome !== null) {
        await showOutcome();
        return;
      }
      const legal = payload.legalActions;
      if (legal.length === 0) {
        const before = payload;
        const next = await request("/api/step", { game: payload.game });
        if (next.done === true) {
          await apply(await request(`/api/state?game=${encodeURIComponent(payload.game)}`));
          if (payload.legalActions.length === 0 && payload.outcome === null) return;
          continue;
        }
        await apply(next);
        await sleep(threwSince(before, next) ? BEAT_AFTER_THROW : BEAT_AFTER_DRAW);
        continue;
      }
      // Drawing is not a decision: the table hands you the tile.
      if (legal.length === 1 && legal[0].type === "Draw") {
        await apply(await request("/api/move", { game: payload.game, action: legal[0] }));
        continue;
      }
      // A claim window you cannot claim in passes by itself.
      if (onlyPass(legal)) {
        await apply(await request("/api/move", { game: payload.game, action: legal[0] }));
        continue;
      }
      if (callsOff && onlyWinOrPass(legal)) {
        await apply(await request("/api/move", { game: payload.game, action: legal.find((a) => a.type === "Pass") }));
        continue;
      }
      showChoices();
      return;
    }
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
  }
}

/** With calls off: a claim window offering nothing but calls (and Pass) is passed. */
function onlyWinOrPass(legal) {
  const pass = legal.some((a) => a.type === "Pass");
  const rest = legal.filter((a) => a.type !== "Pass");
  const isCall = (a) => a.type === "Claim" && a.kind !== "mahjong";
  return pass && rest.length > 0 && rest.every(isCall);
}

function threwSince(before, after) {
  if (before === null) return false;
  return after.table.some((entry) => {
    const old = before.table.find((item) => item.seat === entry.seat);
    return old !== undefined && entry.discards.length > old.discards.length;
  });
}

/** Send one of your decisions, then let the table carry on. */
async function act(action) {
  if (busy) return;
  busy = true;
  hideChoices();
  try {
    await apply(await request("/api/move", { game: payload.game, action }));
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
  }
  void run();
}

/* --------------------------------------------------------- choices */

function hideChoices() {
  $("#actions").replaceChildren();
}

function button(label, kind, onClick, tiles = []) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `act act-${kind}`;
  if (label !== "") {
    const text = document.createElement("span");
    text.textContent = label;
    element.append(text);
  }
  if (tiles.length > 0) {
    const row = document.createElement("span");
    row.className = "act-tiles";
    for (const key of tiles) row.append(faceChip(key));
    element.append(row);
  }
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return element;
}

/** The payload whose prompt has already chimed, so re-showing it stays quiet. */
let alertedFor = null;

/** Chime once per prompt that offers more than a discard or a pass. */
function alertFor(legal) {
  if (alertedFor === payload) return;
  const canWin = legal.some((a) => a.type === "Win" || (a.type === "Claim" && a.kind === "mahjong"));
  const canCall = legal.some(
    (a) =>
      (a.type === "Claim" && a.kind !== "mahjong" && !callsOff) ||
      ((a.type === "ConcealedKong" || a.type === "AddedKong") && !callsOff) ||
      a.type === "DeclareFishing" ||
      a.type === "GoulashExchange",
  );
  if (!canWin && !canCall) return;
  alertedFor = payload;
  sound.cue(canWin ? "alertWin" : "alert");
}

function showChoices({ chime = true } = {}) {
  const legal = payload.legalActions;
  const view = payload.view;
  const bar = $("#actions");
  bar.replaceChildren();
  selected = null;
  void refreshHints(true);
  if (chime) alertFor(legal);

  if (legal.some((action) => action.type === "GoulashExchange")) {
    goulashPicks = [];
    const confirm = button("Pass 3 tiles", "claim", () => {
      const keys = goulashPicks.map((entry) => entry.key).sort();
      const action = legal.find(
        (item) => item.type === "GoulashExchange" && [...item.tiles].sort().join() === keys.join(),
      );
      if (action) void act(action);
    });
    confirm.disabled = true;
    confirm.id = "goulash-confirm";
    bar.append(confirm);
    return;
  }

  const wins = legal.filter((action) => action.type === "Win");
  const claims = callsOff ? [] : legal.filter((action) => action.type === "Claim" && action.kind !== "mahjong");
  const mahjongClaim = legal.find((action) => action.type === "Claim" && action.kind === "mahjong");
  const kongs = callsOff ? [] : legal.filter((action) => action.type === "ConcealedKong" || action.type === "AddedKong");
  const fishing = legal.find((action) => action.type === "DeclareFishing");
  const pass = legal.find((action) => action.type === "Pass");
  const reshuffle = legal.find((action) => action.type === "RequestReshuffle");

  if (pass) bar.append(button(fishing ? "Don't announce" : "Pass", "pass", () => void act(pass)));
  if (reshuffle) bar.append(button("Reshuffle", "pass", () => void act(reshuffle)));
  const sortTiles = (tiles) => [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b));
  const chows = claims.filter((claim) => claim.kind === "chow");
  if (chows.length === 1) {
    bar.append(button("Chow", "claim", () => void act(chows[0]), sortTiles(chows[0].tiles)));
  } else if (chows.length > 1) {
    // Several runs: one Chow button, then the runs to pick from.
    bar.append(
      button("Chow", "claim", () => {
        bar.replaceChildren(
          button("Back", "pass", () => showChoices({ chime: false })),
          ...chows.map((claim) => button("", "claim", () => void act(claim), sortTiles(claim.tiles))),
        );
      }),
    );
  }
  for (const claim of claims.filter((item) => item.kind !== "chow")) {
    bar.append(button(CALL_WORD[claim.kind], "claim", () => void act(claim), sortTiles(claim.tiles)));
  }
  for (const kong of kongs) bar.append(button("Kong", "claim", () => void act(kong), [kong.tile]));
  if (fishing) bar.append(button("Fishing", "claim", () => void act(fishing), fishing.wait.slice(0, 4)));
  const win = wins[0] ?? mahjongClaim;
  if (win) bar.append(button("Mah Jong", "win", () => void act(win)));

  if (view.claimWindow !== null && view.phase === "claim") {
    bar.prepend(faceChipLarge(view.claimWindow.tile));
  }
}

function faceChipLarge(key) {
  const chip = faceChip(key);
  chip.classList.add("chip-large");
  return chip;
}

/* --------------------------------------------------------- input */

function legalDiscard(key) {
  return payload?.legalActions.find((action) => action.type === "Discard" && action.tile === key) ?? null;
}

/** The quiet click of a hand tile, pitched by where it sits along the hand. */
function tickFor(entry) {
  const at = board.hand.indexOf(entry);
  sound.cue("tick", { pitch: board.hand.length > 1 ? at / (board.hand.length - 1) : 0.5 });
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (busy || payload === null) return;
  const entry = board.pick(event);
  const legal = payload.legalActions;

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
  // Press on a hand tile: a tap selects / swaps / discards, a drag re-arranges.
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

/** With a mouse (or pen) the tile under the pointer is pre-selected: click discards. */
function hover(event) {
  if (press !== null || busy || payload === null) return;
  if (payload.legalActions.some((action) => action.type === "GoulashExchange")) return;
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
  board.dragTo(press.entry, event);
});

function endPress(event, cancelled) {
  if (press === null || event.pointerId !== press.id) return;
  const { entry, wasSelected, dragging } = press;
  press = null;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
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
  // A second tile tapped while one is lifted: they trade places.
  const other = selected;
  selected = null;
  board.swap(other, entry);
  void board.settle();
}

renderer.domElement.addEventListener("pointerup", (event) => endPress(event, false));
renderer.domElement.addEventListener("pointercancel", (event) => endPress(event, true));

/* --------------------------------------------------------- closest hands */

const HINTS_KEY = "int-maj.hints";

function readHints() {
  try {
    return storage()?.getItem(HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

let hintsOn = readHints();
let hintsFor = null; // the tiles the panel was last built for

/**
 * The catalogue hands your tiles are nearest to, top right. Asked for when
 * your own tiles change and at each of your decisions (the tiles in sight
 * change too), never on a bot's beat alone.
 */
async function refreshHints(force = false) {
  const panel = $("#closest");
  if (!hintsOn || payload === null || payload.outcome !== null || payload.view.phase === "finished") {
    panel.hidden = true;
    closeHandDetail();
    hintsFor = null;
    return;
  }
  const player = payload.view.player;
  const key = `${payload.game}|${player.hand.join()}|${player.melds.map((meld) => meld.tiles.join()).join("/")}`;
  if (!force && key === hintsFor) return;
  hintsFor = key;
  try {
    const answer = await request(`/api/closest?game=${encodeURIComponent(payload.game)}`);
    if (hintsFor === key) renderHints(answer.hands);
  } catch {
    panel.hidden = true;
  }
}

const TIER_LABEL = {
  half: "Half limit",
  limit: "Limit",
  middle: "Middle limit",
  double: "Double limit",
  calculate: "Calculated score",
};

function worth(tier, points) {
  return points === null ? TIER_LABEL[tier] : `${TIER_LABEL[tier]} · ${points.toLocaleString("en")}`;
}

/**
 * Open eye: exposed melds are fine. Closed eye: concealed only. Drawn in
 * the text colour so it stays quiet; the words appear on the hand's sheet.
 */
function playIcon(concealedOnly) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "play-icon");
  svg.setAttribute("aria-hidden", "true");
  const shape = (name, attrs) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
  };
  if (concealedOnly) {
    shape("path", { d: "M3 10c2.4 4.4 5.4 6.5 9 6.5s6.6-2.1 9-6.5" });
    shape("path", { d: "M6.5 14.6 4.5 17.5M12 16.5V20M17.5 14.6l2 2.9" });
  } else {
    shape("path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" });
    shape("circle", { cx: "12", cy: "12", r: "3" });
  }
  return svg;
}

function renderHints(hands) {
  const panel = $("#closest");
  const title = document.createElement("p");
  title.className = "closest-title";
  title.textContent = "Closest hands";
  if (hands.length === 0) {
    const empty = document.createElement("p");
    empty.className = "closest-empty";
    empty.textContent = "Nothing within six tiles yet.";
    panel.replaceChildren(title, empty);
    panel.hidden = false;
    return;
  }
  const list = document.createElement("ol");
  for (const hand of hands) {
    const item = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "closest-item";
    row.title = hand.concealedOnly ? "Concealed only" : "Exposed melds allowed";
    row.setAttribute(
      "aria-label",
      `${hand.name}, ${hand.concealedOnly ? "concealed only" : "exposed melds allowed"}. Tap for details.`,
    );
    const name = document.createElement("span");
    name.className = "closest-name";
    name.textContent = hand.name;
    const meta = document.createElement("span");
    meta.className = "closest-meta";
    const progress = document.createElement("span");
    const value = hand.points === null ? "calculated" : hand.points.toLocaleString("en");
    if (hand.away === 0) {
      const done = document.createElement("span");
      done.className = "closest-done";
      done.textContent = "Complete";
      progress.append(done, ` · ${value}`);
    } else {
      progress.textContent = `${hand.away} to go · ${value}`;
    }
    meta.append(progress, playIcon(hand.concealedOnly));
    row.append(name, meta);
    row.addEventListener("click", () => void openHandDetail(hand));
    item.append(row);
    list.append(item);
  }
  panel.replaceChildren(title, list);
  panel.hidden = false;
}

/* --------------------------------------------------------- hand detail */

function closeHandDetail() {
  const sheet = $("#hand-detail");
  if (sheet.hidden) return;
  sheet.hidden = true;
  sheet.replaceChildren();
}

function detailLine(label, ...content) {
  const line = document.createElement("div");
  line.className = "detail-line";
  const heading = document.createElement("h3");
  heading.textContent = label;
  const body = document.createElement("p");
  body.append(...content);
  line.append(heading, body);
  return line;
}

async function openHandDetail(hand) {
  let detail;
  try {
    detail = await request(`/api/hand?pattern=${encodeURIComponent(hand.pattern)}`);
  } catch {
    return;
  }
  const sheet = $("#hand-detail");
  const card = document.createElement("div");
  card.className = "detail-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", detail.name);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "detail-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "\u00d7";
  close.addEventListener("click", closeHandDetail);

  const heading = document.createElement("h2");
  heading.textContent = detail.name;

  const banner = document.createElement("div");
  banner.className = "detail-banner";
  const bannerTitle = document.createElement("strong");
  bannerTitle.textContent = detail.concealedOnly ? "Concealed only" : "Exposed or concealed";
  const bannerText = document.createElement("span");
  bannerText.textContent = detail.concealedOnly
    ? "Build it entirely from your own tiles. Do not call Pung, Kong or Chow on a discard: " +
      "one exposed meld and this hand is gone. You may still win on a discard."
    : "You may call discards to make exposed melds and still win this hand, " +
      "though it pays less than playing it concealed.";
  banner.append(playIcon(detail.concealedOnly), bannerTitle, bannerText);

  card.append(close, heading, banner, detailLine("What it is", detail.description));
  if (detail.requiresSelfDrawn) {
    card.append(detailLine("Self-drawn", "Every tile, the winning one included, must come from the wall."));
  }
  const pays = [`Concealed: ${worth(detail.concealedTier, detail.concealedPoints)}`];
  pays.push(
    detail.exposedTier === null
      ? "Exposed: not possible"
      : `Exposed: ${worth(detail.exposedTier, detail.exposedPoints)}`,
  );
  const payLine = detailLine("What it pays", pays[0]);
  payLine.lastChild.append(document.createElement("br"), pays[1]);
  card.append(payLine);

  const need = document.createElement("span");
  need.className = "closest-need detail-need";
  if (hand.away === 0) {
    need.textContent = "Complete: you can declare it.";
  } else {
    for (const key of hand.need) need.append(faceChip(key));
  }
  card.append(
    detailLine(hand.away === 0 ? "Your hand" : `You still need (${hand.away})`, need),
    detailLine("In the book", detail.pages.length > 1 ? `pages ${detail.pages.join(", ")}` : `page ${detail.pages[0]}`),
  );

  sheet.replaceChildren(card);
  sheet.hidden = false;
  close.focus();
}

$("#hand-detail").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeHandDetail();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHandDetail();
});

/* A menu toggle shows its state by its glow alone: lit = on, the label stays the word. */
function showToggle(selector, on) {
  const button = $(selector);
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", String(on));
}

function showHintsButton() {
  showToggle("#hints", hintsOn);
}
showHintsButton();

$("#hints").addEventListener("click", () => {
  hintsOn = !hintsOn;
  try {
    storage()?.setItem(HINTS_KEY, hintsOn ? "on" : "off");
  } catch {
    // Private mode: the choice lasts for this visit.
  }
  showHintsButton();
  void refreshHints(true);
});

/* --------------------------------------------------------- outcome */

async function showOutcome() {
  const outcome = payload.outcome;
  if ($("#result").dataset.hand === board.handId) return;
  $("#result").dataset.hand = board.handId;
  hideChoices();
  if (outcome.kind === "win" && outcome.winner !== null) {
    sound.cue(outcome.winner === payload.seat ? "win" : "lose");
    await callOut(outcome.winner, "Mah Jong", 1100);
  } else {
    sound.cue("drawn");
    await callOut(payload.view.dealer, "Drawn", 900);
  }
  renderOutcome(outcome);
}

function renderOutcome(outcome) {
  const panel = $("#result");
  const card = document.createElement("div");
  card.className = "result-card";
  const main = document.createElement("div");
  main.className = "result-main";
  const side = document.createElement("div");
  side.className = "result-side";
  const win = outcome.kind === "win" && outcome.winner !== null;

  const head = document.createElement("p");
  head.className = "result-kicker";
  head.textContent = win
    ? `${seatName(outcome.winner)} ${outcome.winner === payload.seat ? "win" : "wins"} · ${
        outcome.selfDrawn ? "self-drawn" : `on ${seatName(outcome.from)}'s discard`
      } · Hand ${payload.view.handNumber}`
    : `Hand ${payload.view.handNumber} · drawn`;
  const title = document.createElement("h2");
  title.textContent = win ? (outcome.patternName ?? "Mah Jong") : "Drawn hand";
  main.append(head, title);

  if (win && outcome.patternDescription) {
    const description = document.createElement("p");
    description.className = "result-description";
    description.textContent = outcome.patternDescription;
    if (outcome.patternPages.length > 0) {
      const pages = document.createElement("span");
      pages.className = "result-pages";
      pages.textContent = ` Illustrated p. ${outcome.patternPages.join(", ")}`;
      description.append(pages);
    }
    main.append(description);
  } else if (!win) {
    const reason = document.createElement("p");
    reason.className = "result-description";
    reason.textContent = outcome.reason;
    main.append(reason);
  }

  if (win) {
    const tiles = document.createElement("div");
    tiles.className = "result-tiles";
    if (outcome.hand !== null) {
      const concealed = document.createElement("span");
      concealed.className = "result-group";
      for (const key of [...outcome.hand].sort((a, b) => tileOrder(a) - tileOrder(b))) concealed.append(faceChip(key));
      tiles.append(concealed);
    }
    for (const meld of outcome.melds ?? []) {
      const group = document.createElement("span");
      group.className = "result-group";
      for (const key of meld.tiles) group.append(faceChip(key));
      tiles.append(group);
    }
    if (outcome.hand === null && outcome.winningTile) {
      const group = document.createElement("span");
      group.className = "result-group result-winning";
      group.append(faceChip(outcome.winningTile));
      tiles.append(group);
    }
    main.append(tiles);

    const sums = document.createElement("dl");
    sums.className = "result-sums";
    const line = (label, value) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      sums.append(term, detail);
    };
    const power = (n) => String(n).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[digit]);
    if (outcome.ground !== null) {
      const raw = outcome.raw ?? outcome.ground;
      line(
        "Score",
        outcome.doubles
          ? `${outcome.ground} × 2${power(outcome.doubles)} = ${raw.toLocaleString("en")}`
          : String(outcome.ground),
      );
    }
    if (outcome.tier && outcome.tier !== "calculate") line("Hand", `${outcome.tier} limit`);
    if (outcome.points !== null) {
      const capped = outcome.raw !== null && outcome.raw > outcome.points;
      line("Paid", `${outcome.points.toLocaleString("en")}${capped ? ` (limit ${outcome.limit.toLocaleString("en")})` : ""}`);
    }
    main.append(sums);
  }

  const account = explainSettlement({
    outcome,
    you: payload.seat,
    dealer: payload.view.dealer,
    name: seatName,
    fishing: payload.view.fishing.map((entry) => entry.seat),
  });
  const table = document.createElement("div");
  table.className = "result-scores";
  const totals = scores();
  for (const entry of payload.table) {
    const seatBox = document.createElement("div");
    seatBox.className = "result-seat";
    // By default only the result: the change in green or red, and the total.
    // Tapping a seat opens its payments, each with the reason for it.
    const row = document.createElement("button");
    row.type = "button";
    row.className = "result-row";
    row.setAttribute("aria-expanded", "false");
    const delta = outcome.totals[entry.seat] ?? 0;
    const name = document.createElement("span");
    name.textContent = `${WIND_NAME[entry.wind]}${entry.seat === payload.seat ? " (you)" : ""}`;
    const change = document.createElement("span");
    change.className = delta > 0 ? "gain" : delta < 0 ? "loss" : "";
    change.textContent = delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("en")}`;
    const total = document.createElement("span");
    total.className = "total";
    total.textContent = totals[entry.seat].toLocaleString("en");
    row.append(name, change, total);
    if (outcome.winner === entry.seat) row.classList.add("is-winner");

    const why = document.createElement("ul");
    why.className = "result-why";
    why.hidden = true;
    for (const line of account[entry.seat]) {
      const item = document.createElement("li");
      item.className = `why-${line.dir}`;
      const text = document.createElement("span");
      text.className = "why-text";
      text.textContent = line.text;
      item.append(text);
      if (line.why) {
        const reason = document.createElement("span");
        reason.className = "why-reason";
        reason.textContent = line.why;
        item.append(reason);
      }
      why.append(item);
    }
    row.addEventListener("click", () => {
      const open = why.hidden;
      for (const other of table.querySelectorAll(".result-row")) other.setAttribute("aria-expanded", "false");
      for (const other of table.querySelectorAll(".result-why")) other.hidden = true;
      why.hidden = !open;
      row.setAttribute("aria-expanded", String(open));
    });
    seatBox.append(row, why);
    table.append(seatBox);
  }
  side.append(table);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "act act-win result-next";
  next.textContent = outcome.gameOver ? "New game" : "Next hand";
  next.addEventListener("click", async () => {
    panel.hidden = true;
    panel.replaceChildren();
    if (outcome.gameOver) {
      await newGame();
      return;
    }
    busy = true;
    try {
      await apply(await request("/api/next", { game: payload.game }), { animated: false });
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
    }
    void run();
  });
  side.append(next);
  card.append(main, side);
  panel.replaceChildren(card);
  panel.hidden = false;
}

/* --------------------------------------------------------- menu */

function toast(text) {
  const element = $("#toast");
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (element.hidden = true), 3200);
}

let callsOff = false;

async function newGame() {
  if (busy) return;
  busy = true;
  $("#result").hidden = true;
  $("#result").dataset.hand = "";
  hideChoices();
  try {
    const seed = `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    await apply(await request("/api/new", { seed }), { animated: false });
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
  }
  void run();
}

/* Calls: lit = you are offered calls on each discard; off = you are not asked. */
$("#calls").addEventListener("click", () => {
  callsOff = !callsOff;
  showToggle("#calls", !callsOff);
  // Re-offer (or drop) the calls for the decision already on screen.
  if (!busy && payload !== null && payload.outcome === null) void run();
});
showToggle("#calls", !callsOff);

/* Sort: lit = the hand keeps itself sorted; swapping or dragging turns it off. */
function showSort(custom) {
  showToggle("#sort", custom);
}
board.onCustomChange = showSort;
showSort(board.custom);

$("#sort").addEventListener("click", () => {
  if (board.custom) void board.autoSort();
  else board.setCustom(true);
});

/* Sound: lit = on by default; the choice is remembered on the device. */
function showSound() {
  showToggle("#sound", !sound.muted);
}
showSound();

$("#sound").addEventListener("click", () => {
  sound.setMuted(!sound.muted);
  showSound();
  sound.cue("press"); // heard only when sound has just been turned on
});

$("#new-game").addEventListener("click", () => void newGame());

/* --------------------------------------------------------- start */

async function boot() {
  sound.install(window);
  // Every button taps (the sound toggle makes its own, after it has switched).
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (target !== null && target.id !== "sound") sound.cue("press");
    },
    true,
  );
  mountStage(document.body);
  initTiles(renderer, requestRender);
  preloadFaces(ALL_FACES);
  api = createLocalApi(storage());
  // Review states: `?state=claim|win|result|...` opens one fixed board.
  const review = new URLSearchParams(window.location.search).get("state");
  if (review !== null) {
    try {
      await apply(await request(`/api/scenario?state=${encodeURIComponent(review)}`), { animated: false });
      void run();
      return;
    } catch (error) {
      toast(error.message);
    }
  }
  const resumed = api.resume();
  if (resumed !== null) {
    await apply(resumed, { animated: false });
    void run();
    return;
  }
  await newGame();
}

// A handle for automated play-throughs and debugging: the current answer and
// a way to take one of the offered actions.
window.mahjong = {
  state: () => payload,
  busy: () => busy,
  act: (action) => act(action),
  next: () => $("#result .result-next")?.click(),
  sound,
};

void boot();
