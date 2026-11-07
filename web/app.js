/**
 * The web table. Plain ES module, no framework and no build step.
 *
 * The client never computes a legal move or a pattern: it renders the
 * payload from the server (`viewFor` plus `check.ts`) and sends one action
 * from `legalActions` back. If a response carries `{ error }`, nothing was
 * changed and the last payload stays on screen.
 */

import {
  artUrl,
  BACK_ART_URL,
  BONUS_NAMES,
  BONUS_TILE_KEYS,
  PLAY_TILE_KEYS,
} from "./tiles.js";
import {
  computeLayout,
  discardCells,
  nextFreeCell,
  wallCells,
} from "./layout.js";

const SEATS = ["E", "S", "W", "N"];
const WIND_NAME = { E: "East", S: "South", W: "West", N: "North" };
const SUIT_NAME = { b: "bamboo", c: "characters", o: "circles" };
const DRAGON_NAME = { R: "Red", G: "Green", W: "White" };

/** Seat id -> screen place. East sits at the bottom, then anticlockwise. */
const PLACE = {
  E: "bottom",
  S: "right",
  W: "top",
  N: "left",
};

const RAIL_KEY = "mahjong-rail";
/** Whether the table offers you pung, kong and chow at all (2026-11-07). */
const CALLS_KEY = "mahjong-calls";
/** How long the called tile is left on the heap before the table passes for you. */
const CALLS_OFF_PASS_MS = 420;
const GAME_KEY = "mahjong-game";
const MUTE_KEY = "mahjong-mute";

let payload = null;
let currentLayout = null;
let pendingClick = null;
let busy = false;
let railOpen = true;
let referenceShown = false;
let referenceMissing = false;
/** `?state=<name>`: a fixed review board, never written back as the open game. */
let scenarioName = null;

let handInitialized = false;
let tableInitialized = false;
let previousHand = [];
let previousDiscards = { E: 0, S: 0, W: 0, N: 0 };
/** Concealed counts of the last render, so a draw can be told from a throw. */
let previousConcealed = { E: 0, S: 0, W: 0, N: 0 };
let announced = "";
let focusedOutcomeKey = null;
let scoresKey = null;
let sessionScores = { E: 0, S: 0, W: 0, N: 0 };
let appliedOutcome = null;

let callsEnabled = true;
let autoPassKey = null;
let muted = false;
let audioContext = null;
let lastClaimCueKey = null;

const logLines = [];

const $ = (selector) => document.querySelector(selector);

/* ------------------------------------------------------------- claim cue */

/** `m` is the only sound control; reduced-motion users start muted. */
function readMuted() {
  try {
    const stored = localStorage.getItem(MUTE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Private windows can refuse storage; the default still applies.
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function persistMuted() {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // The toggle still works for this visit.
  }
}

/** Calls are a house option, not a rule: off means the table passes for you. */
function readCalls() {
  try {
    return localStorage.getItem(CALLS_KEY) !== "0";
  } catch {
    return true;
  }
}

function persistCalls() {
  try {
    localStorage.setItem(CALLS_KEY, callsEnabled ? "1" : "0");
  } catch {
    // The toggle still works for this visit.
  }
}

/** The chip in the action row: the only control the bare table keeps. */
function callsToggle() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "calls-toggle";
  button.className = "calls-toggle";
  button.setAttribute("aria-pressed", String(callsEnabled));
  button.textContent = callsEnabled ? "Calls on" : "Calls off";
  button.title = callsEnabled
    ? "Pung, kong and chow are offered when a discard can be claimed"
    : "You never claim: the table passes for you. A winning tile still asks.";
  button.addEventListener("click", () => {
    callsEnabled = !callsEnabled;
    autoPassKey = null;
    persistCalls();
    log(callsEnabled ? "Calls on." : "Calls off: the table passes for you.");
    render();
  });
  return button;
}

/** Calls are off and the table asked anyway: answer Pass without a prompt. */
function passClaimForPlayer() {
  const view = payload?.view;
  const window = view?.claimWindow ?? null;
  if (window === null) return;
  const key =
    `${payload.game}|${view.handNumber}|${window.discarder}|` +
    `${window.tile}|${window.pending.join(",")}`;
  if (autoPassKey === key) return;
  const pass = payload.legalActions.find((action) => action.type === "Pass");
  if (pass === undefined) return;
  autoPassKey = key;
  sendAction(pass, CALLS_OFF_PASS_MS);
}

function toggleMute() {
  muted = !muted;
  persistMuted();
  log(muted ? "Claim cue muted." : "Claim cue on.");
}

/** Audio starts on the first gesture, as browser autoplay rules require. */
function unlockAudio(event) {
  if (audioContext === null) {
    const Constructor = window.AudioContext ?? window.webkitAudioContext;
    if (Constructor === undefined) return;
    audioContext = new Constructor();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume().then(maybePlayClaimCue, () => {});
    return;
  }
  maybePlayClaimCue();
}

/** One soft two-note tick, 170 ms at low gain, synthesised in the page. */
function playClaimCue(context) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  gain.connect(context.destination);

  const low = context.createOscillator();
  low.type = "sine";
  low.frequency.setValueAtTime(659.25, now);
  low.connect(gain);
  low.start(now);
  low.stop(now + 0.075);

  const high = context.createOscillator();
  high.type = "sine";
  high.frequency.setValueAtTime(987.77, now + 0.055);
  high.connect(gain);
  high.start(now + 0.055);
  high.stop(now + 0.17);
}

/** Once per claim window, and never before the first user gesture. */
function maybePlayClaimCue() {
  const view = payload?.view;
  if (view === undefined || view === null || view.claimWindow === null) return;
  // The cue belongs to the button, not to the state: if the bar is still held
  // for a throw in flight, there is nothing to hear yet.
  const bar = $("#claim-bar");
  if (bar === null || bar.hidden || bar.childElementCount === 0) return;
  const claimWindow = view.claimWindow;
  const key =
    `${payload.game}|${view.handNumber}|${claimWindow.discarder}|` +
    `${claimWindow.tile}|${claimWindow.pending.join(",")}`;
  if (key === lastClaimCueKey) return;
  if (muted || audioContext === null || audioContext.state !== "running") return;
  lastClaimCueKey = key;
  playClaimCue(audioContext);
}

/**
 * A CPU call has its own voice: two low wooden knocks over a short body note,
 * unmistakably not the single tile landing and not the claim offer.
 */
function playMeldCue(context) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  gain.connect(context.destination);

  for (const [offset, frequency] of [
    [0, 220],
    [0.085, 293.66],
  ]) {
    const knock = context.createOscillator();
    knock.type = "triangle";
    knock.frequency.setValueAtTime(frequency, now + offset);
    knock.connect(gain);
    knock.start(now + offset);
    knock.stop(now + offset + 0.12);
  }

  const body = context.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(146.83, now + 0.02);
  body.connect(gain);
  body.start(now + 0.02);
  body.stop(now + 0.27);
}

/** One cue per payload, never before the first gesture, silent when muted. */
/**
 * One call, one word, one beat. A pung, kong, chow, fishing declaration or a
 * win is spoken in the middle of the table for CALL_MS, and nothing else moves
 * until it has been read: the throw that answered it, the meld and the word
 * are then one moment in the player's head.
 */
const CALL_MS = 720;
let callHeld = false;
let callTimer = null;

/** The word a call speaks, taken from the event log's own wording. */
function callWord(line) {
  const claim = /^\w claims (pung|kong|chow|mahjong)\b/.exec(line);
  if (claim !== null) return claim[1].toUpperCase();
  if (/ announces fishing\b/.test(line)) return "FISHING";
  if (/ wins\b/.test(line) || /goes Mah Jong/.test(line)) return "MAHJONG";
  return null;
}

function announceCalls(lines) {
  // A review state or a resumed game arrives with the whole log: those calls
  // are history, and nothing happened just now.
  if (payload === null || eventsAreHistory || !Array.isArray(lines)) return;
  for (const line of lines) {
    const word = callWord(line);
    if (word === null) continue;
    const match = /^([ESWN]) /.exec(line);
    const seat = match === null ? null : match[1];
    if (seat !== null && seat !== payload.seat) {
      lightCall(seat);
      if (!muted && audioContext !== null && audioContext.state === "running") {
        playMeldCue(audioContext);
      }
    }
    showCall(word, seat);
    return;
  }
}

function showCall(word, seat) {
  const element = $("#call-out");
  if (element === null) return;
  const label = element.querySelector("span");
  if (label !== null) label.textContent = word;
  // The word stands in front of the wall that made the call.
  element.dataset.seat = seat === null || seat === undefined ? "bottom" : PLACE[seat];
  element.hidden = false;
  callHeld = true;
  if (callTimer !== null) clearTimeout(callTimer);
  callTimer = window.setTimeout(() => {
    callTimer = null;
    element.hidden = true;
    callHeld = false;
    autoDraw();
    stepTable();
  }, CALL_MS);
}
/** Lights the calling seat for a beat, restarting the animation each call. */
const CALL_FLASH_MS = 950;
let callSeat = null;
let callUntil = 0;

/**
 * The call lights its seat for a beat. The seats are redrawn on every payload,
 * so the light is state, not a class a later redraw would wipe.
 */
function lightCall(seat) {
  callSeat = seat;
  callUntil = performance.now() + CALL_FLASH_MS;
  renderSeats();
  window.setTimeout(() => {
    if (performance.now() < callUntil) return;
    callSeat = null;
    renderSeats();
  }, CALL_FLASH_MS + 20);
}

/* ------------------------------------------------------------ elements */

function div(className = "") {
  const element = document.createElement("div");
  if (className) element.className = className;
  return element;
}

