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
const POSITION = { E: "south", S: "east", W: "north", N: "west" };
const WIND_NAME = { E: "East", S: "South", W: "West", N: "North" };
const SUIT_NAME = { b: "bamboo", c: "characters", o: "circles" };
const DRAGON_NAME = { R: "Red", G: "Green", W: "White" };

let payload = null;
let selected = null;
let busy = false;
const logLines = [];

const $ = (selector) => document.querySelector(selector);

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function randomSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `web-${Date.now()}`;
}

/* ---------------------------------------------------------------- tiles */

function tileName(key) {
  const suited = /^([bco])([1-9])$/.exec(key);
  if (suited !== null) return `${suited[2]} ${SUIT_NAME[suited[1]]}`;
  if (/^w[ESWN]$/.test(key)) return `${WIND_NAME[key[1]]} wind`;
  if (/^d[RGW]$/.test(key)) return `${DRAGON_NAME[key[1]]} dragon`;
  if (Object.hasOwn(BONUS_NAMES, key)) return BONUS_NAMES[key];
  return key;
}

function tileElement(key, size = "small") {
  const element = document.createElement("span");
  element.className = `tile tile-${size}`;
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
  element.textContent = logLines.join("\n");
  element.scrollTop = element.scrollHeight;
}

function applyResponse(data, note, replaceLog = false) {
  payload = data;
  if (typeof data.game === "string") {
    sessionStorage.setItem("mahjong-game", data.game);
  }
  if (replaceLog || data.replaceLog === true) logLines.length = 0;
  if (note) log(note);
  if (Array.isArray(data.events)) {
    for (const line of data.events) log(line);
  }
  if (
    selected !== null &&
    (selected >= payload.view.player.hand.length ||
      !payload.legalActions.some((action) => action.type === "Discard"))
  ) {
    selected = null;
  }
  render();
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

function sendAction(action) {
  if (action === null || payload === null) return;
  void request(
    "/api/move",
    { game: payload.game, action },
    action.type === "Pass" ? "You pass." : null,
  );
}

function sendDiscard(tile) {
  const action = payload.legalActions.find(
    (candidate) => candidate.type === "Discard" && candidate.tile === tile,
  );
  if (action === undefined) return false;
  sendAction(action);
  return true;
}

/* -------------------------------------------------------------- render */

function legalAction(type, predicate = () => true) {
  return payload.legalActions.find(
    (action) => action.type === type && predicate(action),
  );
}

function renderMeta() {
  const view = payload.view;
  $("#meta").textContent =
    `Hand ${view.handNumber} · dealer ${view.dealer} · ${view.prevailingWind} round · ` +
    `seed ${payload.seed} · game ${payload.game}`;
}

function renderSeat(entry) {
  const element = $(`#pos-${POSITION[entry.seat]}`);
  element.replaceChildren();

  const head = document.createElement("div");
  head.className = "seat-head";
  const wind = document.createElement("span");
  wind.className = "seat-wind";
  wind.textContent = entry.wind;
  const name = document.createElement("span");
  name.className = "seat-name";
  name.textContent = `${WIND_NAME[entry.wind]} seat`;
  const role = document.createElement("span");
  role.className = "seat-role";
  role.textContent = entry.isYou ? "you" : "bot";
  head.append(wind, name, role);
  if (entry.dealer) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "dealer";
    head.append(badge);
  }
  element.append(head);

  if (!entry.isYou) {
    const concealed = document.createElement("div");
    concealed.className = "concealed";
    concealed.setAttribute("aria-label", `${entry.handCount} concealed tiles`);
    for (let index = 0; index < entry.handCount; index++) {
      const back = document.createElement("span");
      back.className = "tile-back";
      const image = document.createElement("img");
      image.src = BACK_ART_URL;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      back.append(image);
      concealed.append(back);
    }
    const count = document.createElement("span");
    count.className = "concealed-count";
    count.textContent = String(entry.handCount);
    concealed.append(count);
    element.append(concealed);
  }

  if (entry.melds.length > 0) {
    const melds = document.createElement("div");
    melds.className = "tile-row melds";
    for (const meld of entry.melds) {
      const group = document.createElement("span");
      group.className = "meld";
      group.title = `${meld.kind}${meld.exposed ? "" : " (concealed)"}`;
      group.setAttribute("aria-label", `${meld.kind} ${meld.tiles.join(" ")}`);
      for (const key of meld.tiles) group.append(tileElement(key));
      melds.append(group);
    }
    element.append(melds);
  }

  if (entry.discards.length > 0) {
    const discards = document.createElement("div");
    discards.className = "tile-row discards";
    discards.setAttribute("aria-label", `${entry.discards.length} discards`);
    for (const key of entry.discards) discards.append(tileElement(key));
    element.append(discards);
  }

  const bonuses = [...entry.flowers, ...entry.seasons];
  if (bonuses.length > 0) {
    const row = document.createElement("div");
    row.className = "tile-row bonus";
    row.setAttribute("aria-label", "bonus tiles");
    for (const key of bonuses) row.append(tileElement(key));
    element.append(row);
  }
}

