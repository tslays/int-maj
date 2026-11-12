/**
 * The 3D table: boot, the turn loop and the wiring.
 *
 * The game runs in the page (`engine/table/local.js`, which answers the
 * table service's routes with no server). Each answer is handed to the board, which animates the change;
 * the loop then either lets the bots take their next decision, one per beat,
 * or shows you the choices the engine offers. The rest of the screen lives in
 * its own modules: `hints.js`, `input.js`, `result.js`, `menu.js`, `report.js`
 * (shared state and helpers in `shared.js`).
 */

import { createLocalApi } from "../engine/table/local.js";
import { playOpening } from "./ceremony.js";
import { openingPref } from "./opening.js";
import { clearSelection, goulashKeys, installInput, resetGoulash } from "./input.js";
import { refreshGoulash } from "./goulash.js";
import { refreshHints } from "./hints.js";
import { warmIndex } from "./handbook.js";
import { installMenu } from "./menu.js";
import { houseRules, installOptions } from "./options.js";
import { level } from "./level.js";
import { pace } from "./pace.js";
import "./report.js";
import { installResult, showOutcome } from "./result.js";
import { $, board, faceChip, request, scores, state, storage, toast } from "./shared.js";
import { sound } from "./sound.js";
import { ALL_FACES, initTiles, preloadFaces, tileOrder } from "./tiles.js";
import { mountStage, renderer, requestRender, screenPoint, sleep, updateConsole, viewport } from "./stage.js";

const CALL_WORD = { pung: "Pung", kong: "Kong", chow: "Chow", mahjong: "Mah Jong" };
const BEAT_AFTER_THROW = 320;
const BEAT_AFTER_DRAW = 140;

/** `litView`: the view whose turn the light shows (kept back while a move still animates). */
function refreshConsole(litView = state.payload.view) {
  const view = state.payload.view;
  const totals = scores();
  updateConsole({
    round: view.prevailingWind,
    hand: view.handNumber,
    wall: state.payload.wall.remaining,
    seats: state.payload.table.map((entry) => ({
      rel: board.rel(entry.seat),
      wind: entry.wind,
      score: totals[entry.seat],
      dealer: entry.dealer,
      turn: litView.phase !== "finished" && litView.turn === entry.seat,
    })),
  });
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
  await sleep(pace.scale(hold));
  element.classList.add("callout-out");
  setTimeout(() => element.remove(), 300);
}

/* --------------------------------------------------------- applying answers */

let previousFishing = new Set();

/** Hand an answer to the board; announce calls; wait for the animation. */
async function apply(next, { animated = true, opening = false } = {}) {
  const before = state.payload;
  state.payload = next;
  // A hand's opening (dice, break, deal) is shown when the player wants it;
  // its winds appear once East is known, not before.
  const open = opening && openingPref.enabled;
  // Scores and wall update at once; the turn light waits for the move to finish.
  if (!open) refreshConsole(before?.view ?? next.view);
  const calls = open ? await playOpening(next, { onSeated: () => refreshConsole() }) : await board.reconcile(next, { animated });
  refreshConsole();
  refreshGoulash();
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
  if (announcements.length > 0) await sleep(pace.scale(650));
  return before;
}

/* --------------------------------------------------------- the loop */

function onlyPass(actions) {
  return actions.length > 0 && actions.every((action) => action.type === "Pass");
}

/** Review boards (`?state=`) are fixed screens: their bots always play at Hard, as the board was built. */
const REVIEW = new URLSearchParams(window.location.search).has("state");
const botLevel = () => (REVIEW ? "hard" : level.id);