function span(className = "", text = "") {
  const element = document.createElement("span");
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function tileName(key) {
  const suited = /^([bco])([1-9])$/.exec(key);
  if (suited !== null) return `${suited[2]} ${SUIT_NAME[suited[1]]}`;
  if (/^w[ESWN]$/.test(key)) return `${WIND_NAME[key[1]]} wind`;
  if (/^d[RGW]$/.test(key)) return `${DRAGON_NAME[key[1]]} dragon`;
  if (Object.hasOwn(BONUS_NAMES, key)) return BONUS_NAMES[key];
  return key;
}

function tileElement(key) {
  const element = document.createElement("span");
  element.className = "tile";
  element.dataset.key = key;
  element.title = tileName(key);
  element.setAttribute("aria-label", tileName(key));

  const url = artUrl(key);
  if (url === null) {
    element.classList.add("tile-missing");
    element.textContent = "?";
    return element;
  }

  const image = document.createElement("img");
  image.src = url;
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  element.append(image);
  return element;
}

function backElement() {
  const element = document.createElement("span");
  element.className = "tile-back";
  const image = document.createElement("img");
  image.src = BACK_ART_URL;
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  element.append(image);
  return element;
}

/** The hand in reading order: the thirteen, then the tile just drawn. */
function displayHand() {
  if (payload === null) return [];
  const hand = payload.view.player.hand;
  const draw = payload.view.lastDraw;
  if (draw === null || draw.seat !== payload.view.seat) return [...hand];
  const index = hand.lastIndexOf(draw.tile);
  if (index < 0) return [...hand];
  return [...hand.slice(0, index), ...hand.slice(index + 1), hand[index]];
}

/* ------------------------------------------------------------ transport */

async function api(path, body) {
  const options =
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        };
  const response = await fetch(path, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data && data.error ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

function log(line) {
  if (!line) return;
  logLines.push(line);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  const element = $("#log");
  if (element === null) return;
  element.textContent = logLines.join("\n");
  element.scrollTop = element.scrollHeight;
}

/**
 * The seat whose rack grew by one in this payload: that is a draw, and the only
 * moment a fourteenth back exists on the table.
 */
function drewBack(data) {
  for (const entry of data.table) {
    if (entry.seat === data.seat) continue;
    if ((previousConcealed[entry.seat] ?? 0) + 1 === entry.handCount) return entry.seat;
  }
  return null;
}

function applyResponse(data, note, replaceLog = false) {
  const wallBefore = payload?.wall?.remaining;
  payload = data;
  if (typeof data.game === "string" && scenarioName === null) {
    sessionStorage.setItem(GAME_KEY, data.game);
  }
  loadScores(data.game, data.seed);
  settleScores();
  if (replaceLog || data.replaceLog === true) logLines.length = 0;
  if (note) log(note);
  const justDiscarded =
    !eventsAreHistory &&
    !replaceLog &&
    data.replaceLog !== true &&
    Array.isArray(data.events) &&
    data.events.some((line) => line.startsWith(`${data.seat} discards `));
  if (Array.isArray(data.events)) {
    for (const line of data.events) log(line);
    pendingDiscards = discardsFromEvents(data.events);
    announceCalls(data.events);
  }
  // Read the racks before the render moves them: a seat that gained a back has
  // just drawn, and that draw gets its own beat.
  const drew = drewBack(data);
  render();
  if (
    wallBefore !== undefined &&
    data.wall !== undefined &&
    data.wall.remaining < wallBefore
  ) {
    nudgeWallHead();
  }
  if (drew !== null) wallGhost(drew);
  // Your own throw lands immediately. Give it the same settle as an opponent's
  // throw before asking the table to answer it, so a claim never appears on
  // the click's frame. A bot that has just drawn holds the tile for a beat
  // before it throws, so the table never flicks a back in and out.
  const nextStepDelay = justDiscarded
    ? DISCARD_SETTLE_MS
    : drew
      ? DRAW_BEAT_MS
      : 0;
  setTimeout(() => {
    autoDraw();
    stepTable();
  }, nextStepDelay);
  if (pendingClick !== null) {
    const index = pendingClick;
    pendingClick = null;
    setTimeout(() => onHandClick(index), 0);
  }
}

async function request(path, body, note, replaceLog = false) {
  if (busy) return null;
  busy = true;
  try {
    const data = await api(path, body);
    applyResponse(data, typeof note === "function" ? note(data) : note, replaceLog);
    return data;
  } catch (error) {
    log(`Error: ${error.message}`);
    return null;
  } finally {
    busy = false;
  }
}

function sendAction(action, delay = 0) {
  if (action === null || payload === null || busy) return;
  const note = action.type === "Pass" ? "You pass." : null;
  if (delay > 0) {
    busy = true;
    const game = payload.game;
    setTimeout(async () => {
      try {
        const data = await api("/api/move", { game, action });
        applyResponse(data, note);
      } catch (error) {
        log(`Error: ${error.message}`);
        for (const button of document.querySelectorAll(".hand-tile.is-leaving")) {
          button.classList.remove("is-leaving");
        }
      } finally {
        busy = false;
      }
    }, delay);
    return;
  }
  void request("/api/move", { game: payload.game, action }, note);
}

/**
 * Drawing is not a decision: a mahjong table hands you the tile. Whenever the
 * only thing between you and a discard is the draw, take it for the player.
 */
function autoDraw() {
  if (payload === null || busy || payload.outcome !== null) return;
  // The table is still answering: the draw is taken once its last throw has
  // landed and settled, never while a tile is still in the air.
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld || callHeld) return;
  const draw = payload.legalActions.find((action) => action.type === "Draw");
  if (draw === undefined) return;
  sendAction(draw);
}

function sendDiscard(tile, index) {
  if (payload === null || busy) return false;
  const action = payload.legalActions.find(
    (candidate) => candidate.type === "Discard" && candidate.tile === tile,
  );
  if (action === undefined) return false;
  const button = document.querySelector(`#hand .hand-tile[data-index="${index}"]`);
  // Instant: the tile leaves the hand the moment it is thrown, no confirmation
  // and no animation hold.
  if (button instanceof HTMLElement) button.classList.add("is-leaving");
  sendAction(action);
  return true;
}

/* -------------------------------------------------------------- helpers */

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function changeClass(value) {
  return value > 0 ? "is-up" : value < 0 ? "is-down" : "";
}

/** The book's tier names, printed as they are. `calculate` has no figure. */
const TIER_NAME = {
  half: "half limit",
  limit: "limit",
  middle: "middle limit",
  double: "double limit",
  calculate: "calculated hand",
};

function tierName(tier) {
  return tier === null || tier === undefined ? null : (TIER_NAME[tier] ?? tier);
}


function totalsSum(totals) {
  let sum = 0;
  for (const seat of SEATS) sum += totals[seat] ?? 0;
  return sum;
}

function randomSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `web-${Date.now()}`;
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

function zeroScores() {
  return { E: 0, S: 0, W: 0, N: 0 };
}

function loadScores(game, seed) {
  const key = `mahjong-scores:${game}:${seed}`;
  if (key === scoresKey) return;
  scoresKey = key;
  sessionScores = zeroScores();
  appliedOutcome = null;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return;
    const stored = JSON.parse(raw);
    if (stored && typeof stored === "object" && stored.scores) {
      for (const seat of SEATS) {
        const value = Number(stored.scores[seat]);
        if (Number.isFinite(value)) sessionScores[seat] = value;
      }
    }
    if (stored && stored.applied && typeof stored.applied === "object") {
      appliedOutcome = stored.applied;
    }
  } catch {
    // A corrupt or unavailable store starts the scorecard at zero.
  }
}

function persistScores() {
  if (scoresKey === null) return;
  try {
    sessionStorage.setItem(
      scoresKey,
      JSON.stringify({ scores: sessionScores, applied: appliedOutcome }),
    );
  } catch {
    // Storage can be unavailable; the scorecard still works for this render.
  }
}

function settleScores() {
  const outcome = payload.outcome;
  if (outcome === null) return;
  const handKey = `${payload.game}:${payload.view.handNumber}`;
  if (appliedOutcome !== null && appliedOutcome.key === handKey) return;

  const before = { ...sessionScores };
  for (const seat of SEATS) {
    sessionScores[seat] += outcome.totals[seat] ?? 0;
  }
  appliedOutcome = {
    key: handKey,
    game: payload.game,
    handNumber: payload.view.handNumber,
    before,
    totals: { ...outcome.totals },
    after: { ...sessionScores },
  };
  persistScores();
}

function displayTotals() {
  const totals = { ...sessionScores };
  if (payload.view.phase !== "finished") {
    const current = ledgerTotals(payload.view.ledger);
    for (const seat of SEATS) totals[seat] += current[seat];
  }
  return totals;
}

function revertScores() {
  if (payload === null || appliedOutcome === null) return;
  if (appliedOutcome.game !== payload.game) return;
  if (appliedOutcome.handNumber !== payload.view.handNumber) return;
  for (const seat of SEATS) {
    sessionScores[seat] -= appliedOutcome.totals[seat] ?? 0;
  }
  appliedOutcome = null;
  persistScores();
}

function seatEntry(seat) {
  return payload.table.find((entry) => entry.seat === seat) ?? null;
}

function seatLabel(seat) {
  if (seat === payload.seat) return "You";
  const entry = seatEntry(seat);
  return entry === null ? `${seat} seat` : `${WIND_NAME[entry.wind]} bot`;
}

/** "You" starts a row; inside a sentence the table reads "you". */
function seatInSentence(seat) {
  return seat === payload.seat ? "you" : seatLabel(seat);
}

function seatColor(seat) {
  return `var(--seat-${seat.toLowerCase()})`;
}

function seatIsTurn(seat) {
  return payload.view.phase !== "finished" && payload.view.turn === seat;
}

function legalAction(type, predicate = () => true) {
  return payload.legalActions.find(
    (action) => action.type === type && predicate(action),
  );
}