function renderTable() {
  for (const entry of payload.table) renderSeat(entry);
}

function renderCenter() {
  const view = payload.view;
  $("#wall-count").textContent = String(view.wallRemaining);
  $("#round-wind").textContent = view.prevailingWind;
  $("#turn-indicator").textContent =
    view.phase === "finished"
      ? "hand finished"
      : `turn: ${view.turn}${view.turn === view.seat ? " (you)" : ""}`;
}

function renderHand() {
  const view = payload.view;
  const hand = view.player.hand;
  const element = $("#hand");
  element.replaceChildren();

  if (hand.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No tiles in hand.";
    element.append(empty);
    return;
  }

  hand.forEach((key, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-tile";
    button.dataset.index = String(index);
    button.title = `${key} — ${tileName(key)}`;
    button.setAttribute(
      "aria-label",
      `Tile ${index + 1}: ${tileName(key)}, key ${key}.`,
    );
    button.append(tileElement(key, "large"));
    const number = document.createElement("span");
    number.className = "tile-number";
    number.textContent = String(index + 1);
    button.append(number);

    if (selected === index) {
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    }
    button.addEventListener("click", () => {
      if (sendDiscard(key)) return;
      selected = index;
      renderHand();
    });
    element.append(button);
  });

  const melds = view.player.melds.length;
  const bonuses = view.player.flowers.length + view.player.seasons.length;
  $("#hand-hint").textContent =
    `${hand.length} tiles · ${melds} ${melds === 1 ? "meld" : "melds"} · ` +
    `${bonuses} ${bonuses === 1 ? "bonus" : "bonuses"}`;
}

function actionLabel(action) {
  switch (action.type) {
    case "Draw":
      return "Draw (d)";
    case "Claim":
      if (action.kind === "mahjong") return "Mahjong! (m)";
      return `${action.kind[0].toUpperCase()}${action.kind.slice(1)} ${action.tiles.join(" ")}`;
    case "DeclareFishing":
      return `Declare fishing (f) — ${action.wait.join(" ")}`;
    case "ConcealedKong":
      return `Concealed kong ${action.tile}`;
    case "AddedKong":
      return `Add to kong ${action.tile}`;
    case "Win":
      return "Mahjong! (m)";
    case "Pass":
      return "Pass (space)";
    default:
      return action.type;
  }
}

function renderActions() {
  const element = $("#actions");
  element.replaceChildren();

  for (const action of payload.legalActions) {
    if (action.type === "Discard") continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action";
    button.textContent = actionLabel(action);
    button.addEventListener("click", () => sendAction(action));
    element.append(button);
  }

  if (element.childElementCount === 0) {
    const waiting = document.createElement("p");
    waiting.className = "hint";
    waiting.textContent = payload.outcome === null ? "Waiting for the table…" : "";
    element.append(waiting);
  }
}

