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
  for (const call of calls) announcements.push(callOut(call.seat, CALL_WORD[call.kind] ?? call.kind));
  const fishing = new Set(next.view.fishing.map((entry) => entry.seat));
  for (const seat of fishing) {
    if (!previousFishing.has(seat) && before !== null) announcements.push(callOut(seat, "Fishing"));
  }
  previousFishing = fishing;
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

function showChoices() {
  const legal = payload.legalActions;
  const view = payload.view;
  const bar = $("#actions");
  bar.replaceChildren();
  selected = null;

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
          button("Back", "pass", () => showChoices()),
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
    } else if (goulashPicks.length < 3) {
      goulashPicks.push(entry);
      void board.lift(entry, true);
    }
    const confirm = $("#goulash-confirm");
    if (confirm) confirm.disabled = goulashPicks.length !== 3;
    return;
  }

  if (entry === null || legalDiscard(entry.key) === null) {
    if (selected !== null) void board.lift(selected, false);
    selected = null;
    return;
  }
  if (entry === selected) {
    selected = null;
    board.noteThrow(entry);
    void act(legalDiscard(entry.key));
    return;
  }
  if (selected !== null) void board.lift(selected, false);
  selected = entry;
  void board.lift(entry, true);
});

/* --------------------------------------------------------- outcome */

async function showOutcome() {
  const outcome = payload.outcome;
  if ($("#result").dataset.hand === board.handId) return;
  $("#result").dataset.hand = board.handId;
  hideChoices();
  if (outcome.kind === "win" && outcome.winner !== null) {
    await callOut(outcome.winner, "Mah Jong", 1100);
  } else {
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

  const table = document.createElement("div");
  table.className = "result-scores";
  const totals = scores();
  for (const entry of payload.table) {
    const row = document.createElement("div");
    row.className = "result-row";
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
    table.append(row);
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

$("#calls").addEventListener("click", () => {
  callsOff = !callsOff;
  const button = $("#calls");
  button.classList.toggle("on", callsOff);
  button.setAttribute("aria-pressed", String(callsOff));
  button.firstElementChild.textContent = callsOff ? "Calls off" : "Calls on";
  // Re-offer (or drop) the calls for the decision already on screen.
  if (!busy && payload !== null && payload.outcome === null) void run();
});

$("#new-game").addEventListener("click", () => void newGame());

/* --------------------------------------------------------- start */

async function boot() {
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
};

void boot();