function isYourDiscardPhase() {
  return (
    payload.view.turn === payload.view.seat &&
    payload.view.phase === "discard" &&
    payload.legalActions.some((action) => action.type === "Discard")
  );
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function actionRank(action) {
  if (action.type === "Win") return 0;
  if (action.type === "Claim" && action.kind === "mahjong") return 0;
  if (action.type === "Draw") return 10;
  if (action.type === "Discard") return 15;
  if (action.type === "Claim" && action.kind === "pung") return 20;
  if (action.type === "Claim" && action.kind === "kong") return 21;
  if (action.type === "ConcealedKong" || action.type === "AddedKong") return 25;
  if (action.type === "Claim" && action.kind === "chow") return 30;
  if (action.type === "DeclareFishing") return 35;
  return 40;
}

function actionKey(action) {
  if (action.type === "Claim") {
    return `${action.type}|${action.kind}|${action.tiles.join(" ")}`;
  }
  return action.type;
}

function orderedActions(actions) {
  const seen = new Set();
  const unique = [];
  for (const action of actions) {
    // Draw and Discard are gestures on the hand, not buttons: the table draws
    // for you and a click (or Enter) throws.
    if (action.type === "Discard" || action.type === "Draw") continue;
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
  }
  if (unique.some((action) => action.type === "Win")) {
    return unique.filter(
      (action) => !(action.type === "Claim" && action.kind === "mahjong"),
    ).sort((a, b) => actionRank(a) - actionRank(b));
  }
  return unique.sort((a, b) => actionRank(a) - actionRank(b));
}

function actionLabel(action) {
  switch (action.type) {
    case "Draw":
      return "Draw";
    case "Claim":
      if (action.kind === "mahjong") return "Mahjong";
      return `${action.kind[0].toUpperCase()}${action.kind.slice(1)} ${action.tiles.join(" ")}`;
    case "DeclareFishing":
      return "Declare fishing";
    case "ConcealedKong":
      return `Kong ${action.tile}`;
    case "AddedKong":
      return `Add kong ${action.tile}`;
    case "Win":
      return "Mahjong";
    case "Pass":
      return "Pass";
    default:
      return action.type;
  }
}

function actionKeycap(action) {
  switch (action.type) {
    case "Draw":
      return "d";
    case "Win":
    case "Claim":
      return "enter";
    case "DeclareFishing":
      return "f";
    case "Pass":
      return "space";
    default:
      return "";
  }
}

/* -------------------------------------------------------------- rendering */

function renderMeta() {
  const view = payload.view;
  const meta = $("#meta");
  meta.textContent = `Hand ${view.handNumber} · ${view.prevailingWind} round`;
  meta.title = `Seed ${payload.seed} · game ${payload.game} · dealer ${view.dealer}`;
}

/** Tenhou's seat is only a wind and a name, set straight into the felt. */
function rackLine(entry) {
  const line = div("rack-line");
  const rack = div("rack");
  if (PLACE[entry.seat] === "left" || PLACE[entry.seat] === "right") {
    rack.classList.add("side");
  }
  // The one back that grows the rack is a draw: it slides in, and the table
  // holds it for a beat before the throw takes it away again.
  const known = previousConcealed[entry.seat];
  const drew =
    known !== undefined && known > 0 && entry.handCount === known + 1;
  rack.setAttribute("aria-label", `${entry.handCount} concealed tiles`);
  for (let index = 0; index < entry.handCount; index++) {
    const back = backElement();
    if (drew && index === entry.handCount - 1) back.classList.add("is-drawn");
    rack.append(back);
  }
  line.append(rack);
  return line;
}

/**
 * Fishing is a public state, so it gets a word next to the hand that declared
 * it: a small, still chip on the inboard side of that seat's band (2026-11-07,
 * after a pulse that was too slow to see and a badge that sat on the tiles).
 */
function fishingChip(entry) {
  const fishing = payload?.view.fishing.find((row) => row.seat === entry.seat);
  if (fishing === undefined) return null;
  const chip = div("fishing-chip");
  chip.textContent = "Fishing";
  const words = `Fishing on ${fishing.wait.map(tileName).join(", ")}, ${
    tierName(fishing.tier) ?? fishing.tier
  }`;
  chip.title = words;
  chip.setAttribute("aria-label", words);
  return chip;
}

function meldRow(melds) {
  if (melds.length === 0) return null;
  const row = div("meld-row");
  for (const meld of melds) {
    const group = div("meld");
    if (!meld.exposed) group.classList.add("is-concealed");
    group.title = `${meld.kind}${meld.exposed ? "" : " (concealed)"}`;
    group.setAttribute("aria-label", `${meld.kind} ${meld.tiles.join(" ")}`);
    for (const key of meld.tiles) group.append(tileElement(key));
    row.append(group);
  }
  return row;
}

function bonusRow(entry) {
  const bonuses = [...entry.flowers, ...entry.seasons];
  if (bonuses.length === 0) return null;
  const row = div("bonus-row");
  row.setAttribute("aria-label", "bonus tiles");
  for (const key of bonuses) row.append(tileElement(key));
  return row;
}

/* The screen footprint of each river. A discard is at row r, column c in
   its own player's reading order; this maps that to the screen cell, so
   every player reads their own river left to right, top to bottom. The
   first row sits flush against the centre panel and later rows grow back
   toward the seat, which is how Tenhou fills the four blocks. Legacy tables
   keep a fixed 6x3 block; variant D uses the capacity from computeLayout. */
const LEGACY_RIVER_GRID = {
  bottom: { cols: 6, rows: 3, flat: true, cell: (r, c) => [c, r] },
  top: { cols: 6, rows: 3, flat: true, cell: (r, c) => [5 - c, 2 - r] },
  left: { cols: 3, rows: 6, flat: false, cell: (r, c) => [2 - r, c] },
  right: { cols: 3, rows: 6, flat: false, cell: (r, c) => [r, 5 - c] },
};

function renderSeat(entry) {
  const place = PLACE[entry.seat];
  if (place === "bottom") return;

  const root = $(`#seat-${place}`);
  root.className = `seat seat-${place}${seatIsTurn(entry.seat) ? " is-turn" : ""}`;
  root.dataset.wind = entry.wind;
  root.dataset.count = String(entry.handCount);
  root.style.setProperty("--seat-color", seatColor(entry.seat));
  // A call stays lit across the redraws the payload causes.
  if (callSeat === entry.seat && performance.now() < callUntil) {
    root.classList.add("is-calling");
  }
  root.replaceChildren();

  const rack = rackLine(entry);
  const melds = meldRow(entry.melds);
  const fishing = fishingChip(entry);
  if (fishing !== null) {
    root.classList.add("is-fishing");
    root.setAttribute("aria-label", fishing.getAttribute("aria-label") ?? "Fishing");
    root.append(fishing);
  }
  const bonuses = bonusRow(entry);

  if (place === "top") {
    // The north seat lays its melds and bonuses along the top band beside
    // the rack, never over the play area.
    if (melds !== null) root.append(melds);
    root.append(rack);
    if (bonuses !== null) root.append(bonuses);
    return;
  }

  // The side racks hug the edge; their melds sit inboard of the rack.
  root.append(rack);
  if (melds !== null) root.append(melds);
}

/* --------------------------------------------------- discard rhythm */

/**
 * The opponents answer in one payload, but a table answers one seat at a time.
 * Every fresh discard waits in a queue and is dropped in turn - sound, tile and
 * the ghost of the tile leaving the wall - so the round reads as a sequence:
 * who threw, in what order, and when it comes back to you.
 */
/**
 * The table answers one seat at a time. The beat never changes: a claim does
 * not hurry the throws before it, it only waits for them.
 */
const DISCARD_BEAT_MS = 1000;
/**
 * A throw is not over the instant it lands: the ghost is still flying and the
 * frame is still glowing. The table waits this long before it plays its next
 * decision, so the tile you draw is never in your hand before the throw to
 * your left has finished. The next landing still comes a beat after the last
 * one - this pause is taken out of that beat, not added to it.
 */
const DISCARD_SETTLE_MS = 520;
/** However late the step is, a new throw still gets this much air. */
const MIN_BEAT_MS = 180;
/**
 * A bot's draw is its own beat: the fourteenth back slides in, rests long
 * enough to see, and only then leaves as the throw. Without it the table
 * rendered the draw and asked for the discard in the same breath, so the back
 * appeared and vanished in ~40 ms and the rack twitched.
 */
const DRAW_BEAT_MS = 340;
/**
 * A claim is only offered once the throw it answers has *finished*: the ghost
 * has landed, the frame has faded and the table's settle has passed. The extra
 * beat after that is the read time before the bar appears.
 */
const CLAIM_SHOW_MS = DISCARD_SETTLE_MS + 80;
/** Ghosts and give are decoration; reduced motion gets state changes only. */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
let discardQueue = [];
let pendingDiscards = [];
let discardTimer = null;
/** When the last throw finished landing, for the landing-to-landing beat. */
let lastLandingAt = 0;
/** A claim whose discard is still in flight: the offer is not asked yet. */
let claimHeld = false;
let claimTimer = null;
/** A review state arrives with the whole hand's log, not fresh throws. */
let eventsAreHistory = false;
/** Discards the viewer has already seen land, per seat. */
/** A throw's identity never repeats: a claimed tile stays claimed. */
let discardSeq = 0;

function nextDiscardId(seat, key) {
  discardSeq += 1;
  return `${seat}:${key}:${discardSeq}`;
}
let rhythmReady = false;
let freshDeal = false;

/** Keeps the seen-counts honest when the table loses tiles (undo, claim). */
function syncRevealed() {
  const all = [];
  for (const seat of SEATS) {
    const discards = seatEntry(seat)?.discards ?? [];
    discards.forEach((key, index) => {
      all.push({ seat, key, id: nextDiscardId(seat, key) });
    });
  }
  if (!rhythmReady || freshDeal) {
    // A fresh hand starts empty, so its first discards play on the beat.
    pileKeys = freshDeal ? [] : all.slice();
    pileItems = [];
    pileCells = [];
    pileOccupied = new Set();
    for (const item of pileKeys) addToPile(item);
    freshDeal = false;
    rhythmReady = true;
    return;
  }
  // A claim lifts its discard, but every other tile stays exactly where it
  // landed. Keep a per-seat/per-key multiset; when duplicates exist the newest
  // matching occurrence is the one a claim can have taken.
  const remaining = new Map();
  for (const item of all) {
    const key = `${item.seat}:${item.key}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const keep = new Set();
  for (const item of pileKeys) {
    const key = `${item.seat}:${item.key}`;
    const count = remaining.get(key) ?? 0;
    if (count <= 0) continue;
    keep.add(item.id);
    remaining.set(key, count - 1);
  }
  if (keep.size !== pileKeys.length) {
    pileKeys = pileKeys.filter((item) => keep.has(item.id));
    pileItems = pileItems.filter((item) => keep.has(item.id));
    // The claimed tile leaves its cell free; the next throw fills it.
    pileOccupied = new Set(pileItems.map((item) => item.cell));
  }
}

/** Seat order after the human's, which is the order the table answers in. */
function turnOrderAfter(seat) {
  const start = SEATS.indexOf(seat);
  return [...SEATS.slice(start + 1), ...SEATS.slice(0, start + 1)];
}

/** The event log names who threw what, in the order it happened. */
function discardsFromEvents(lines) {
  const out = [];
  for (const line of lines) {
    const match = /^([ESWN]) discards (\S+)/.exec(line);
    if (match === null) continue;
    // The log prints the seat id (E/S/W/N), never the wind, which rotates.
    const entry = payload?.table.find((row) => row.seat === match[1]);
    if (entry === undefined) continue;
    out.push({ seat: entry.seat, key: match[2] });
  }
  return out;
}

function planDiscards() {
  if (payload === null) return;
  if (eventsAreHistory) {
    // A review state is a snapshot of a hand already played: every line in its
    // log is already on the table, so none of them is a throw to play now.
    eventsAreHistory = false;
    pendingDiscards = [];
  }
  // Queue whatever this answer threw, in the order the events name them.
  for (const item of pendingDiscards) {
    // Two players may throw the same tile, so a throw is identified by seat and
    // how many that seat has already thrown - never by the tile alone.
    item.id = nextDiscardId(item.seat, item.key);
    if (discardQueue.some((queued) => queued.id === item.id)) continue;
    if (item.seat === payload.seat) {
      // Your own throw lands at once; the table answers on the beat.
      revealDiscard(item);
      continue;
    }
    discardQueue.push(item);
  }
  pendingDiscards = [];
  if (claimAsked()) {
    // Nothing is in flight: the offer is about the tile already on the heap.
    if (discardQueue.length === 0 && discardTimer === null) {
      if (!claimHeld) renderActions();
      return;
    }
    // A claim is about the last tile on the heap, so every throw before it has
    // to land first - one at a time, on the same beat as any other throw. The
    // bar drawn earlier in this render comes straight back down, so the offer
    // never names a tile that is still in flight.
    claimHeld = true;
    renderActions();
    if (claimTimer !== null) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    scheduleDiscard();
    return;
  }
  if (claimHeld) {
    // The offer is gone (undone, or the table moved on): the row was drawn as
    // "still answering", so draw it again for the state that replaced it.
    claimHeld = false;
    if (claimTimer !== null) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    renderActions();
  }
  if (discardQueue.length > 0 && discardTimer === null) scheduleDiscard();
}


function scheduleDiscard() {
  // Keep throws a beat apart: whatever the settle already spent comes out of
  // this wait rather than slowing the table down.
  const spent = lastLandingAt === 0 ? 0 : performance.now() - lastLandingAt;
  const beat = Math.max(MIN_BEAT_MS, DISCARD_BEAT_MS - spent);
  discardTimer = setTimeout(() => {
    discardTimer = null;
    revealDiscard();
    if (discardQueue.length > 0) {
      scheduleDiscard();
      return;
    }
    if (claimHeld) {
      showClaim();
      return;
    }
    // The tile is down, but the throw is not finished: wait for the ghost to
    // land and the frame to fade before the table answers, so a drawn tile can
    // never appear while the seat to your left is still discarding.
    setTimeout(() => {
      autoDraw();
      stepTable();
    }, DISCARD_SETTLE_MS);
  }, beat);
}

/**
 * Ask the table for one decision. The bots are not run ahead of the screen:
 * the browser steps them only when the viewer has nothing to do and no tile is
 * still in flight, so a payload never carries a round the player has not seen.
 */
let stepStalled = false;
async function stepTable() {
  if (payload === null || busy || payload.outcome !== null) return;
  if (payload.legalActions.length > 0) {
    stepStalled = false;
    return;
  }
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld || callHeld) return;
  if (stepStalled) return;
  const game = payload.game;
  busy = true;
  try {
    const data = await api("/api/step", { game });
    if (data !== null && data.view) {
      stepStalled = false;
      applyResponse(data, null);
      return;
    }
    // "done" means the table is waiting on a decision we did not know we had:
    // take a fresh state before deciding anything else.
    const fresh = await api(`/api/state?game=${encodeURIComponent(game)}`);
    if (fresh === null || fresh.view === undefined) {
      stepStalled = true;
      return;
    }
    stepStalled = fresh.legalActions.length === 0;
    applyResponse(fresh, null);
  } catch (error) {
    stepStalled = true;
    log(`Error: ${error.message}`);
  } finally {
    busy = false;
  }
}

/**
 * The heap is up to date: let the claimed tile sit for a moment, then ask.
 * Until the bar appears nothing on the table can be acted on, so the answer
 * always belongs to the tile that is actually on the heap.
 */
function showClaim() {
  if (claimTimer !== null) return;
  claimTimer = setTimeout(() => {
    claimTimer = null;
    claimHeld = false;
    renderActions();
  }, CLAIM_SHOW_MS);
}

function revealDiscard(item) {
  const next = item ?? discardQueue.shift();
  if (next === undefined) return;
  lastLandingAt = performance.now();
  if (next.id !== undefined && pileKeys.some((placed) => placed.id === next.id)) return;
  pileKeys.push(next);
  addToPile(next);
  renderPile();
  const tile = $("#pile .discard:last-child");
  if (tile !== null) {
    tile.classList.add("is-new");
    window.setTimeout(() => tile.classList.remove("is-new"), 260);
    throwGhost(next.seat, tile);
  }
  // The tile is in the heap now, so the sound belongs to this instant.
  playTileClack();
}

/** A drawn tile is one motion: it leaves the wall's head and lands in the rack. */
function wallGhost(seat) {
  if (REDUCED_MOTION.matches) return;
  const head = document.querySelector("#wall .wall-back.is-head");
  const rack = document.querySelector(`#seat-${PLACE[seat]} .rack`);
  if (head === null || rack === null) return;
  const from = head.getBoundingClientRect();
  const to = rack.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;
  const ghost = div("wall-ghost");
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  document.body.append(ghost);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${
      to.top + to.height / 2 - (from.top + from.height / 2)
    }px) scale(0.7)`;
    ghost.style.opacity = "0";
  });
  window.setTimeout(() => ghost.remove(), 300);
}

/** The tile leaves the wall: a back flies from the seat's rack to the river. *//** The tile leaves the wall: a back flies from the seat's rack to the river. */
function throwGhost(seat, tile) {
  if (REDUCED_MOTION.matches) return;
  // Your own throw leaves the hand; an opponent's leaves that seat's wall.
  const source =
    seat === payload?.seat
      ? document.querySelector("#hand")
      : document.querySelector(`#seat-${PLACE[seat]} .rack`);
  if (source === null) return;
  const from = source.getBoundingClientRect();
  const to = tile.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;
  const ghost = div("throw-ghost");
  ghost.style.left = `${from.left + from.width / 2}px`;
  ghost.style.top = `${from.top + from.height / 2}px`;
  ghost.style.width = `${Math.min(18, from.width)}px`;
  ghost.style.height = `${Math.min(24, from.height)}px`;
  document.body.append(ghost);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${
      to.top + to.height / 2 - (from.top + from.height / 2)
    }px) scale(0.9)`;
    ghost.style.opacity = "0";
  });
  window.setTimeout(() => ghost.remove(), 320);
}


/**
 * A tile settling on felt: wooden body, cloth cushion. Short, low, no ring -
 * nothing metallic.
 */
function playTileClack() {
  if (audioContext === null) return;
  const now = audioContext.currentTime;
  const rate = audioContext.sampleRate;

  // The cloth: a soft puff of low noise, gone in a wink.
  const length = Math.round(rate * 0.07);
  const buffer = audioContext.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) {
    const decay = Math.exp(-index / (rate * 0.016));
    data[index] = (Math.random() * 2 - 1) * decay;
  }
  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;
  const cloth = audioContext.createBiquadFilter();
  cloth.type = "bandpass";
  cloth.frequency.value = 420;
  cloth.Q.value = 0.9;
  const clothGain = audioContext.createGain();
  clothGain.gain.value = 0.2;
  noise.connect(cloth).connect(clothGain).connect(audioContext.destination);
  noise.start(now);
  noise.stop(now + 0.08);

  // The wood: one low thump, no harmonics to ring.
  const body = audioContext.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(168, now);
  body.frequency.exponentialRampToValueAtTime(112, now + 0.045);
  const bodyGain = audioContext.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.14, now + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  body.connect(bodyGain).connect(audioContext.destination);
  body.start(now);
  body.stop(now + 0.08);
}

function layoutSpec(width, height) {
  if (width <= 500 || height <= 500) {
    return {
      mode: "phone",
      riverColumns: width > height ? 4 : 3,
      handBandFraction: 0.5,
      minTileWidth: 26,
      maxTileWidth: 46,
    };
  }
  if (width >= 1024) {
    return {
      mode: "desktop",
      riverColumns: 6,
      handBandFraction: 0.12,
      minTileWidth: 26,
      maxTileWidth: 46,
    };
  }
  if (height > width) {
    return {
      mode: "portrait",
      riverColumns: 3,
      handBandFraction: 0.14,
      minTileWidth: 18,
      maxTileWidth: 46,
    };
  }
  return {
    mode: "landscape",
    riverColumns: 4,
    handBandFraction: 0.15,
    minTileWidth: 18,
    maxTileWidth: 46,
  };
}

function applyLayout() {
  const layout = computeLayout({
    width: window.innerWidth,
    height: window.innerHeight,
    ...layoutSpec(window.innerWidth, window.innerHeight),
  });
  currentLayout = layout;
  const root = document.documentElement.style;
  const phone = layout.mode === "phone";
  document.documentElement.classList.toggle("phone", phone);
  const px = (value) => `${value}px`;
  root.setProperty("--layout-board-h", px(window.innerHeight));
  root.setProperty("--layout-gap", px(layout.gap));
  root.setProperty("--layout-hand-gap", px(layout.handGap));
  root.setProperty(
    "--layout-hand-overlap",
    px(layout.handOverlap ?? 0),
  );
  root.setProperty("--layout-tile-w", px(layout.tileWidth));
  root.setProperty("--layout-tile-h", px(layout.tileHeight));
  // The hand is its own scale: fourteen overlapping fronts spanning the board.
  root.setProperty(
    "--layout-hand-tile-w",
    px(layout.handTileWidth ?? layout.tileWidth),
  );
  root.setProperty(
    "--layout-hand-tile-h",
    px(layout.handTileHeight ?? layout.tileHeight),
  );
  // The seat bands are computed from these two numbers, so the rack takes its
  // size from the solver rather than from the hand scale.
  // Every opponent's wall uses one back, so the three of them look alike.
  root.setProperty(
    "--layout-back-w",
    px(layout.rackWidth ?? layout.tileWidth * 0.73),
  );
  root.setProperty(
    "--layout-back-h",
    px(layout.rackHeight ?? layout.tileWidth * 0.96),
  );
  const setRect = (name, rect) => {
    root.setProperty(`--layout-${name}-x`, px(rect[0]));
    root.setProperty(`--layout-${name}-y`, px(rect[1]));
    root.setProperty(`--layout-${name}-w`, px(rect[2]));
    root.setProperty(`--layout-${name}-h`, px(rect[3]));
  };
  setRect("table", layout.table);
  setRect("control", layout.control);
  root.setProperty("--layout-table-x", px(layout.table[0]));
  root.setProperty("--layout-table-y", px(layout.table[1]));
  root.setProperty("--layout-table-w", px(layout.table[2]));
  root.setProperty("--layout-table-h", px(layout.table[3]));
  root.setProperty("--layout-control-x", px(layout.control[0]));
  root.setProperty("--layout-control-y", px(layout.control[1]));
  root.setProperty("--layout-control-w", px(layout.control[2]));
  root.setProperty("--layout-control-h", px(layout.control[3]));
  setRect("hand", layout.handBand);
  setRect("centre", layout.centre);
  setRect("wall", layout.wall);
  root.setProperty("--layout-wall-back-w", px(layout.wallBackWidth));
  root.setProperty("--layout-wall-back-h", px(layout.wallBackHeight));
  root.setProperty("--layout-wall-gap", px(layout.wallGap));
  setRect("pile", layout.pile);
  setRect("seat-top", layout.seats.top);
  setRect("seat-left", layout.seats.left);
  setRect("seat-right", layout.seats.right);
  setRect("controls", layout.controls);
  // A resize changes the heap's tile size: deal the landed discards again at
  // the size the new board gives them, so nothing is left at a stale spot.
  if (pileCells.length === 0 || pileSize.w !== layout.discardTileWidth) {
    dealPile();
  }
}

function renderSeats() {
  for (const entry of payload.table) {
    renderSeat(entry);
  }
  renderPile();
  renderWall();
}

/* ------------------------------------------------------------- the pile */

/**
 * Discards go into one grid in the middle: fixed cells, no rotation, no jitter,
 * filled from the centre outward. A grid is exact, so nothing overlaps, nothing
 * has to move once it has landed, and a full hand is a tidy block that stays
 * readable (2026-11-07, the owner's rule: a nicely formatted grid, not a
 * scatter).
 */
let pileItems = [];
let pileKeys = [];
let pileSize = { w: 0, h: 0 };
let pileCells = [];
/** Cell indexes in use. A claim frees its cell, and the next throw takes it. */
let pileOccupied = new Set();

/** Build the grid for a tile size: its cells and the size they are drawn at. */
function spotsFor(width, height) {
  pileSize = { w: width, h: height };
  pileCells = discardCells(currentLayout.pile, width);
  pileOccupied = new Set();
}

/** One throw takes the first free cell, so the grid fills its gaps first. */
function addToPile(item) {
  if (currentLayout === null) return;
  if (pileCells.length === 0) {
    spotsFor(currentLayout.discardTileWidth, currentLayout.discardTileHeight);
  }
  const cell = nextFreeCell(pileOccupied, pileCells.length);
  const spot = pileCells[cell];
  if (spot === undefined) {
    console.error("Discard grid is full; the throw has no cell.");
    return;
  }
  pileOccupied.add(cell);
  pileItems.push({
    key: item.key,
    seat: item.seat,
    id: item.id,
    cell,
    x: spot.x,
    y: spot.y,
    w: pileSize.w,
    h: pileSize.h,
  });
}

/** Deal every landed discard again into the grid, in the order thrown. */
function dealPile() {
  const items = pileItems.map(({ key, seat, id }) => ({ key, seat, id }));
  pileItems = [];
  pileCells = [];
  pileOccupied = new Set();
  for (const item of items) addToPile(item);
}

/**
 * The wall runs round the frame between the hands and the pile: one back per
 * live tile, the loose pair and the dead wall parked at the far end. The frame
 * empties from the break corner, so the ring's length is the wall's length.
 */
function renderWall() {
  const element = $("#wall");
  if (element === null || currentLayout === null || payload === null) return;
  const layout = currentLayout;
  element.replaceChildren();
  element.style.setProperty("--wall-back-w", `${layout.wallBackWidth}px`);
  element.style.setProperty("--wall-back-h", `${layout.wallBackHeight}px`);
  const cells = wallCells(layout.wall, layout.wallBackWidth, layout.wallGap);
  const wall = payload.wall ?? { remaining: 0, loose: 0, dead: 0 };
  const place = (cell, kind, extra = "") => {
    const back = backElement();
    back.classList.add("wall-back", kind);
    if (extra !== "") back.classList.add(extra);
    back.style.left = `${cell.x}px`;
    back.style.top = `${cell.y}px`;
    element.append(back);
  };
  for (let index = 0; index < wall.remaining; index++) {
    const cell = cells[index];
    if (cell === undefined) break;
    // The next tile to leave is the one at the head of the run.
    place(cell, "live", index === wall.remaining - 1 ? "is-head" : "");
  }
  const tail = cells.length - wall.dead - wall.loose;
  for (let index = 0; index < wall.dead; index++) {
    const cell = cells[tail + index];
    if (cell !== undefined) place(cell, "dead");
  }
  for (let index = 0; index < wall.loose; index++) {
    const cell = cells[cells.length - wall.loose + index];
    if (cell !== undefined) place(cell, "loose");
  }
  element.setAttribute(
    "aria-label",
    `${wall.remaining} tiles in the wall, ${wall.loose} loose`,
  );
}

/**
 * A tile just left the ring: the new head gives one pixel outward and comes
 * back. Every render rebuilds the wall, so the class is set here, once, after
 * the last render — never from inside renderWall.
 */
function nudgeWallHead() {
  if (REDUCED_MOTION.matches || currentLayout === null) return;
  const head = document.querySelector("#wall .wall-back.is-head");
  if (head === null) return;
  const x = Number.parseFloat(head.style.left);
  const y = Number.parseFloat(head.style.top);
  const edge =
    y <= 0.5
      ? "give-up"
      : y >= currentLayout.wall[3] - currentLayout.wallBackHeight - 0.5
        ? "give-down"
        : x <= 0.5
          ? "give-left"
          : "give-right";
  head.classList.add(edge);
}

function renderPile() {
  const element = $("#pile");
  if (element === null || currentLayout === null) return;
  element.style.setProperty("--discard-w", `${pileSize.w}px`);
  element.style.setProperty("--discard-h", `${pileSize.h}px`);
  element.replaceChildren();
  const claimWindow = payload?.view.claimWindow ?? null;
  pileItems.forEach((item, index) => {
    const tile = tileElement(item.key);
    tile.classList.add("discard");
    tile.style.left = `${item.x}px`;
    tile.style.top = `${item.y}px`;
    tile.style.zIndex = String(index + 1);
    if (index === pileItems.length - 1) {
      tile.classList.add("last");
      if (claimWindow !== null && claimWindow.tile === item.key) {
        tile.classList.add("claimable");
      }
    }
    element.append(tile);
  });
  element.setAttribute("aria-label", `${pileItems.length} discards`);
}


function renderHand() {
  const view = payload.view;
  const hand = displayHand();
  const element = $("#hand");
  element.replaceChildren();

  if (hand.length === 0) {
    const empty = div("hand-placeholder");
    empty.textContent = "No tiles in hand.";
    element.append(empty);
    return;
  }

  const drawn = drawnIndex();
  const drawnTile = drawn >= 0 ? drawn : -1;

  hand.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-tile";
    button.dataset.index = String(index);
    button.title = tileName(key);
    button.setAttribute(
      "aria-label",
      `Tile ${index + 1}: ${tileName(key)}${
        index === drawnTile ? ", just drawn" : ""
      }. Discards it.`,
    );
    if (index === drawnTile) {
      button.classList.add("is-drawn");
      // Phones mark the extra tile in place; wider tables keep the gap.
      if (index > 0 && !document.documentElement.classList.contains("phone")) {
        button.classList.add("is-drawn-gap");
      }
    }
    if (handInitialized && index === drawnTile && hand.length > previousHand.length) {
      button.classList.add("is-new");
    }

    button.append(tileElement(key));
    button.addEventListener("click", () => onHandClick(index));
    element.append(button);
  });

}
function renderOwnMelds() {
  const slot = $("#own-melds");
  const melds = meldRow(payload.view.player.melds);
  if (melds === null) slot.replaceChildren();
  else slot.replaceChildren(melds);
  // Your own declaration stands with your calls: the same slot the seats use.
  const band = document.querySelector(".hand-band");
  band.querySelectorAll(".fishing-chip").forEach((chip) => chip.remove());
  const mine = fishingChip({ seat: payload.view.player.seat });
  if (mine === null) band.removeAttribute("aria-label");
  else {
    band.setAttribute("aria-label", mine.getAttribute("aria-label") ?? "Fishing");
    // In the flow beside your melds, never floating over your tiles.
    slot.prepend(mine);
  }
}

function renderOwnBonus() {
  const slot = $("#own-bonus");
  slot.replaceChildren();
  const bonuses = [...payload.view.player.flowers, ...payload.view.player.seasons];
  const label = div("bonus-empty");
  label.textContent = "Bonus";
  slot.append(label);
  if (bonuses.length === 0) return;
  const row = div("bonus-row");
  for (const key of bonuses) row.append(tileElement(key));
  slot.append(row);
}

/** The table is asking you to answer a claim on the last discard. */
function claimAsked() {
  const view = payload?.view;
  return view !== undefined && view.phase === "claim" && view.turn === view.seat;
}

function isOwnClaimWindow() {
  // A held claim is still arriving: the table, not the player, is answering.
  if (claimHeld) return false;
  return claimAsked();
}

function chowActions() {
  return payload.legalActions.filter(
    (action) => action.type === "Claim" && action.kind === "chow",
  );
}

/** Mahjong, then pung, kong, chow; Enter and Claim both take this one. */
function bestClaimAction(actions) {
  const win = actions.find(
    (action) => action.type === "Win" || (action.type === "Claim" && action.kind === "mahjong"),
  );
  if (win !== undefined) return win;
  for (const kind of ["pung", "kong", "chow"]) {
    const found = actions.find(
      (action) => action.type === "Claim" && action.kind === kind,
    );
    if (found !== undefined) return found;
  }
  return null;
}

function makeClaimButton(
  action,
  { primary = false, label = "", tiles = null, className = "" } = {},
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    `claim-button${primary ? " primary" : ""}${className ? ` ${className}` : ""}`;
  if (label) button.append(document.createTextNode(label));
  if (tiles !== null) {
    for (const key of tiles) button.append(tileElement(key));
  }
  button.title = actionLabel(action);
  button.setAttribute("aria-label", actionLabel(action));
  button.addEventListener("click", () => sendAction(action));
  return button;
}

/** A chow variant is a clickable tile group, not a third decision button. */
function makeChowVariant(action) {
  const variant = document.createElement("span");
  variant.className = "claim-variant";
  variant.setAttribute("role", "button");
  variant.tabIndex = 0;
  variant.title = actionLabel(action);
  variant.setAttribute("aria-label", actionLabel(action));
  for (const key of action.tiles) variant.append(tileElement(key));
  variant.addEventListener("click", () => sendAction(action));
  return variant;
}

/**
 * Two decisions in the reserved row: Dismiss at its left end, the claim in the
 * throw's own slot at the right, both compact - never a button across the
 * whole board. A chow with several runs puts its variants beside Dismiss.
 */
function renderClaimBar({ winOnly = false } = {}) {
  const bar = $("#claim-bar");
  bar.hidden = false;
  bar.replaceChildren();
  const view = payload.view;
  const window = view.claimWindow;
  if (window === null) return;

  const head = div("claim-head");
  const label = span("claim-label", `${seatLabel(window.discarder)} discards`);
  head.append(label, tileElement(window.tile));

  // With calls off, only the hand's own win is offered: pung, kong and chow
  // never appear.
  const actions = payload.legalActions.filter((action) =>
    winOnly
      ? action.type === "Win" ||
        (action.type === "Claim" && action.kind === "mahjong") ||
        action.type === "Pass"
      : action.type === "Win" || action.type === "Claim" || action.type === "Pass",
  );
  const claim = bestClaimAction(actions);
  const pass =
    actions.find((action) => action.type === "Pass") ?? {
      type: "Pass",
      seat: view.seat,
    };
  const dismiss = makeClaimButton(pass, {
    label: "Dismiss",
    className: "claim-pass",
  });

  const secondary = div("claim-row claim-secondary");
  secondary.append(head, dismiss);
  if (claim.type === "Claim" && claim.kind === "chow" && chowActions().length > 1) {
    const variants = div("claim-variants");
    for (const action of chowActions()) variants.append(makeChowVariant(action));
    secondary.append(variants);
  }
  bar.append(secondary);

  if (claim !== null) {
    const primary = div("claim-row claim-primary");
    // A winning tile is not a call: it says so, so the one offer left when
    // calls are off cannot be mistaken for a pung.
    const winning = claim.type === "Win" || claim.kind === "mahjong";
    primary.append(makeClaimButton(claim, {
      primary: true,
      label: winning ? "Mahjong" : "Claim",
      tiles:
        claim.type === "Claim" && claim.kind !== "mahjong" ? claim.tiles : null,
    }));
    bar.append(primary);
  }

  maybePlayClaimCue();
}

/**
 * Before fishing is confirmed, the table shows exactly which wait the
 * announcement will fix. It is a preview, not a second decision: `f` or the
 * button below still declares in one action.
 */
function fishingPreview(action) {
  const preview = div("fishing-preview");
  preview.setAttribute("role", "group");
  const label = div("fishing-preview-label");
  label.textContent = "Fishing fixes";
  // The rail sorts waits by what they complete; show the fixed set in that
  // same order so the preview and the panel read as one list.
  const order =
    payload.checker.size === 13
      ? new Map(payload.checker.waits.map((wait, index) => [wait.tile, index]))
      : new Map();
  const waits = [...action.wait].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
  const tiles = div("fishing-preview-tiles");
  for (const key of waits) tiles.append(tileElement(key));
  const keys = div("fishing-preview-keys");
  keys.textContent = waits.join(" ");
  const count = div("fishing-preview-count");
  count.textContent = waits.length === 1 ? "1 wait" : `${waits.length} waits`;
  const footer = div("fishing-preview-footer");
  footer.append(keys, count);
  preview.append(label, tiles, footer);
  preview.setAttribute(
    "aria-label",
    `Fishing would fix ${waits.map(tileName).join(", ")}`,
  );
  return preview;
}

function renderActions() {
  renderActionRow();
  const element = $("#actions");
  if (payload === null || element.hidden) return;
  // The only control the bare table keeps: it says whether a discard may ever
  // be claimed, and it goes away while the table is asking something.
  element.append(callsToggle());
}

function renderActionRow() {
  const element = $("#actions");
  const bar = $("#claim-bar");

  // The offer is only real once the throw it answers has finished. Until then
  // the row stays empty and the claim cue stays silent, so the sound lands with
  // the bar rather than with the state change.
  // `pendingDiscards` counts too: this render runs before planDiscards has
  // queued the throw that arrived in the very same payload.
  const offerInFlight =
    claimAsked() &&
    (discardQueue.length > 0 || pendingDiscards.length > 0 || discardTimer !== null);
  if (claimHeld || offerInFlight) {
    // The offer waits for its tile: an empty reserved row reads better than a
    // note about a claim that has not been asked yet.
    bar.hidden = true;
    bar.replaceChildren();
    element.hidden = false;
    element.replaceChildren();
    return;
  }

  if (isOwnClaimWindow() && !callsEnabled) {
    const win = bestClaimAction(
      payload.legalActions.filter(
        (action) =>
          action.type === "Win" ||
          (action.type === "Claim" && action.kind === "mahjong"),
      ),
    );
    if (win === null) {
      // Calls are off: nothing is offered, so nothing is drawn. The table
      // answers Pass for the player once the called tile has settled - but a
      // review board is not a game, so it is never written to.
      if (scenarioName === null) passClaimForPlayer();
      bar.hidden = true;
      bar.replaceChildren();
      element.hidden = false;
      element.replaceChildren();
      return;
    }
    // A winning tile is not a call - it still asks, on its own.
    renderClaimBar({ winOnly: true });
    element.replaceChildren();
    element.classList.remove("has-fishing-preview");
    element.hidden = true;
    return;
  }

  if (isOwnClaimWindow()) {
    renderClaimBar();
    element.replaceChildren();
    element.classList.remove("has-fishing-preview");
    element.hidden = true;
    return;
  }

  bar.hidden = true;
  bar.replaceChildren();
  element.hidden = false;
  element.replaceChildren();

  const view = payload.view;
  const actions = orderedActions(payload.legalActions);
  const column = div("action-buttons");

  let discardButton;

  const fishingAction = actions.find((action) => action.type === "DeclareFishing");
  if (fishingAction !== undefined) {
    // The preview sits beside the buttons, below the east river, so nothing
    // in the reserved board moves when the offer appears.
    element.append(fishingPreview(fishingAction));
  }
  element.classList.toggle("has-fishing-preview", fishingAction !== undefined);

  if (actions.length === 0) {
    const note = div("action-note");
    if (view.phase === "finished") note.textContent = "";
    else if (view.turn !== view.seat) note.textContent = "Waiting for the table.";
    else if (view.phase === "discard") note.textContent = "";
    else if (view.phase === "claim") {
      note.textContent = "Waiting for the claim to resolve.";
    } else {
      note.textContent = "";
    }
    if (note.textContent) column.append(note);
    if (discardButton !== undefined) column.append(discardButton);

    if (column.childElementCount > 0) element.append(column);
    return;
  }

  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-button${
      index === 0 && view.phase !== "discard" ? " primary" : ""
    }${action.type === "DeclareFishing" ? " fishing-action" : ""}`;
    button.append(document.createTextNode(actionLabel(action)));
    if (action.type === "DeclareFishing") {
      const waits = action.wait.map(tileName).join(", ");
      button.title = `Declare fishing on ${waits}`;
      button.setAttribute("aria-label", `Declare fishing on ${waits}`);
    }
    button.addEventListener("click", () => sendAction(action));
    column.append(button);
  });
  if (discardButton !== undefined) column.append(discardButton);

  element.append(column);
}

