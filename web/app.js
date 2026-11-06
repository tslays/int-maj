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
import { computeLayout } from "./layout.js";

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
let announced = "";
let focusedOutcomeKey = null;
let scoresKey = null;
let sessionScores = { E: 0, S: 0, W: 0, N: 0 };
let appliedOutcome = null;

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
  const claimWindow = view.claimWindow;
  const key =
    `${payload.game}|${view.handNumber}|${claimWindow.discarder}|` +
    `${claimWindow.tile}|${claimWindow.pending.join(",")}`;
  if (key === lastClaimCueKey) return;
  if (muted || audioContext === null || audioContext.state !== "running") return;
  lastClaimCueKey = key;
  playClaimCue(audioContext);
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

function applyResponse(data, note, replaceLog = false) {
  payload = data;
  if (typeof data.game === "string" && scenarioName === null) {
    sessionStorage.setItem(GAME_KEY, data.game);
  }
  loadScores(data.game, data.seed);
  settleScores();
  if (replaceLog || data.replaceLog === true) logLines.length = 0;
  if (note) log(note);
  if (Array.isArray(data.events)) {
    for (const line of data.events) log(line);
    pendingDiscards = discardsFromEvents(data.events);
  }
  render();
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
  calculate: "calculate",
};

function tierName(tier) {
  return tier === null || tier === undefined ? null : (TIER_NAME[tier] ?? tier);
}

