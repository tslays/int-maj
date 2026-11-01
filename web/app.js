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
const STARTING_WALL = 92;
const RIVER_SLOTS = 18;
const RING_RADIUS = 31;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

let payload = null;
let pendingClick = null;
let selected = null;
let cursor = 0;
let busy = false;
let railOpen = true;
let referenceShown = false;
let referenceMissing = false;

let handInitialized = false;
let tableInitialized = false;
let previousHand = [];
let previousDiscards = { E: 0, S: 0, W: 0, N: 0 };
let announced = "";
let focusedOutcomeKey = null;
let focusHandOnRender = false;

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
  if (event.type === "keydown" && (event.key === "m" || event.key === "M")) return;
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
  element.title = `${key} — ${tileName(key)}`;
  element.setAttribute("aria-label", `${tileName(key)}, key ${key}`);

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
  if (typeof data.game === "string") {
    sessionStorage.setItem(GAME_KEY, data.game);
  }
  loadScores(data.game, data.seed);
  settleScores();
  if (replaceLog || data.replaceLog === true) logLines.length = 0;
  if (note) log(note);
  if (Array.isArray(data.events)) {
    for (const line of data.events) log(line);
  }
  selected = null;
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

function sendDiscard(tile) {
  if (payload === null || busy) return false;
  const action = payload.legalActions.find(
    (candidate) => candidate.type === "Discard" && candidate.tile === tile,
  );
  if (action === undefined) return false;
  const index = selected ?? cursor;
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

/** A tier and its printed winner points on one badge; calculate stays a word. */
function scoreBadge(outcome) {
  const tier = tierName(outcome.tier);
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
function fillSeatLabel(slot, entry) {
  slot.style.setProperty("--seat-color", seatColor(entry.seat));
  slot.classList.toggle("is-turn", seatIsTurn(entry.seat));
  slot.setAttribute(
    "aria-label",
    `${entry.isYou ? "You" : `${WIND_NAME[entry.wind]} bot`}, ${entry.wind} wind` +
      `${entry.dealer ? ", dealer" : ""}`,
  );
  const wind = span("seat-wind", entry.wind);
  const name = span("seat-name", entry.isYou ? "You" : `${WIND_NAME[entry.wind]} bot`);
  slot.replaceChildren(wind, name);
}

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
   toward the seat, which is how Tenhou fills the four blocks. */
const RIVER_GRID = {
  bottom: { cols: 6, rows: 3, flat: true, cell: (r, c) => [c, r] },
  top: { cols: 6, rows: 3, flat: true, cell: (r, c) => [5 - c, 2 - r] },
  left: { cols: 3, rows: 6, flat: false, cell: (r, c) => [2 - r, c] },
  right: { cols: 3, rows: 6, flat: false, cell: (r, c) => [r, 5 - c] },
};

function riverWrapper(entry) {
  const place = PLACE[entry.seat];
  const grid = RIVER_GRID[place];
  const river = div(
    `river ${grid.flat ? "river-flat" : "river-side"} river-${place}`,
  );

  const claimWindow = payload.view.claimWindow;
  const last = entry.discards.length - 1;
  const previous = tableInitialized ? (previousDiscards[entry.seat] ?? 0) : entry.discards.length;

  // The reserved block is decided before the first discard. Each screen
  // cell maps back to the throw index that belongs there.
  const cells = new Array(RIVER_SLOTS);
  for (let index = 0; index < RIVER_SLOTS; index++) {
    const [x, y] = grid.cell(Math.floor(index / 6), index % 6);
    cells[y * grid.cols + x] = index;
  }

  for (const index of cells) {
    const slot = div("river-slot");
    const key = index === undefined ? undefined : entry.discards[index];
    if (key !== undefined) {
      const tile = riverTile(key, index === last, index >= previous, entry.seat, claimWindow);
      // The first discard is the block's row flush against the centre; the
      // layout check uses the marker to prove the growth direction.
      if (index === 0) tile.classList.add("first");
      slot.append(tile);
    } else {
      slot.setAttribute("aria-hidden", "true");
    }
    river.append(slot);
  }

  river.setAttribute(
    "aria-label",
    `${entry.isYou ? "Your" : `${WIND_NAME[entry.wind]} seat`} ${entry.discards.length} discards`,
  );
  return river;
}

function riverTile(key, isLast, isNew, seat, claimWindow) {
  const tile = tileElement(key);
  if (isLast) tile.classList.add("last");
  if (
    isLast &&
    claimWindow !== null &&
    claimWindow.discarder === seat &&
    claimWindow.tile === key
  ) {
    tile.classList.add("claimable");
  }
  if (isNew) tile.classList.add("is-new");
  return tile;
}

function renderSeat(entry) {
  const place = PLACE[entry.seat];
  if (place === "bottom") return;

  const root = $(`#seat-${place}`);
  root.className = `seat seat-${place}${seatIsTurn(entry.seat) ? " is-turn" : ""}`;
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

function renderSelf(entry) {
  const slot = $("#self-label");
  fillSeatLabel(slot, entry);
}

function renderRivers() {
  for (const entry of payload.table) {
    const place = PLACE[entry.seat];
    const zone = $(`#river-${place}`);
    if (zone === null) continue;
    zone.replaceChildren(riverWrapper(entry));
  }
}

function renderSeats() {
  for (const entry of payload.table) {
    if (entry.isYou) renderSelf(entry);
    else renderSeat(entry);
  }
  renderRivers();
}

function renderCenter() {
  const view = payload.view;
  $("#wall-count").textContent = String(view.wallRemaining);
  const fraction = Math.max(0, Math.min(1, view.wallRemaining / STARTING_WALL));
  const ring = $("#wall-ring");
  ring.style.strokeDasharray = String(RING_LENGTH);
  ring.style.strokeDashoffset = String(RING_LENGTH * (1 - fraction));
  const dial = $("#wall-dial");
  dial.setAttribute("aria-label", `${view.wallRemaining} tiles left in the wall`);
  dial.title = `${view.wallRemaining} tiles left`;

  const meta = $("#center-meta");
  meta.replaceChildren();
  const round = document.createElement("strong");
  round.textContent = view.prevailingWind;
  const hand = document.createElement("strong");
  hand.textContent = String(view.handNumber);
  meta.append(round, document.createTextNode(" round · hand "), hand);

  const totals = displayTotals();
  const cornerFor = { top: "nw", right: "ne", bottom: "se", left: "sw" };
  const scores = $("#center-scores");
  scores.replaceChildren();
  for (const entry of payload.table) {
    const points = totals[entry.seat] ?? 0;
    const corner = cornerFor[PLACE[entry.seat]];
    const cell = div(
      `center-score corner-${corner}${seatIsTurn(entry.seat) ? " is-turn" : ""}`,
    );
    cell.dataset.seat = entry.seat;
    cell.style.setProperty("--seat-color", seatColor(entry.seat));
    cell.setAttribute(
      "aria-label",
      `${entry.isYou ? "You" : `${WIND_NAME[entry.wind]} bot`}, ` +
        `${points === 0 ? "0" : signed(points)} points` +
        `${entry.dealer ? ", dealer" : ""}`,
    );
    const wind = span("center-wind", entry.wind);
    const value = span("center-points", points === 0 ? "0" : signed(points));
    if (points !== 0) value.classList.add(changeClass(points));
    const dealerMark = span("center-dealer");
    dealerMark.title = entry.dealer ? "Dealer" : "";
    if (!entry.dealer) dealerMark.hidden = true;
    cell.append(wind, value, dealerMark);
    scores.append(cell);
  }
}

function renderHand() {
  const view = payload.view;
  const hand = displayHand();
  const element = $("#hand");
  const hadFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement.classList.contains("hand-tile")
      ? Number(document.activeElement.dataset.index)
      : null;

  if (cursor >= hand.length) cursor = Math.max(0, hand.length - 1);
  element.replaceChildren();
  element.classList.toggle("has-selection", selected !== null);

  if (hand.length === 0) {
    const empty = div("hand-placeholder");
    empty.textContent = "No tiles in hand.";
    element.append(empty);
    return;
  }

  const draw = view.lastDraw;
  const hasDrawn =
    draw !== null &&
    draw.seat === view.seat &&
    view.player.hand.includes(draw.tile);
  const drawnIndex = hasDrawn ? hand.length - 1 : -1;
  if (
    drawnIndex >= 0 &&
    (hand.length > previousHand.length || !handInitialized)
  ) {
    cursor = drawnIndex;
  }

  hand.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-tile";
    button.dataset.index = String(index);
    if (index === cursor) button.dataset.cursor = "true";
    button.tabIndex = index === cursor ? 0 : -1;
    button.title = `${key} — ${tileName(key)}`;
    button.setAttribute(
      "aria-label",
      `Tile ${index + 1}: ${tileName(key)}, key ${key}${
        index === drawnIndex ? ", just drawn" : ""
      }.`,
    );
    if (index === selected) {
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-current", "true");
    }
    if (index === drawnIndex) {
      button.classList.add("is-drawn");
      // The extra tile stands apart from the thirteen instead of carrying a
      // dot or a lift.
      if (index > 0) button.classList.add("is-drawn-gap");
    }
    if (
      handInitialized &&
      drawnIndex >= 0 &&
      index === drawnIndex &&
      hand.length > previousHand.length
    ) {
      button.classList.add("is-new");
    }

    button.append(tileElement(key));

    button.addEventListener("click", () => onHandClick(index));
    button.addEventListener("focus", () => {
      cursor = index;
      syncCursorDom();
    });
    element.append(button);
  });

  if (hadFocus !== null) {
    const button = element.querySelector(`.hand-tile[data-index="${Math.min(hadFocus, hand.length - 1)}"]`);
    if (button instanceof HTMLElement) button.focus({ preventScroll: true });
  }
  updateDiscardHint();
}

function updateDiscardHint() {
  if (payload === null) return;
  const button = document.querySelector('.action-button[data-action="discard"]');
  if (button === null) return;
  const index = selected ?? cursor;
  const tile = displayHand()[index];
  if (tile === undefined) return;
  const label = `Discard ${tileName(tile)} (tile ${index + 1})`;
  button.title = label;
  button.setAttribute("aria-label", label);
  const art = button.querySelector(".tile");
  if (art !== null) art.replaceWith(tileElement(tile));
}

function syncCursorDom() {
  const buttons = document.querySelectorAll(".hand-tile");
  buttons.forEach((button, index) => {
    button.tabIndex = index === cursor ? 0 : -1;
    if (index === cursor) button.dataset.cursor = "true";
    else delete button.dataset.cursor;
  });
  updateDiscardHint();
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
  { primary = false, label = "", tiles = null, keycap = "", className = "" } = {},
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    `claim-button${primary ? " primary" : ""}${className ? ` ${className}` : ""}`;
  if (label) button.append(document.createTextNode(label));
  if (tiles !== null) {
    for (const key of tiles) button.append(tileElement(key));
  }
  if (keycap) {
    const key = document.createElement("kbd");
    key.textContent = keycap;
    button.append(key);
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
  variant.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      event.stopPropagation();
      sendAction(action);
    }
  });
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
        keycap: "enter",
      }),
    );
  }
  row.append(
    makeClaimButton(pass, {
      label: "Dismiss",
      keycap: "space",
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

  // The turn's one obvious action: throw the tile under the keyboard cursor.
  // A click on the hand does the same thing; this makes the action nameable.
  if (view.phase === "discard" && view.turn === view.seat) {
    const index = selected ?? cursor;
    const tile = displayHand()[index];
    if (tile !== undefined) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = "discard";
      button.className = "action-button primary discard-action";
      button.append(tileElement(tile));
      button.append(document.createTextNode("Discard"));
      const key = document.createElement("kbd");
      key.textContent = "enter";
      button.append(key);
      button.addEventListener("click", () => discardCandidate());
      column.append(button);
    }
  }

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
    const key = document.createElement("kbd");
    key.textContent = actionKeycap(action);
    if (actionKeycap(action)) button.append(key);
    button.addEventListener("click", () => sendAction(action));
    column.append(button);
  });
  element.append(column);
  updateDiscardHint();
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
  const key = document.createElement("kbd");
  key.textContent = "enter";
  next.append(key);
  next.addEventListener("click", () => {
    focusHandOnRender = true;
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

function render() {
  if (payload === null) return;
  $("#board").classList.toggle("is-claiming", isOwnClaimWindow());
  renderMeta();
  renderSeats();
  renderCenter();
  renderHand();
  renderOwnMelds();
  renderOwnBonus();
  renderActions();
  renderScorecard();
  renderTurn();
  renderWaits();
  renderFishing();
  renderOutcome();

  if (focusHandOnRender) {
    focusHandOnRender = false;
    if (payload.outcome === null) focusHand(cursor);
  }

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

/* ------------------------------------------------------------- commands */

function focusHand(index) {
  const button = document.querySelector(`#hand .hand-tile[data-index="${index}"]`);
  if (button instanceof HTMLElement) button.focus({ preventScroll: true });
}

function onHandClick(index) {
  if (payload === null) return;
  // A click that lands while a request is in flight (the automatic draw) is
  // remembered and applied the moment the table answers, so a fast click is
  // never swallowed.
  if (busy) {
    pendingClick = index;
    return;
  }
  if (index < 0 || index >= displayHand().length) return;
  cursor = index;
  selected = index;
  // A click throws the tile: nothing about a mahjong hand needs a two-step
  // "select, then confirm" gesture. Keyboard keeps Enter for the same act.
  if (isYourDiscardPhase()) {
    discardSelected();
    return;
  }
  renderHand();
  focusHand(index);
}

function selectTile(index) {
  if (payload === null || busy) return;
  if (index < 0 || index >= displayHand().length) {
    log(`There is no tile ${index + 1}.`);
    return;
  }
  selected = index;
  cursor = index;
  renderHand();
  focusHand(index);
}

function clearSelection() {
  selected = null;
  renderHand();
}

function discardSelected() {
  if (payload === null || busy) return;
  if (selected === null) {
    log("Pick a tile with 1–9 first.");
    return;
  }
  const tile = displayHand()[selected];
  if (tile !== undefined && sendDiscard(tile)) return;
  log("That tile cannot be discarded now.");
}

function discardCandidate() {
  if (payload === null || busy) return;
  if (selected !== null) {
    discardSelected();
    return;
  }
  if (!isYourDiscardPhase()) return;
  const tile = displayHand()[cursor];
  if (tile !== undefined && sendDiscard(tile)) return;
  log("That tile cannot be discarded now.");
}

function confirmSelection() {
  if (payload === null || busy) return;
  if (!document.getElementById("outcome").hidden) {
    document.getElementById("result-next")?.click();
    return;
  }
  // The announce turn has exactly one primary action: fix the wait.
  if (payload.view.phase === "announce" && payload.view.turn === payload.seat) {
    declareFishing();
    return;
  }
  if (selected !== null) {
    discardSelected();
    return;
  }
  const win = legalAction("Win");
  if (win !== undefined) {
    sendAction(win);
    return;
  }
  const draw = legalAction("Draw");
  if (draw !== undefined) {
    sendAction(draw);
    return;
  }
  if (isYourDiscardPhase()) {
    discardCandidate();
    return;
  }
  log("Pick a tile with 1–9 first.");
}

function moveCursor(delta) {
  if (payload === null) return;
  const hand = displayHand();
  if (hand.length === 0) return;
  cursor = (cursor + delta + hand.length) % hand.length;
  syncCursorDom();
  focusHand(cursor);
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
  selected = null;
  revertScores();
  focusHandOnRender = true;
  void request("/api/undo", { game: payload.game }, null, true);
}

function newGame(seed) {
  selected = null;
  cursor = 0;
  handInitialized = false;
  tableInitialized = false;
  previousHand = [];
  previousDiscards = { E: 0, S: 0, W: 0, N: 0 };
  announced = "";
  focusedOutcomeKey = null;
  focusHandOnRender = true;
  void request(
    "/api/new",
    seed === undefined ? {} : { seed },
    (data) => `New game — seed ${data.seed}`,
  );
}

/* --------------------------------------------------------------- events */

function onKeydown(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (document.querySelector("dialog[open]") !== null) return;

  // The overlay is a debug view, so it stays reachable in every table state.
  if (event.key === "o" || event.key === "O") {
    event.preventDefault();
    toggleReference();
    return;
  }

  if (payload === null) return;

  if (event.key === "m" || event.key === "M") {
    event.preventDefault();
    toggleMute();
    return;
  }

  const isHand = target instanceof HTMLElement && target.closest(".hand-tile") !== null;
  const isButton =
    target instanceof HTMLElement &&
    target.closest("button, a, summary") !== null;
  const passOffered = payload.legalActions.some((action) => action.type === "Pass");
  const nativeActivation =
    (event.key === "Enter" || event.key === " " || event.key === "Spacebar") &&
    isButton &&
    !isHand &&
    !(event.key !== "Enter" && passOffered);
  if (nativeActivation) return;

  const outcomeOpen = !document.getElementById("outcome").hidden;
  if (outcomeOpen) {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("result-next")?.click();
    } else if (event.key === "u" || event.key === "U") {
      event.preventDefault();
      undo();
    } else if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      newGame(randomSeed());
    } else if (event.key === "?") {
      event.preventDefault();
      openHelp();
    }
    return;
  }

  if (isOwnClaimWindow()) {
    const key = event.key;
    if (key === "Enter") {
      event.preventDefault();
      claimBest();
      return;
    }
    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      pass();
      return;
    }
    // n, u and ? keep working; every other key is swallowed while the
    // claim is open. There are no p/c/k/m or chow-number shortcuts.
    if (!["n", "N", "u", "U", "?"].includes(key)) return;
  }

  switch (event.key) {
    case "?":
      event.preventDefault();
      openHelp();
      break;
    case "n":
    case "N":
      event.preventDefault();
      newGame(randomSeed());
      break;
    case "u":
    case "U":
      event.preventDefault();
      undo();
      break;
    case "f":
    case "F":
      event.preventDefault();
      declareFishing();
      break;
    case " ":
    case "Spacebar":
      event.preventDefault();
      pass();
      break;
    case "Enter":
      event.preventDefault();
      confirmSelection();
      break;
    case "ArrowLeft":
    case "ArrowUp":
      event.preventDefault();
      moveCursor(-1);
      break;
    case "ArrowRight":
    case "ArrowDown":
      event.preventDefault();
      moveCursor(1);
      break;
    case "Home":
      event.preventDefault();
      moveCursor(-cursor);
      break;
    case "End":
      event.preventDefault();
      moveCursor(displayHand().length - 1 - cursor);
      break;
    case "Escape":
      selected = null;
      renderHand();
      break;
    default:
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        selectTile(Number(event.key) - 1);
      }
  }
}