function renderScorecard() {
  const slot = $("#scorecard");
  slot.replaceChildren();
  const totals = displayTotals();

  for (const entry of payload.table) {
    const row = div(`score-row${seatIsTurn(entry.seat) ? " is-turn" : ""}`);
    row.dataset.seat = entry.seat;
    row.style.setProperty("--seat-color", seatColor(entry.seat));
    if (seatIsTurn(entry.seat)) row.setAttribute("aria-current", "true");
    const wind = span("score-wind", entry.wind);
    const name = span(
      "score-name",
      entry.isYou ? "You" : `${WIND_NAME[entry.wind]} bot`,
    );
    const points = span("score-points");
    const value = totals[entry.seat] ?? 0;
    points.textContent = value === 0 ? "0" : signed(value);
    if (value !== 0) points.classList.add(changeClass(value));
    const dealer = span("score-dealer");
    dealer.title = entry.dealer ? "Dealer" : "";
    if (!entry.dealer) dealer.hidden = true;
    row.append(wind, name, points, dealer);
    slot.append(row);
  }
}

function turnSentence() {
  const view = payload.view;
  if (view.phase === "finished") return "Hand finished.";
  if (view.turn === view.seat) {
    if (view.phase === "draw") return "Your turn — draw a tile.";
    if (view.phase === "discard") return "Your turn — discard a tile.";
    if (view.phase === "announce") return "Your turn — declare fishing or pass.";
    if (view.phase === "claim") return "Your turn — claim or pass.";
    return "Your turn.";
  }
  if (view.phase === "claim") {
    return `${seatLabel(view.turn)} is answering the claim.`;
  }
  if (view.phase === "announce") {
    return `${seatLabel(view.turn)} is deciding on fishing.`;
  }
  return `${seatLabel(view.turn)} is playing.`;
}