/** Let the table run until it needs you, then show your choices. */
async function run() {
  if (state.busy || state.payload === null) return;
  state.busy = true;
  try {
    for (;;) {
      if (state.payload.outcome !== null) {
        await showOutcome();
        return;
      }
      const legal = state.payload.legalActions;
      if (legal.length === 0) {
        const before = state.payload;
        const next = await request("/api/step", { game: state.payload.game, level: botLevel() });
        if (next.done === true) {
          await apply(await request(`/api/state?game=${encodeURIComponent(state.payload.game)}`));
          if (state.payload.legalActions.length === 0 && state.payload.outcome === null) return;
          continue;
        }
        await apply(next);
        await sleep(pace.scale(threwSince(before, next) ? BEAT_AFTER_THROW : BEAT_AFTER_DRAW));
        continue;
      }
      // Drawing is not a decision: the table hands you the tile.
      if (legal.length === 1 && legal[0].type === "Draw") {
        await apply(await request("/api/move", { game: state.payload.game, action: legal[0] }));
        continue;
      }
      // A claim window you cannot claim in passes by itself.
      if (onlyPass(legal)) {
        await apply(await request("/api/move", { game: state.payload.game, action: legal[0] }));
        continue;
      }
      if (state.callsOff && onlyWinOrPass(legal)) {
        await apply(await request("/api/move", { game: state.payload.game, action: legal.find((a) => a.type === "Pass") }));
        continue;
      }
      showChoices();
      return;
    }
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
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
  if (state.busy) return;
  state.busy = true;
  hideChoices();
  try {
    await apply(await request("/api/move", { game: state.payload.game, action }));
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
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

/** The state.payload whose prompt has already chimed, so re-showing it stays quiet. */
let alertedFor = null;

/** Chime once per prompt that offers more than a discard or a pass. */
function alertFor(legal) {
  if (alertedFor === state.payload) return;
  const canWin = legal.some((a) => a.type === "Win" || (a.type === "Claim" && a.kind === "mahjong"));
  const canCall = legal.some(
    (a) =>
      (a.type === "Claim" && a.kind !== "mahjong" && !state.callsOff) ||
      ((a.type === "ConcealedKong" || a.type === "AddedKong") && !state.callsOff) ||
      a.type === "DeclareFishing" ||
      a.type === "GoulashExchange",
  );
  if (!canWin && !canCall) return;
  alertedFor = state.payload;
  sound.cue(canWin ? "alertWin" : "alert");
}

function showChoices({ chime = true } = {}) {
  const legal = state.payload.legalActions;
  const view = state.payload.view;
  const bar = $("#actions");
  bar.replaceChildren();
  // A tile you are studying stays up through a prompt that asks for no throw (a claim window).
  clearSelection(!legal.some((action) => action.type === "Discard" || action.type === "GoulashExchange"));
  void refreshHints(true);
  if (chime) alertFor(legal);

  if (legal.some((action) => action.type === "GoulashExchange")) {
    resetGoulash();
    refreshGoulash();
    const confirm = button("Pass 3 tiles", "claim", () => {
      const keys = goulashKeys().sort();
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
  const claims = state.callsOff ? [] : legal.filter((action) => action.type === "Claim" && action.kind !== "mahjong");
  const mahjongClaim = legal.find((action) => action.type === "Claim" && action.kind === "mahjong");
  const kongs = state.callsOff ? [] : legal.filter((action) => action.type === "ConcealedKong" || action.type === "AddedKong");
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

/** `?seed=` pins the first game's seed (tests and bug reports); the next new game is random again. */
let pinnedSeed = new URLSearchParams(window.location.search).get("seed");

async function newGame() {
  if (state.busy) return;
  state.busy = true;
  $("#result").hidden = true;
  $("#result").dataset.hand = "";
  hideChoices();
  try {
    const seed = pinnedSeed ?? `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    pinnedSeed = null;
    await apply(await request("/api/new", { seed, houseRules: houseRules() }), { animated: false, opening: true });
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
  }
  void run();
}

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
  state.api = createLocalApi(storage());
  // Build the index of all hands once the table is up, so "All hands" opens at once.
  setTimeout(() => ("requestIdleCallback" in window ? window.requestIdleCallback(warmIndex) : setTimeout(warmIndex, 0)), 1000);
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
  const resumed = state.api.resume();
  if (resumed !== null) {
    await apply(resumed, { animated: false });
    if (resumed.restartedHand) toast("The game was updated, so this hand starts again. Your scores are kept.");
    void run();
    return;
  }
  await newGame();
}

// A handle for automated play-throughs and debugging: the current answer and
// a way to take one of the offered actions.
window.mahjong = {
  state: () => state.payload,
  busy: () => state.busy,
  lifted: () => board.lifted?.key ?? null,
  act: (action) => act(action),
  next: () => $("#result .result-next")?.click(),
  sound,
};

installInput({ act });
installResult({ callOut, apply, run, hideChoices, newGame });
installMenu({ run, newGame });
installOptions();

void boot();