/** Printed tier, or the ground x 2^doubles arithmetic and its cap. */
function scoreBadge(outcome) {
  const tier = tierName(outcome.tier);
  if (outcome.ground !== null && outcome.doubles !== null && outcome.raw !== null) {
    const arithmetic =
      `ground ${outcome.ground} × 2^${outcome.doubles} = ${outcome.raw}` +
      (outcome.points !== null && outcome.points !== undefined && outcome.raw > outcome.points
        ? ` → ${outcome.points}`
        : "");
    return {
      text: arithmetic,
      note: `${outcome.raw} before the ${outcome.limit}-point limit; ${outcome.points} paid`,
    };
  }
  if (outcome.points === null || outcome.points === undefined) {
    return { text: tier ?? "calculate", note: "the book gives no fixed value" };
  }
  return {
    text: tier === null ? `${outcome.points}` : `${tier} · ${outcome.points}`,
    note: `${outcome.points} points`,
  };
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
  rack.setAttribute("aria-label", `${entry.handCount} concealed tiles`);
  for (let index = 0; index < entry.handCount; index++) rack.append(backElement());
  line.append(rack);
  return line;
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
  root.replaceChildren();

  const rack = rackLine(entry);
  const melds = meldRow(entry.melds);
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
/** The claimed tile gets this long to read once it has landed. */
const CLAIM_SHOW_MS = 260;
let discardQueue = [];
let pendingDiscards = [];
let discardTimer = null;
/** A claim whose discard is still in flight: the offer is not asked yet. */
let claimHeld = false;
let claimTimer = null;
/** A review state arrives with the whole hand's log, not fresh throws. */
let eventsAreHistory = false;
/** Discards the viewer has already seen land, per seat. */
const revealedDiscards = { E: 0, S: 0, W: 0, N: 0 };
let rhythmReady = false;
let freshDeal = false;

/** Keeps the seen-counts honest when the table loses tiles (undo, claim). */
function syncRevealed() {
  const all = [];
  for (const seat of SEATS) {
    const discards = seatEntry(seat)?.discards ?? [];
    discards.forEach((key, index) => {
      all.push({ seat, key, id: `${seat}:${key}:${index}` });
    });
  }
  if (!rhythmReady || freshDeal) {
    // A fresh hand starts empty, so its first discards play on the beat.
    pileKeys = freshDeal ? [] : all.slice();
    pileItems = [];
    pileSpots = null;
    for (const item of pileKeys) addToPile(item);
    for (const seat of SEATS) {
      revealedDiscards[seat] = freshDeal ? 0 : (seatEntry(seat)?.discards.length ?? 0);
    }
    freshDeal = false;
    rhythmReady = true;
    return;
  }
  // A claim takes the offered tile off the table; drop it from the heap.
  const before = pileKeys.length;
  pileKeys = pileKeys.filter((item) => all.some((other) => other.key === item.key));
  if (pileKeys.length !== before) rebuildPile();
  for (const seat of SEATS) {
    const count = seatEntry(seat)?.discards.length ?? 0;
    revealedDiscards[seat] = Math.min(revealedDiscards[seat], count);
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
    const occurrence = (revealedDiscards[item.seat] ?? 0) + discardQueue.filter((queued) => queued.seat === item.seat).length;
    item.id = `${item.seat}:${item.key}:${occurrence}`;
    if (discardQueue.some((queued) => queued.id === item.id)) continue;
    if (revealedDiscards[item.seat] > 0 && pileKeys.some((placed) => placed.id === item.id)) continue;
    if (item.seat === payload.seat) {
      // Your own throw lands at once; the table answers on the beat.
      revealDiscard(item);
      continue;
    }
    discardQueue.push(item);
  }
  pendingDiscards = [];
  if (payload.view.claimWindow !== null) {
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
  discardTimer = setTimeout(() => {
    discardTimer = null;
    revealDiscard();
    if (discardQueue.length > 0) {
      scheduleDiscard();
      return;
    }
    if (claimHeld) showClaim();
  }, DISCARD_BEAT_MS);
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
  if (next.id !== undefined && pileKeys.some((placed) => placed.id === next.id)) return;
  revealedDiscards[next.seat] = (revealedDiscards[next.seat] ?? 0) + 1;
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

/** The tile leaves the wall: a back flies from the seat's rack to the river. */
function throwGhost(seat, tile) {
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
      handBandFraction: 0.18,
      minTileWidth: 18,
      maxTileWidth: 46,
    };
  }
  return {
    mode: "landscape",
    riverColumns: 4,
    handBandFraction: 0.24,
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
  setRect("pile", layout.pile);
  setRect("seat-top", layout.seats.top);
  setRect("seat-left", layout.seats.left);
  setRect("seat-right", layout.seats.right);
  setRect("controls", layout.controls);
}

function renderSeats() {
  for (const entry of payload.table) {
    renderSeat(entry);
  }
  renderPile();
}

/* ------------------------------------------------------------- the pile */

/**
 * Discards are thrown into one heap in the middle: it grows out of the centre,
 * each throw lands on its own side, tiles lie at every angle, and no two ever
 * overlap. A landing tile nudges its neighbours a couple of pixels, so the heap
 * settles like real tiles would.
 */
const PILE_GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SEAT_ANGLE = {
  top: -Math.PI / 2,
  right: 0,
  bottom: Math.PI / 2,
  left: Math.PI,
};
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PILE_CAPACITY = 84;
let pileItems = [];
let pileKeys = [];
let pileSize = { w: 0, h: 0 };
let pileRandom = mulberry32(0x5eed);

function angleDistance(a, b) {
  const turn = Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI);
  return Math.min(turn, Math.PI * 2 - turn);
}

/** Separating-axis test for two rotated rectangles. */
function boxesOverlap(a, b, gap = 0) {
  const axes = [a.angle, b.angle];
  for (const angle of axes) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const project = (box) => {
      const ex = (box.w / 2) * Math.abs(Math.cos(box.angle) * cos + Math.sin(box.angle) * sin);
      const ey = (box.h / 2) * Math.abs(-Math.sin(box.angle) * cos + Math.cos(box.angle) * sin);
      const centre = (box.x + box.w / 2) * cos + (box.y + box.h / 2) * sin;
      return [centre - (ex + ey), centre + (ex + ey)];
    };
    const [aMin, aMax] = project(a);
    const [bMin, bMax] = project(b);
    if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
  }
  return true;
}

function placementFits(list, candidate) {
  for (const item of list) {
    if (boxesOverlap(item, candidate, 0.5)) return false;
  }
  return true;
}

/** A dense, jittered grid of spots inside the heap, ordered from the centre. */
function pileCandidates(w, h) {
  const pile = currentLayout.pile;
  const centreX = pile[2] / 2;
  const centreY = pile[3] / 2;
  const reachX = Math.max(1, pile[2] / 2 - w / 2);
  const reachY = Math.max(1, pile[3] / 2 - h / 2);
  const stepX = w * 1.04;
  const stepY = h * 1.03;
  const list = [];
  for (let gy = -reachY; gy <= reachY; gy += stepY) {
    for (let gx = -reachX; gx <= reachX; gx += stepX) {
      const jx = gx + (pileRandom() - 0.5) * stepX * 0.14;
      const jy = gy + (pileRandom() - 0.5) * stepY * 0.14;
      if ((jx / reachX) ** 2 + (jy / reachY) ** 2 > 1) continue;
      list.push({
        x: centreX + jx - w / 2,
        y: centreY + jy - h / 2,
        w,
        h,
        radius: Math.hypot(jx, jy),
        theta: Math.atan2(jy, jx),
        angle: (pileRandom() - 0.5) * 0.9,
      });
    }
  }
  list.sort((a, b) => a.radius - b.radius || a.theta - b.theta);
  return list;
}