function renderTurn() {
  const view = payload.view;
  const track = $("#turn-track");
  track.replaceChildren();
  const indicator = span("turn-indicator");
  const turnIndex = SEATS.indexOf(view.turn);
  indicator.style.transform = `translateX(calc(${Math.max(0, turnIndex)} * 100%))`;
  if (view.phase === "finished") indicator.hidden = true;
  track.append(indicator);

  for (const seat of SEATS) {
    const item = document.createElement("li");
    const entry = seatEntry(seat);
    const wind = entry === null ? seat : entry.wind;
    item.textContent = wind;
    item.dataset.seat = seat;
    item.title = WIND_NAME[wind] ?? wind;
    if (seatIsTurn(seat)) {
      item.classList.add("is-active");
      item.setAttribute("aria-current", "true");
    }
    track.append(item);
  }

  const text = turnSentence();
  $("#turn-text").textContent = text;

  const announceKey = `${view.turn}|${view.phase}|${view.claimWindow?.tile ?? ""}|${
    payload.outcome?.kind ?? ""
  }`;
  if (announceKey !== announced) {
    announced = announceKey;
    $("#live-turn").textContent = text;
  }

  const band = document.querySelector(".hand-band");
  band.classList.toggle("is-turn", seatIsTurn(view.seat));
}