function openHelp() {
  const dialog = $("#help-dialog");
  if (!dialog.open) dialog.showModal();
}

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

function toggleReference() {
  referenceShown = !referenceShown;
  applyReference();
}

function setRail(open) {
  railOpen = open;
  applyRail();
  persistRail();
}

function bindEvents() {
  $("#new-game").addEventListener("click", () => newGame(randomSeed()));
  $("#undo").addEventListener("click", undo);
  $("#help-button").addEventListener("click", openHelp);
  $("#rail-hide").addEventListener("click", () => setRail(false));
  $("#rail-show").addEventListener("click", () => setRail(true));
  $("#help-dialog").addEventListener("close", () => $("#help-button").focus());
  document.addEventListener("keydown", onKeydown);
  const overlay = $("#reference-overlay");
  overlay.addEventListener("load", applyReference);
  overlay.addEventListener("error", applyReference);
  window.addEventListener("pointerdown", unlockAudio, { capture: true });
  window.addEventListener("keydown", unlockAudio, { capture: true });
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
  referenceShown = new URLSearchParams(window.location.search).get("overlay") === "1";
  applyReference();

  if (new URLSearchParams(window.location.search).get("gallery") === "1") {
    renderGallery();
    return;
  }

  const stored = sessionStorage.getItem(GAME_KEY);
  if (stored !== null) {
    try {
      const data = await api(`/api/state?game=${encodeURIComponent(stored)}`);
      applyResponse(data, "Resumed the open game.");
      return;
    } catch {
      sessionStorage.removeItem(GAME_KEY);
    }
  }

  await newGame();
}

void boot();