function legalHint() {
  if (payload.outcome !== null) return "";
  const types = new Set(payload.legalActions.map((action) => action.type));
  if (types.has("Win")) return "Press m to declare mahjong, or discard a tile.";
  if (types.has("Draw")) return "Press d or click Draw.";
  if (types.has("Discard")) return "Click a tile, or press 1–9 then Enter.";
  if (types.has("DeclareFishing")) return "Press f to fish, space to pass.";
  if (types.has("Claim")) return "Choose a claim, or press space to pass.";
  if (types.has("Pass")) return "Press space to pass.";
  if (types.has("ConcealedKong") || types.has("AddedKong")) return "A kong is available.";
  return "";
}

function renderStatus() {
  const view = payload.view;
  let text;

  if (payload.outcome !== null) {
    text =
      payload.outcome.kind === "drawn"
        ? "Hand finished — drawn."
        : `Hand finished — ${payload.outcome.winner} won.`;
  } else if (view.turn === view.seat) {
    if (view.phase === "draw") text = "Your turn: draw a tile.";
    else if (view.phase === "discard") text = "Your turn: discard a tile.";
    else if (view.phase === "announce") text = "Fishing offer: declare the wait or pass.";
    else if (view.phase === "claim") {
      const window = view.claimWindow;
      text = window
        ? `Claim window: ${window.discarder} discarded ${window.tile} — claim or pass.`
        : "Claim window — claim or pass.";
    } else text = `Your turn (${view.phase}).`;
  } else if (view.phase === "claim") {
    const window = view.claimWindow;
    text = `${view.turn} is answering the claim${window ? ` on ${window.tile}` : ""}…`;
  } else {
    text = `${view.turn} is deciding (${view.phase})…`;
  }

  const hint = legalHint();
  $("#status").textContent = hint ? `${text} ${hint}` : text;
}

function renderFishing() {
  const view = payload.view;
  $("#fishing").textContent = view.fishing
    .map(
      (entry) =>
        `${entry.seat}${entry.seat === payload.seat ? " (you)" : ""} fishes ` +
        `${entry.wait.join(" ")} — ${entry.tier}`,
    )
    .join(" · ");
}

function renderWaits() {
  const element = $("#waits");
  element.replaceChildren();
  const checker = payload.checker;

  if (checker.size === 13) {
    if (checker.waits.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No catalogue hand completes from these 13 tiles.";
      element.append(empty);
      return;
    }
    for (const wait of checker.waits) {
      const row = document.createElement("div");
      row.className = `wait${wait.dead ? " dead" : ""}`;
      row.append(tileElement(wait.tile));

      const body = document.createElement("div");
      body.className = "wait-body";
      const head = document.createElement("p");
      head.className = "wait-head";
      head.textContent = wait.dead
        ? `${wait.tile} — dead wait`
        : `${wait.tile} — ${wait.remaining} left`;
      const hands = document.createElement("p");
      hands.className = "wait-hands";
      hands.textContent = wait.matches
        .map(
          (match) =>
            `${match.name} (${match.tier}${match.points === null ? "" : ` ${match.points}`})`,
        )
        .join(" · ");
      body.append(head, hands);
      row.append(body);
      element.append(row);
    }
    return;
  }

  if (checker.size === 14) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent =
      checker.matches.length > 0
        ? `Complete hand: ${checker.matches
            .map((match) => `${match.name} (${match.tier})`)
            .join(" · ")}`
        : "14 effective tiles; no catalogue hand yet.";
    element.append(note);
    return;
  }

  const errors = document.createElement("p");
  errors.className = "hint";
  errors.textContent = checker.errors.join(" ");
  element.append(errors);
}