function renderFishing() {
  const block = $("#fishing-block");
  const view = payload.view;
  if (view.fishing.length === 0) {
    block.hidden = true;
    $("#fishing").replaceChildren();
    return;
  }
  block.hidden = false;
  const slot = $("#fishing");
  slot.replaceChildren();
  for (const entry of view.fishing) {
    const line = div(`fishing-entry${entry.seat === view.seat ? " is-mine" : ""}`);
    line.dataset.seat = entry.seat;
    line.style.setProperty("--seat-color", seatColor(entry.seat));
    const head = div("fishing-head");
    const name = span("fishing-name", seatLabel(entry.seat));
    const state = span("fishing-fixed", "fixed");
    head.append(name, state);
    const waits = div("fishing-waits");
    for (const key of entry.wait) waits.append(tileElement(key));
    const tier = span("fishing-tier", tierName(entry.tier) ?? entry.tier);
    line.append(head, waits, tier);
    line.setAttribute(
      "aria-label",
      `${seatLabel(entry.seat)} fishing on ${entry.wait.map(tileName).join(", ")}, ` +
        `${tierName(entry.tier) ?? entry.tier}`,
    );
    slot.append(line);
  }
}

function renderWaits() {
  const slot = $("#waits");
  const block = $("#waits-block");
  const checker = payload.checker;
  const view = payload.view;
  if (view.phase === "finished") {
    block.hidden = true;
    slot.replaceChildren();
    return;
  }
  block.hidden = false;
  slot.replaceChildren();
  const ownFishing =
    view.fishing.find((entry) => entry.seat === view.seat)?.wait ?? [];

  if (checker.size === 13) {
    if (checker.waits.length === 0) {
      const empty = div("hint");
      empty.textContent = "No catalogue hand waits on these tiles.";
      slot.append(empty);
      return;
    }
    const lead = div("wait-lead");
    lead.textContent =
      checker.waits.length === 1
        ? "1 completing tile"
        : `${checker.waits.length} completing tiles`;
    slot.append(lead);

    for (const wait of checker.waits) {
      const fishing = ownFishing.includes(wait.tile);
      const row = div(
        `wait${wait.dead ? " is-dead" : ""}${fishing ? " is-fishing" : ""}`,
      );
      row.append(tileElement(wait.tile));
      const body = div("wait-body");
      const head = div("wait-head");
      const key = span("", wait.tile);
      const left = span(
        wait.dead ? "wait-dead" : "wait-left",
        wait.dead ? "dead" : `${wait.remaining} left`,
      );
      head.append(key, left);
      if (wait.selfDrawnOnly) head.append(span("wait-drawn", "self-drawn"));
      if (fishing) head.append(span("fishing-badge", "fishing"));
      const hands = div("wait-hands");
      if (wait.dead) {
        hands.textContent = "you hold all four copies";
      } else if (wait.matches.length === 0) {
        hands.textContent = "no catalogue hand";
      } else {
        const best = wait.matches[0];
        const extra = wait.matches.length - 1;
        hands.textContent = `${best.name} · ${tierName(best.tier) ?? best.tier}`;
        if (extra > 0) {
          hands.title = `${wait.matches.length} completing patterns; best ${best.name}`;
        }
      }
      body.append(head, hands);
      row.append(body);
      row.setAttribute(
        "aria-label",
        `${tileName(wait.tile)}: ${
          wait.dead ? "dead, you hold all four copies" : `${wait.remaining} copies left`
        }${wait.selfDrawnOnly ? ", self-drawn only" : ""}${
          fishing ? ", your fishing wait" : ""
        }`,
      );
      slot.append(row);
    }
    return;
  }

  if (checker.size === 14) {
    const lead = div("hint");
    lead.textContent =
      checker.matches.length > 0
        ? `You hold 14 tiles. ${checker.matches
            .slice(0, 3)
            .map((match) => `${match.name} · ${tierName(match.tier) ?? match.tier}`)
            .join(" · ")}`
        : "You hold 14 tiles. Discard one to see the waits.";
    slot.append(lead);
    return;
  }

  const errors = div("hint");
  errors.textContent = checker.errors.join(" ");
  slot.append(errors);
}