/** The innermost free spot on the thrower's side, or null when the heap is full. */
function tryPlace(seat, list, placed, w, h) {
  const preferred = SEAT_ANGLE[PLACE[seat]] ?? 0;
  for (const spread of [Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI]) {
    for (const candidate of list) {
      if (angleDistance(candidate.theta, preferred) > spread) continue;
      // A tile may lie at any careless angle; try a few before giving up on
      // the spot, so the heap packs as tightly as the geometry allows.
      for (const turn of [0, 0.18, -0.18, 0.34, -0.34]) {
        const tilted = { ...candidate, angle: candidate.angle + turn };
        if (placementFits(placed, tilted)) return tilted;
      }
    }
  }
  return null;
}

/** The tile size the heap is using, and its candidate spots (built once). */
let pileSpots = null;

function spotsFor(w, h) {
  pileRandom = mulberry32(0x5eed);
  pileSpots = pileCandidates(w, h);
  pileSize = { w, h };
  return pileSpots;
}

/**
 * Adds one tile to the heap and never moves the tiles already down: the spot is
 * chosen once, from what is still free. Only a heap that is genuinely full is
 * rebuilt smaller.
 */
function addToPile(item) {
  if (currentLayout === null) return;
  if (pileSpots === null) {
    spotsFor(currentLayout.discardTileWidth, currentLayout.discardTileHeight);
  }
  const spot = tryPlace(item.seat, pileSpots, pileItems, pileSize.w, pileSize.h);
  if (spot !== null) {
    pileItems.push({ key: item.key, seat: item.seat, id: item.id, ...spot });
    return;
  }
  rebuildPile();
}