function renderOutcome() {
  const panel = $("#outcome");
  const outcome = payload.outcome;
  panel.hidden = outcome === null;
  panel.replaceChildren();
  if (outcome === null) return;

  const title = document.createElement("h2");
  if (outcome.kind === "drawn") {
    title.textContent = `Drawn hand — ${outcome.reason}`;
  } else {
    const value =
      outcome.points === null
        ? (outcome.tier ?? "unscored")
        : `${outcome.tier ?? "unscored"}, ${outcome.points}`;
    title.textContent =
      `${outcome.winner} wins — ${outcome.patternName ?? outcome.patternId} (${value})`;
  }
  panel.append(title);

  if (outcome.kind === "win") {
    const source = document.createElement("p");
    source.className = "hint";
    source.textContent =
      `${outcome.selfDrawn ? "self-drawn" : `on ${outcome.from}'s discard`} · ` +
      `winning tile ${outcome.winningTile ?? "?"}`;
    panel.append(source);

    const handTitle = document.createElement("h3");
    handTitle.textContent = "Winning hand";
    panel.append(handTitle);

    if (outcome.hand !== null) {
      const row = document.createElement("div");
      row.className = "tile-row";
      for (const key of outcome.hand) row.append(tileElement(key, "large"));
      panel.append(row);
    } else {
      const hidden = document.createElement("p");
      hidden.className = "hint";
      hidden.textContent =
        `${outcome.winner}'s ${outcome.handCount} concealed tiles stay hidden; ` +
        "only the public melds and the winning tile are shown.";
      panel.append(hidden);
    }

    if (outcome.melds !== null && outcome.melds.length > 0) {
      const row = document.createElement("div");
      row.className = "tile-row";
      for (const meld of outcome.melds) {
        for (const key of meld.tiles) row.append(tileElement(key));
      }
      panel.append(row);
    }

    const matchesTitle = document.createElement("h3");
    matchesTitle.textContent = "Patterns matched";
    panel.append(matchesTitle);
    const matches = document.createElement("ul");
    matches.className = "matches";
    if (outcome.matches.length === 0) {
      const item = document.createElement("li");
      item.textContent = "none";
      matches.append(item);
    } else {
      for (const match of outcome.matches) {
        const item = document.createElement("li");
        item.textContent = `${match.name} (${match.id})`;
        matches.append(item);
      }
    }
    panel.append(matches);
  }

  const fishingTitle = document.createElement("h3");
  fishingTitle.textContent = "Fishing settlements";
  panel.append(fishingTitle);
  const settlements = document.createElement("ul");
  settlements.className = "settlements";
  if (outcome.fishing.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No fishing settlements.";
    settlements.append(item);
  } else {
    for (const entry of outcome.fishing) {
      const item = document.createElement("li");
      item.textContent =
        `${entry.from} pays ${entry.to} ` +
        `${entry.points === null ? "calculate" : entry.points} — ${entry.reason}`;
      settlements.append(item);
    }
  }
  panel.append(settlements);

  const totalsTitle = document.createElement("h3");
  totalsTitle.textContent = "Totals";
  panel.append(totalsTitle);
  const totals = document.createElement("p");
  totals.className = "totals";
  totals.textContent =
    SEATS.map((seat) => `${seat} ${signed(outcome.totals[seat])}`).join("   ") +
    (outcome.unknown > 0
      ? `   (${outcome.unknown} calculate entries unscored)`
      : "");
  panel.append(totals);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "action primary";
  next.textContent = "Next hand";
  next.addEventListener("click", () => void request("/api/next", { game: payload.game }));
  panel.append(next);
}