function setTableInert(inert) {
  const board = $("#board");
  const band = document.querySelector(".hand-band");
  if (board !== null) board.inert = inert;
  if (band !== null) band.inert = inert;
}




function composeResultTiles(outcome) {
  const tiles = div("result-tiles");
  const winning = outcome.winningTile;
  const hand = outcome.hand;
  const winningIndex =
    hand === null || winning === null ? -1 : hand.lastIndexOf(winning);

  const add = (key, isWinning) => {
    const tile = tileElement(key);
    if (isWinning) {
      tile.classList.add("is-winning");
      tile.title = `Winning tile — ${tileName(key)}`;
      tile.setAttribute("aria-label", `${tileName(key)}, winning tile`);
    }
    return tile;
  };

  if (hand !== null) {
    hand.forEach((key, index) => tiles.append(add(key, index === winningIndex)));
  }
  if (outcome.melds !== null) {
    for (const meld of outcome.melds) {
      const group = div("meld");
      if (!meld.exposed) group.classList.add("is-concealed");
      group.title = `${meld.kind}${meld.exposed ? "" : " (concealed)"}`;
      for (const key of meld.tiles) group.append(add(key, false));
      tiles.append(group);
    }
  }
  // Another seat's concealed hand is never in the payload: the winning tile
  // and the public melds are the whole composing evidence.
  if (hand === null && winning !== null) tiles.append(add(winning, true));
  return tiles;
}

/**
 * The result screen is the celebration, not a receipt: one big combination,
 * what the book says it is, what it paid, and who paid it (2026-11-07). The
 * winner's tiles are public once the hand is over, so a bot's win explains
 * itself exactly like your own.
 */
/** `win calculate (dealer double)` reads better as `win · calculate · dealer double`. */
function prettyReason(reason) {
  return reason
    .replace(/ \(([^)]*)\)$/, " · $1")
    .replace(/^win /, "win · ")
    .replace(/^fishing /, "fishing · ");
}