/** Last resort: the window cannot hold the hand at this size. */
function rebuildPile() {
  const baseW = currentLayout.discardTileWidth;
  const baseH = currentLayout.discardTileHeight;
  for (let step = 1; step < 12; step++) {
    const w = baseW * Math.pow(0.93, step);
    const h = baseH * Math.pow(0.93, step);
    const list = spotsFor(w, h);
    const placed = [];
    for (const item of pileKeys) {
      const spot = tryPlace(item.seat, list, placed, w, h);
      if (spot === null) {
        placed.length = 0;
        break;
      }
      placed.push({ key: item.key, seat: item.seat, id: item.id, ...spot });
    }
    if (placed.length === pileKeys.length) {
      pileItems = placed;
      return;
    }
  }
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
    tile.style.transform = `rotate(${(item.angle * 180) / Math.PI}deg)`;
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

function isOwnClaimWindow() {
  const view = payload.view;
  // A held claim is still arriving: the table, not the player, is answering.
  if (claimHeld) return false;
  return view.phase === "claim" && view.turn === view.seat;
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
 * Two decisions, fixed at the bottom centre: Claim (the best legal claim,
 * Mahjong first) and Dismiss. If a chow has several runs, its variants are
 * clickable tile groups under the row; Enter always takes the first.
 */
function renderClaimBar() {
  const bar = $("#claim-bar");
  bar.hidden = false;
  bar.replaceChildren();
  const view = payload.view;
  const window = view.claimWindow;
  if (window === null) return;

  const head = div("claim-head");
  const label = span("claim-label", `${seatLabel(window.discarder)} discards`);
  head.append(label, tileElement(window.tile));

  const actions = payload.legalActions.filter(
    (action) => action.type === "Win" || action.type === "Claim" || action.type === "Pass",
  );
  const claim = bestClaimAction(actions);
  const pass =
    actions.find((action) => action.type === "Pass") ?? {
      type: "Pass",
      seat: view.seat,
    };

  const row = div("claim-row");
  row.append(head);
  if (claim !== null) {
    row.append(
      makeClaimButton(claim, {
        primary: true,
        label: "Claim",
        tiles:
          claim.type === "Claim" && claim.kind !== "mahjong" ? claim.tiles : null,
      }),
    );
  }
  row.append(
    makeClaimButton(pass, {
      label: "Dismiss",
      className: "claim-pass",
    }),
  );
  bar.append(row);

  if (
    claim !== null &&
    claim.type === "Claim" &&
    claim.kind === "chow" &&
    chowActions().length > 1
  ) {
    const variants = div("claim-variants");
    variants.append(span("claim-label", "Chow"));
    for (const action of chowActions()) variants.append(makeChowVariant(action));
    bar.append(variants);
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
  const element = $("#actions");
  const bar = $("#claim-bar");

  if (claimHeld) {
    // The offer waits for its tile: an empty reserved row reads better than a
    // note about a claim that has not been asked yet.
    bar.hidden = true;
    bar.replaceChildren();
    element.hidden = false;
    element.replaceChildren();
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

function resultScoreTable(outcome) {
  const handKey = `${payload.game}:${payload.view.handNumber}`;
  const applied =
    appliedOutcome !== null && appliedOutcome.key === handKey ? appliedOutcome : null;
  const before = applied?.before ?? zeroScores();
  const after = applied?.after ?? outcome.totals;

  const table = document.createElement("table");
  table.className = "result-score";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Seat", "Before", "Δ", "Now"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.append(th);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const seat of SEATS) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = seatLabel(seat);
    const start = document.createElement("td");
    start.textContent = signed(before[seat] ?? 0);
    const delta = document.createElement("td");
    delta.className = `delta ${changeClass(outcome.totals[seat] ?? 0)}`;
    delta.textContent = signed(outcome.totals[seat] ?? 0);
    const end = document.createElement("td");
    end.className = changeClass(after[seat] ?? 0);
    end.textContent = signed(after[seat] ?? 0);
    row.dataset.seat = seat;
    row.style.setProperty("--seat-color", seatColor(seat));
    if (outcome.kind === "win" && outcome.winner === seat) {
      row.classList.add("is-winner");
    }
    row.append(name, start, delta, end);
    body.append(row);
  }

  // The four deltas close to zero; a total row makes that visible, and a
  // non-zero total would be a ledger bug rather than something to hide.
  const total = totalsSum(outcome.totals);
  const foot = document.createElement("tfoot");
  const footRow = document.createElement("tr");
  footRow.className = "result-total";
  const totalLabel = document.createElement("th");
  totalLabel.colSpan = 2;
  totalLabel.scope = "row";
  totalLabel.textContent = "Total";
  const totalDelta = document.createElement("td");
  totalDelta.className = `delta ${changeClass(total)}${total === 0 ? "" : " is-invalid"}`;
  totalDelta.textContent = signed(total);
  const totalNow = document.createElement("td");
  totalNow.textContent = "";
  totalNow.setAttribute("aria-hidden", "true");
  footRow.append(totalLabel, totalDelta, totalNow);
  foot.append(footRow);

  table.append(head, body, foot);
  return table;
}

function resultPayments(outcome) {
  const list = document.createElement("ul");
  list.className = "result-list result-payments";
  // Fishing is settled independently and gets its own group below.
  const entries = outcome.ledger.filter((entry) => !entry.reason.startsWith("fishing"));
  if (entries.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No payments.";
    list.append(item);
    return list;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const amount = span(
      "result-amount",
      entry.points === null ? "calculate" : String(entry.points),
    );
    const from = seatInSentence(entry.from);
    const verb = entry.from === payload.seat ? "pay" : "pays";
    const text = span(
      "result-entry",
      `${from} ${verb} ${seatInSentence(entry.to)} · ${entry.reason}`,
    );
    item.append(amount, text);
    list.append(item);
  }
  return list;
}

/** Fishing is a mini win: each declaration collects from the other three. */
function resultFishing(outcome) {
  if (outcome.fishing.length === 0) return null;
  const settled = new Map();
  for (const entry of outcome.fishing) {
    const current = settled.get(entry.to) ?? { points: 0, unknown: false };
    if (entry.points === null) current.unknown = true;
    else current.points += entry.points;
    settled.set(entry.to, current);
  }
  const declarations = new Map(payload.view.fishing.map((entry) => [entry.seat, entry]));
  const block = div("result-fishing");
  for (const seat of SEATS) {
    const row = settled.get(seat);
    if (row === undefined) continue;
    const item = div("result-fishing-row");
    item.dataset.seat = seat;
    item.style.setProperty("--seat-color", seatColor(seat));
    const name = span("result-fishing-seat", seatLabel(seat));
    const waits = span("result-fishing-waits");
    const declaration = declarations.get(seat);
    for (const key of declaration?.wait ?? []) waits.append(tileElement(key));
    const value = span(
      "result-fishing-points",
      row.unknown ? "calculate" : signed(row.points),
    );
    const tier = span("result-fishing-tier", tierName(declaration?.tier ?? null) ?? "fishing");
    item.append(name, waits, tier, value);
    item.setAttribute(
      "aria-label",
      `${seatLabel(seat)} fishing on ${(declaration?.wait ?? []).map(tileName).join(", ")}, ` +
        `${tier.textContent}, ${row.unknown ? "calculate" : signed(row.points)}`,
    );
    block.append(item);
  }
  return block;
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
  panel.replaceChildren();
  setTableInert(true);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "outcome-title");
  panel.setAttribute("tabindex", "-1");

  const card = div("result-card");
  const sub = div("result-sub");
  sub.textContent = `Hand ${payload.view.handNumber} · ${payload.view.prevailingWind} round`;
  const title = document.createElement("h2");
  title.id = "outcome-title";
  if (outcome.kind === "drawn") {
    title.textContent = "Hand drawn";
  } else {
    const winner =
      outcome.winner === payload.seat ? "You" : seatLabel(outcome.winner);
    title.textContent =
      `${winner} ${outcome.winner === payload.seat ? "win" : "wins"}`;
  }
  card.append(sub, title);

  if (outcome.kind === "win") {
    const source = div("result-source");
    if (outcome.selfDrawn) source.append(document.createTextNode("Self-drawn"));
    else if (outcome.from === payload.seat) {
      source.append(document.createTextNode("On your discard"));
    } else {
      source.append(document.createTextNode(`On ${seatLabel(outcome.from)}'s discard`));
    }
    if (outcome.winningTile !== null) {
      source.append(span("result-source-sep", "·"), document.createTextNode("winning tile"));
      source.append(tileElement(outcome.winningTile));
    }
    card.append(source);
  } else {
    const reason = div("result-source");
    reason.textContent = outcome.reason;
    card.append(reason);
  }

  if (outcome.kind === "win") {
    const badge = scoreBadge(outcome);
    const patternTitle = document.createElement("h3");
    patternTitle.textContent = "Pattern";
    const pattern = div("result-pattern");
    pattern.append(document.createTextNode(outcome.patternName ?? outcome.patternId ?? "—"));
    const tierBadge = span("tier-badge", badge.text);
    tierBadge.title = badge.note;
    pattern.append(tierBadge);
    if (outcome.points === null) {
      pattern.append(span("result-pattern-note", `· ${badge.note}`));
    }
    card.append(patternTitle, pattern);

    const handTitle = document.createElement("h3");
    handTitle.textContent = "Composed tiles";
    const tiles = composeResultTiles(outcome);
    card.append(handTitle, tiles);
    if (outcome.hand === null) {
      const hidden = div("result-sub");
      hidden.textContent =
        `${outcome.handCount} concealed tiles stay hidden; public melds and the ` +
        "winning tile are shown.";
      card.append(hidden);
    }

    if (outcome.matches.length > 1) {
      const matchesTitle = document.createElement("h3");
      matchesTitle.textContent = "Also matched";
      const matches = document.createElement("ul");
      matches.className = "result-list result-matches";
      for (const match of outcome.matches.slice(1)) {
        const item = document.createElement("li");
        item.textContent = `${match.name} (${match.id})`;
        matches.append(item);
      }
      card.append(matchesTitle, matches);
    }
  }

  const grid = div("result-grid");
  const left = div();
  const right = div();

  const paymentsTitle = document.createElement("h3");
  paymentsTitle.textContent = "Payments";
  left.append(paymentsTitle, resultPayments(outcome));

  const fishing = resultFishing(outcome);
  if (fishing !== null) {
    const fishingTitle = document.createElement("h3");
    fishingTitle.textContent = "Fishing";
    left.append(fishingTitle, fishing);
  }

  const scoreTitle = document.createElement("h3");
  scoreTitle.textContent = "Score";
  right.append(scoreTitle, resultScoreTable(outcome));

  grid.append(left, right);
  card.append(grid);

  if (outcome.unknown > 0) {
    const note = div("result-note");
    note.textContent =
      outcome.unknown === 1
        ? "1 calculate entry is not scored."
        : `${outcome.unknown} calculate entries are not scored.`;
    card.append(note);
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
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld) return;
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
  if (discardQueue.length > 0 || discardTimer !== null || claimHeld) return;
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