function render() {
  if (payload === null) return;
  renderMeta();
  renderTable();
  renderCenter();
  renderHand();
  renderActions();
  renderStatus();
  renderFishing();
  renderWaits();
  renderOutcome();
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
  const page = $(".page");
  page.replaceChildren();

  const gallery = document.createElement("section");
  gallery.id = "tile-gallery";
  gallery.setAttribute("aria-label", "Tile gallery");

  const head = document.createElement("div");
  head.className = "gallery-head";
  const title = document.createElement("h2");
  title.textContent = "Tile gallery";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "All 34 play tiles and the 8 bonus marks, one SVG per canonical key.";
  head.append(title, hint);
  gallery.append(head);

  for (const group of GALLERY_GROUPS) {
    const section = document.createElement("section");
    section.className = "gallery-group";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "gallery-grid";
    for (const key of group.keys) {
      const figure = document.createElement("figure");
      figure.className = "gallery-tile";
      const caption = document.createElement("figcaption");
      caption.textContent = `${key} · ${tileName(key)}`;
      figure.append(tileElement(key, "large"), caption);
      grid.append(figure);
    }
    section.append(grid);
    gallery.append(section);
  }

  page.append(gallery);
}

/* ------------------------------------------------------------ commands */

function selectTile(index) {
  if (payload === null) return;
  if (index < 0 || index >= payload.view.player.hand.length) {
    log(`There is no tile ${index + 1}.`);
    return;
  }
  selected = index;
  renderHand();
}

function confirmSelection() {
  if (payload === null) return;
  if (selected !== null) {
    const tile = payload.view.player.hand[selected];
    if (tile !== undefined && sendDiscard(tile)) return;
    log("That tile cannot be discarded now.");
    return;
  }
  const draw = legalAction("Draw");
  if (draw !== undefined) {
    sendAction(draw);
    return;
  }
  log("Pick a tile with 1–9 first.");
}

function drawTile() {
  const draw = legalAction("Draw");
  if (draw === undefined) {
    log("It is not your draw.");
    return;
  }
  sendAction(draw);
}

function pass() {
  const action = legalAction("Pass");
  if (action === undefined) {
    log("There is nothing to pass.");
    return;
  }
  sendAction(action);
}

function declareFishing() {
  const action = legalAction("DeclareFishing");
  if (action === undefined) {
    log("Fishing is not legal now.");
    return;
  }
  log(`Fixing the fishing wait on ${action.wait.join(" ")}.`);
  sendAction(action);
}

function declareWin() {
  const action =
    legalAction("Win") ??
    legalAction("Claim", (candidate) => candidate.kind === "mahjong");
  if (action === undefined) {
    log("Mahjong is not legal now.");
    return;
  }
  sendAction(action);
}

function undo() {
  if (payload === null) return;
  void request("/api/undo", { game: payload.game }, null, true);
}

function newGame(seed) {
  void request(
    "/api/new",
    seed === undefined ? {} : { seed },
    (data) => `New game — seed ${data.seed}`,
  );
}

/* -------------------------------------------------------------- events */

function onKeydown(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (document.querySelector("dialog[open]") !== null) return;
  if (payload === null) return;

  const nativeActivation =
    (event.key === "Enter" || event.key === " " || event.key === "Spacebar") &&
    target instanceof HTMLElement &&
    target.closest("button, a, summary") !== null;
  if (nativeActivation) return;

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
    case "d":
    case "D":
      event.preventDefault();
      drawTile();
      break;
    case "m":
    case "M":
      event.preventDefault();
      declareWin();
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

function bindEvents() {
  $("#new-game").addEventListener("click", () => newGame(randomSeed()));
  $("#undo").addEventListener("click", undo);
  $("#help-button").addEventListener("click", openHelp);
  $("#help-dialog").addEventListener("close", () => $("#help-button").focus());
  document.addEventListener("keydown", onKeydown);
}

async function boot() {
  bindEvents();

  if (new URLSearchParams(window.location.search).get("gallery") === "1") {
    renderGallery();
    return;
  }

  const stored = sessionStorage.getItem("mahjong-game");
  if (stored !== null) {
    try {
      const data = await api(`/api/state?game=${encodeURIComponent(stored)}`);
      applyResponse(data, "Resumed the open game.");
      return;
    } catch {
      sessionStorage.removeItem("mahjong-game");
    }
  }

  await newGame();
}

void boot();