function renderOutcome() {
  const panel = $("#outcome");
  const outcome = payload.outcome;
  if (outcome === null) {
    panel.hidden = true;
    panel.replaceChildren();
    setTableInert(false);
    focusedOutcomeKey = null;
    return;
  }
  panel.hidden = false;
  panel.dataset.kind = outcome.kind;
  panel.dataset.tier = outcome.tier ?? "none";
  panel.replaceChildren();
  setTableInert(true);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "outcome-title");
  panel.setAttribute("tabindex", "-1");

  const card = div("result-card");
  card.dataset.tier = outcome.tier ?? "none";

  const won = outcome.kind === "win";
  const winnerSeat = outcome.winner;
  const mine = won && winnerSeat === payload.seat;

  const kicker = div("result-kicker");
  if (won) {
    const who = mine ? "You" : seatLabel(winnerSeat);
    kicker.textContent = `${who} ${mine ? "win" : "wins"} · ${
      outcome.selfDrawn ? "self-drawn" : `${seatLabel(outcome.from)}'s discard`
    } · hand ${payload.view.handNumber}`;
  } else {
    kicker.textContent = `Hand ${payload.view.handNumber} drawn · ${outcome.reason}`;
  }

  const title = document.createElement("h2");
  title.id = "outcome-title";
  title.className = "result-hero";
  title.textContent = won ? (outcome.patternName ?? outcome.patternId ?? "Mah Jong") : "No winner";
  card.append(kicker, title);

  if (won) {
    const tier = span("tier-badge", tierName(outcome.tier) ?? "calculated");
    tier.dataset.tier = outcome.tier ?? "none";
    const meta = div("result-meta");
    meta.append(tier);
    if (outcome.patternPages.length > 0) {
      meta.append(
        span("result-page", `Illustrated p. ${outcome.patternPages.join(", ")}`),
      );
    }
    card.append(meta);

    if (outcome.patternDescription !== null) {
      const requirement = div("result-requirement");
      requirement.append(span("result-requirement-label", "The hand"));
      requirement.append(document.createTextNode(outcome.patternDescription));
      card.append(requirement);
    }
  }

  if (won) {
    card.append(composeResultTiles(outcome));
  }

  const score = div("result-score");
  if (!won) {
    const line = div("score-line");
    line.append(span("score-label", "No hand completed"), span("score-value", "—"));
    score.append(line);
  } else if (outcome.points !== null) {
    if (outcome.ground !== null && outcome.doubles !== null && outcome.raw !== null) {
      const ground = div("score-line");
      ground.append(
        span("score-label", "Ground"),
        span("score-value", String(outcome.ground)),
      );
      const doubles = div("score-line");
      doubles.append(
        span("score-label", `${outcome.doubles} double${outcome.doubles === 1 ? "" : "s"} ×2`),
        span("score-value", String(outcome.raw)),
      );
      const capped = div("score-line");
      capped.append(
        span("score-label", `Limit`),
        span("score-value", `${outcome.limit}`),
      );
      score.append(ground, doubles, capped);
    }
    const total = div("score-line is-total");
    total.append(
      span("score-label", mine ? "You are paid" : `${seatLabel(winnerSeat)} is paid`),
      span("score-value", `${outcome.points}`),
    );
    score.append(total);
  }
  card.append(score);

  // Who pays whom: the ledger says why, the totals say how much.
  const pays = document.createElement("ul");
  pays.className = "result-pay";
  const lines = outcome.ledger.filter((entry) => !entry.reason.startsWith("fishing"));
  for (const seat of SEATS) {
    const delta = outcome.totals[seat] ?? 0;
    if (delta === 0) continue;
    const row = document.createElement("li");
    row.dataset.seat = seat;
    row.style.setProperty("--seat-color", seatColor(seat));
    if (won && seat === winnerSeat) row.classList.add("is-winner");
    const name = span("pay-seat", seat === payload.seat ? "You" : seatLabel(seat));
    const against = span(
      "pay-amount",
      `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`,
    );
    against.classList.add(delta > 0 ? "is-gain" : "is-loss");
    row.append(name, against);
    pays.append(row);
  }
  card.append(pays);

  const reasons = div("result-reasons");
  for (const entry of lines) {
    const reason = div("result-reason");
    const amount =
      entry.points === null ? "calculate" : `${entry.points}`;
    reason.append(
      span("reason-amount", amount),
      document.createTextNode(
        ` ${seatInSentence(entry.from)} → ${seatInSentence(entry.to)} · ${prettyReason(entry.reason)}`,
      ),
    );
    reasons.append(reason);
  }
  const fishing = outcome.fishing.length;
  if (fishing > 0) {
    const note = div("result-reason is-fishing");
    note.textContent = `${fishing} fishing settlement${fishing === 1 ? "" : "s"} included`;
    reasons.append(note);
  }
  if (reasons.childElementCount > 0) card.append(reasons);

  // A win is worth a little light: three sparks and a sweep across the name.
  if (won) {
    const sparkles = div("result-sparks");
    for (let index = 0; index < 3; index++) sparkles.append(div("spark"));
    card.prepend(sparkles);
  }

  const next = document.createElement("button");
  next.type = "button";
  next.id = "result-next";
  next.className = "result-next";
  next.textContent = "Next hand";
  next.addEventListener("click", () => {
    focusedOutcomeKey = null;
    void request("/api/next", { game: payload.game });
  });
  card.append(next);

  panel.append(card);

  const resultKey = `${payload.game}:${payload.view.handNumber}`;
  if (focusedOutcomeKey !== resultKey) {
    focusedOutcomeKey = resultKey;
    next.focus({ preventScroll: true });
  }
}

// Keep an open page honest: when web/ changes on disk the server's build stamp
// changes and the page reloads itself, so nobody has to remember to refresh.
let buildStamp = null;
async function watchBuild() {
  try {
    const res = await fetch("/api/build", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (buildStamp === null) {
      buildStamp = data.stamp;
      return;
    }
    if (data.stamp !== buildStamp) location.reload();
  } catch {
    // server restarting; try again next tick
  }
}

setInterval(watchBuild, 1500);
watchBuild();

function render() {
  if (payload === null) return;
  applyLayout();
  syncRevealed();
  $("#board").classList.toggle("is-claiming", isOwnClaimWindow());
  renderMeta();
  renderSeats();
  renderHand();
  renderOwnMelds();
  renderOwnBonus();
  renderActions();
  renderScorecard();
  renderTurn();
  renderWaits();
  renderFishing();
  renderOutcome();


  previousHand = displayHand();
  for (const entry of payload.table) {
    previousConcealed[entry.seat] = entry.handCount;
  }
  if (tableInitialized) {
    for (const seat of SEATS) {
      previousDiscards[seat] = seatEntry(seat)?.discards.length ?? 0;
    }
  } else {
    for (const seat of SEATS) {
      previousDiscards[seat] = seatEntry(seat)?.discards.length ?? 0;
    }
    tableInitialized = true;
  }
  handInitialized = true;

  // Deferred: render() runs while a request is still in flight, so the draw
  // must wait for `busy` to clear or it is dropped.
  setTimeout(autoDraw, 0);

  // The opponents' discards arrive together but are shown one at a time, so
  // the round keeps a rhythm you can follow.
  planDiscards();
}

/* -------------------------------------------------------------- gallery */

const GALLERY_GROUPS = [
  { title: "Bamboo", keys: PLAY_TILE_KEYS.filter((key) => key.startsWith("b")) },
  { title: "Characters", keys: PLAY_TILE_KEYS.filter((key) => key.startsWith("c")) },
  { title: "Circles", keys: PLAY_TILE_KEYS.filter((key) => key.startsWith("o")) },
  { title: "Winds", keys: PLAY_TILE_KEYS.filter((key) => key.startsWith("w")) },
  { title: "Dragons", keys: PLAY_TILE_KEYS.filter((key) => key.startsWith("d")) },
  { title: "Flowers", keys: BONUS_TILE_KEYS.filter((key) => key.startsWith("f")) },
  { title: "Seasons", keys: BONUS_TILE_KEYS.filter((key) => key.startsWith("s")) },
];

/** `?gallery=1`: every face in one grid, instead of the table. */
function renderGallery() {
  document.title = "Mahjong tile gallery";
  document.body.classList.add("gallery-mode");
  const app = $("#app");
  app.replaceChildren();

  const gallery = document.createElement("section");
  gallery.id = "tile-gallery";
  gallery.setAttribute("aria-label", "Tile gallery");

  const head = div("gallery-head");
  const title = document.createElement("h2");
  title.textContent = "Tile gallery";
  const hint = div("hint");
  hint.textContent = "All 34 play tiles and the 8 bonus marks, one SVG per canonical key.";
  head.append(title, hint);
  gallery.append(head);

  for (const group of GALLERY_GROUPS) {
    const section = document.createElement("section");
    section.className = "gallery-group";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    section.append(heading);

    const grid = div("gallery-grid");
    for (const key of group.keys) {
      const figure = document.createElement("figure");
      figure.className = "gallery-tile";
      const caption = document.createElement("figcaption");
      caption.textContent = `${key} · ${tileName(key)}`;
      figure.append(tileElement(key), caption);
      grid.append(figure);
    }
    section.append(grid);
    gallery.append(section);
  }

  app.append(gallery);
}

/* ------------------------------------------------------------ review states */

/**
 * `?state=<name>` opens one fixed board from the server's scenario table: the
 * same reducer and the same bot policy the game uses, replayed from a fixed
 * seed, so the page is the real table in that state — not a mock and not a
 * saved DOM. The tab names the state, and the rail carries the same name, so
 * a screenshot identifies itself.
 */
async function openScenario(name) {
  let data;
  try {
    data = await api(`/api/scenario?state=${encodeURIComponent(name)}`);
  } catch (error) {
    log(`No review state "${name}": ${error.message}`);
    return false;
  }
  scenarioName = name;
  eventsAreHistory = true;
  applyResponse(data, null, true);
  document.title = `Mahjong — ${name}`;
  const tag = $("#state-tag");
  if (tag !== null) {
    tag.querySelector(".state-tag-name").textContent = `state · ${name}`;
    tag.querySelector(".state-tag-title").textContent = data.title;
    tag.hidden = false;
  }
  return true;
}

/** Leaving review mode — a new deal — restores the table's own title. */
function clearScenario() {
  scenarioName = null;
  document.title = "Mahjong table";
  const tag = $("#state-tag");
  if (tag !== null) tag.hidden = true;
}

/* ------------------------------------------------------------- commands */

function onHandClick(index) {
  if (payload === null) return;
  // The table is still answering: the turn has not come back to you yet, so a
  // tap now would be a discard out of turn.
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld || callHeld) return;
  // A click that lands while a request is in flight (the automatic draw) is
  // remembered and applied the moment the table answers, so a fast click is
  // never swallowed.
  if (busy) {
    pendingClick = index;
    return;
  }
  if (index < 0 || index >= displayHand().length) return;
  // A tap throws the tile. There is no select step and nothing to confirm.
  if (isYourDiscardPhase()) discardAt(index);
}
function drawnIndex() {
  if (payload === null) return -1;
  const view = payload.view;
  const draw = view.lastDraw;
  const hand = displayHand();
  if (draw === null || draw.seat !== view.seat) return -1;
  return view.player.hand.includes(draw.tile) ? hand.length - 1 : -1;
}

function discardAt(index) {
  if (payload === null || busy) return;
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld || callHeld) return;
  const tile = displayHand()[index];
  if (tile === undefined) return;
  if (sendDiscard(tile, index)) return;
  log("That tile cannot be discarded now.");
}

function pass() {
  const action = legalAction("Pass");
  if (action === undefined) return;
  sendAction(action);
}

function declareFishing() {
  const action = legalAction("DeclareFishing");
  if (action === undefined) {
    log("Fishing is not legal now.");
    return;
  }
  sendAction(action);
}

function claimBest() {
  if (payload === null || busy) return;
  const action = bestClaimAction(payload.legalActions);
  if (action !== null) sendAction(action);
}

function undo() {
  if (payload === null) return;
  revertScores();
  void request("/api/undo", { game: payload.game }, null, true);
}

function newGame(seed) {
  clearScenario();
  freshDeal = true;
  claimHeld = false;
  if (claimTimer !== null) {
    clearTimeout(claimTimer);
    claimTimer = null;
  }
  handInitialized = false;
  tableInitialized = false;
  previousHand = [];
  previousDiscards = { E: 0, S: 0, W: 0, N: 0 };
  announced = "";
  focusedOutcomeKey = null;
  void request(
    "/api/new",
    seed === undefined ? {} : { seed },
    (data) => `New game — seed ${data.seed}`,
  );
}

/* --------------------------------------------------------------- events */

function persistRail() {
  try {
    localStorage.setItem(RAIL_KEY, railOpen ? "open" : "closed");
  } catch {
    // A private window can refuse storage; the rail still works for this visit.
  }
}

function applyRail() {
  const app = $("#app");
  app.classList.toggle("rail-closed", !railOpen);
  $("#rail-show").hidden = railOpen;
}

/** Debug view only: the Tenhou screenshot at native size behind the board. */
function applyReference() {
  const overlay = $("#reference-overlay");
  const ready = overlay.naturalWidth > 0;
  overlay.hidden = !(referenceShown && ready);
  $("#board").classList.toggle("overlay-on", referenceShown);
  $("#app").classList.toggle("overlay-on", referenceShown);
  if (referenceShown && !ready && !referenceMissing) {
    referenceMissing = true;
    log("Reference screenshot missing: web/reference3.png is gitignored.");
  }
}

function setRail(open) {
  railOpen = open;
  applyRail();
  persistRail();
}

function bindEvents() {
  $("#new-game").addEventListener("click", () => newGame(randomSeed()));
  $("#undo").addEventListener("click", undo);
  $("#rail-hide").addEventListener("click", () => setRail(false));
  $("#rail-show").addEventListener("click", () => setRail(true));
  const overlay = $("#reference-overlay");
  overlay.addEventListener("load", applyReference);
  overlay.addEventListener("error", applyReference);
  window.addEventListener("pointerdown", unlockAudio, { capture: true });
  window.addEventListener("resize", () => {
    if (payload !== null) render();
  });
}

function initialRail() {
  try {
    const stored = localStorage.getItem(RAIL_KEY);
    if (stored === "open") return true;
    if (stored === "closed") return false;
  } catch {
    // Fall through to the viewport default.
  }
  return window.innerWidth >= 1024;
}

async function boot() {
  muted = readMuted();
  callsEnabled = readCalls();
  bindEvents();
  railOpen = initialRail();
  applyRail();
  const params = new URLSearchParams(window.location.search);
  // The table has one look now; the class stays so the CSS reads by variant.
  document.documentElement.classList.add("variant-d");
  referenceShown = params.get("overlay") === "1";
  applyReference();

  if (params.get("gallery") === "1") {
    renderGallery();
    return;
  }

  const stateName = params.get("state");
  if (stateName !== null && (await openScenario(stateName))) return;

  // A page load always starts a hand from the deal, so the first round can be
  // watched from the beginning. `?game=` is the only way to resume a game.
  const explicit = params.get("game");
  if (explicit !== null) {
    try {
      const data = await api(`/api/state?game=${encodeURIComponent(explicit)}`);
      applyResponse(data, "Resumed the game.");
      return;
    } catch {
      sessionStorage.removeItem(GAME_KEY);
    }
  }

  await newGame();
}

void boot();
