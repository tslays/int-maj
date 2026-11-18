/**
 * Playing with friends (docs/MULTIPLAYER.md, M3): the room sheet, the
 * connection to the room, and the pill that says whose turn it is.
 *
 * A room is one table on the server (`/api/room/<code>`, a WebSocket). It
 * pushes this phone a payload for its own seat after every change; each one
 * goes through the same `apply` and `run` as a local answer, so the board, the
 * hints and the result screen work as they do against the bots. Your moves go
 * up the socket (`send`), and the table moves when the room answers.
 *
 * The room and your seat token are kept in localStorage, so a reload or a
 * dropped connection takes the same seat back. Rejoining is the only way back
 * to a seat: there are no accounts.
 */

import { houseRules } from "./options.js";
import { $, state, storage, toast } from "./shared.js";

const SAVE_KEY = "int-maj:room";
const NAME_KEY = "int-maj:name";
const CODE = /^[ACDEFGHJKMNPQRTUVWXY34679]{4}$/;
const PING_MS = 25_000;
/** Reconnect after 1, 2, 4 ... seconds, at most 15. */
const retryDelay = (attempt) => Math.min(15_000, 1000 * 2 ** attempt);

let hooks = null;
let socket = null;
/** `{ code, token, name }` of the room this phone sits in, or null. */
let seat = null;
let lobby = null;
let you = null;
let attempt = 0;
let everOpened = false;
let pinger = null;
let lastStamp = null;
/** Pushes are applied one at a time, in order, each after the last animation. */
let queue = Promise.resolve();
/** The payload a move was sent for: one move per position, never two. */
let sentFor = null;
/** Next hand asked for; the result card stays down until the room deals. */
let waitingNext = false;
let clock = null;

function read(key) {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, value);
  } catch {
    // Private mode: the room still plays, a reload just cannot rejoin.
  }
}

function savedSeat() {
  try {
    const value = JSON.parse(read(SAVE_KEY) ?? "null");
    return value !== null && CODE.test(value.code) && typeof value.token === "string" ? value : null;
  } catch {
    return null;
  }
}

export function isOnline() {
  return seat !== null && state.online === true;
}

/** Waiting for the others to ask for the next hand. */
export function awaitingNextHand() {
  return waitingNext;
}

/** Send one of your decisions; the room's answer moves the table. */
export function sendAction(action) {
  if (sentFor === state.payload) return;
  sentFor = state.payload;
  send({ type: "act", action });
}

export function askNextHand() {
  waitingNext = true;
  send({ type: "next" });
  showStatus();
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  else toast("Not connected; trying again");
}

/* --------------------------------------------------------- connection */

function connect() {
  if (seat === null) return;
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${scheme}//${window.location.host}/api/room/${seat.code}`);
  socket = ws;
  showStatus();
  ws.addEventListener("open", () => {
    everOpened = true;
    attempt = 0;
    ws.send(JSON.stringify({ type: "join", name: seat.name, ...(seat.token ? { token: seat.token } : {}) }));
    clearInterval(pinger);
    pinger = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), PING_MS);
    showStatus();
  });
  ws.addEventListener("message", (event) => receive(event.data));
  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    clearInterval(pinger);
    socket = null;
    if (seat === null) return;
    if (!everOpened) {
      // The room never answered: it is closed, or the code is wrong.
      toast(`Room ${seat.code} is not open`);
      forget();
      hooks.leftRoom();
      return;
    }
    showStatus();
    setTimeout(connect, retryDelay(attempt++));
  });
}

function receive(data) {
  let message;
  try {
    message = JSON.parse(data);
  } catch {
    return;
  }
  if (message.type === "seated") {
    you = message.seat;
    seat = { ...seat, token: message.token };
    write(SAVE_KEY, JSON.stringify(seat));
    return;
  }
  if (message.type === "error") {
    sentFor = null;
    toast(message.error);
    return;
  }
  if (message.type === "left") {
    forget();
    hooks.leftRoom();
    return;
  }
  if (message.type !== "room") return;
  lobby = message.room;
  renderLobby();
  showStatus();
  if (message.state === null) return;
  // A change of seats or settings alone moves nothing on the table.
  if (state.online === true && lobby.stamp === lastStamp && message.events.length === 0) return;
  const first = state.online !== true;
  const dealt = !first && state.payload !== null && message.state.view.handNumber !== state.payload.view.handNumber;
  lastStamp = lobby.stamp;
  const payload = { ...message.state, game: `room:${lobby.code}`, events: message.events };
  queue = queue.then(async () => {
    if (first) {
      // The phone's own game stops at its next step; the room takes the table after it.
      state.online = true;
      while (state.busy) await new Promise((resolve) => setTimeout(resolve, 50));
      hooks.enterRoom();
    }
    if (dealt) waitingNext = false;
    state.api.remember(payload.game, payload.view);
    sentFor = null;
    await hooks.apply(payload, first || dealt ? { animated: false, opening: dealt } : {});
    if (first) $("#room-sheet").hidden = true;
    showStatus();
    void hooks.run();
  }).catch((error) => toast(error.message));
}

function join(code, name) {
  write(NAME_KEY, name);
  const saved = savedSeat();
  seat = { code, name, token: saved?.code === code ? saved.token : "" };
  write(SAVE_KEY, JSON.stringify(seat));
  everOpened = false;
  attempt = 0;
  lastStamp = null;
  connect();
}

function forget() {
  seat = null;
  lobby = null;
  you = null;
  waitingNext = false;
  lastStamp = null;
  write(SAVE_KEY, null);
  const ws = socket;
  socket = null;
  ws?.close();
  clearInterval(pinger);
  showStatus();
  renderLobby();
}

/** Leave the room for good: the seat goes to a bot, the phone back to its own game. */
export function leaveRoom() {
  if (seat === null) return;
  if (socket?.readyState === WebSocket.OPEN) socket.send('{"type":"leave"}');
  forget();
  state.online = false;
}

/* --------------------------------------------------------- the sheet */

function openSheet(prefill = "") {
  $("#room-name").value = read(NAME_KEY) ?? "";
  $("#room-code").value = prefill;
  renderLobby();
  $("#room-sheet").hidden = false;
}

function renderLobby() {
  const inRoom = seat !== null && lobby !== null;
  $("#room-start-view").hidden = inRoom;
  $("#room-lobby-view").hidden = !inRoom;
  if (!inRoom) return;
  $("#room-code-text").textContent = lobby.code;
  const list = $("#room-seats");
  list.replaceChildren(
    ...lobby.seats.map((entry) => {
      const item = document.createElement("li");
      item.className = `room-seat${entry.name === null ? " room-bot" : ""}${entry.connected ? "" : " room-away"}`;
      const name = document.createElement("b");
      name.textContent = entry.name ?? "Bot";
      const note = document.createElement("small");
      note.textContent =
        entry.seat === you ? "you" : entry.name === null ? "plays the empty seat" : entry.connected ? "here" : "away: a bot plays for now";
      item.append(name, note);
      return item;
    }),
  );
  const timer = lobby.settings.turnSeconds;
  for (const button of document.querySelectorAll("#room-timer button")) {
    const on = String(timer) === button.dataset.seconds;
    button.classList.toggle("on", on);
    button.setAttribute("aria-checked", String(on));
  }
  $("#room-start").hidden = lobby.started;
  $("#room-timer-row").hidden = lobby.started;
  $("#room-back").hidden = !lobby.started;
}

async function createRoom() {
  const name = $("#room-name").value.trim();
  $("#room-create").disabled = true;
  try {
    const answer = await fetch("/api/room/new", { method: "POST" });
    const body = await answer.json().catch(() => ({}));
    if (!answer.ok) throw new Error(body.error ?? "Rooms are not available here");
    join(body.code, name);
  } catch (error) {
    toast(error.message === "Failed to fetch" ? "No connection" : error.message);
  } finally {
    $("#room-create").disabled = false;
  }
}

async function share() {
  const url = `${window.location.origin}${window.location.pathname}?room=${lobby.code}`;
  try {
    if (navigator.share) await navigator.share({ text: `Join my mahjong table: room ${lobby.code}`, url });
    else {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    }
  } catch {
    // Share sheet closed.
  }
}

/* --------------------------------------------------------- whose turn */

function showStatus() {
  const pill = $("#room-status");
  clearInterval(clock);
  if (seat === null) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  const name = (who) => lobby?.seats.find((entry) => entry.seat === who)?.name ?? "Bot";
  if (socket === null || socket.readyState !== WebSocket.OPEN) {
    pill.textContent = `Room ${seat.code} · reconnecting…`;
    return;
  }
  const waiting = lobby?.waitingOn ?? null;
  if (waitingNext) {
    pill.textContent = "Waiting for the others…";
    return;
  }
  if (waiting === null || !waiting.human) {
    pill.textContent = `Room ${seat.code}`;
    return;
  }
  const seconds = lobby.settings.turnSeconds;
  const label = waiting.seat === you ? "Your turn" : `${name(waiting.seat)}'s turn`;
  if (seconds === null) {
    pill.textContent = label;
    return;
  }
  const ends = Date.now() + seconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
    pill.textContent = `${label} · ${left}s`;
    pill.classList.toggle("room-hurry", waiting.seat === you && left <= 10);
  };
  tick();
  clock = setInterval(tick, 1000);
}

/* --------------------------------------------------------- install */

/**
 * `hooks.apply` and `hooks.run` drive the table; `enterRoom` clears the local
 * game off it, `leftRoom` puts the phone's own game back.
 * Returns true when the page takes a seat back (a reload in a room): the
 * phone's own game then stays off the table.
 */
export function installOnline(next) {
  hooks = next;
  $("#room-open").addEventListener("click", () => {
    $("#options-sheet").hidden = true;
    openSheet();
  });
  $("#room-close").addEventListener("click", () => ($("#room-sheet").hidden = true));
  $("#room-back").addEventListener("click", () => ($("#room-sheet").hidden = true));
  $("#room-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) $("#room-sheet").hidden = true;
  });
  $("#room-create").addEventListener("click", () => void createRoom());
  $("#room-join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = $("#room-code").value.trim().toUpperCase();
    if (!CODE.test(code)) {
      toast("A room code is four letters");
      return;
    }
    join(code, $("#room-name").value.trim());
  });
  $("#room-share").addEventListener("click", () => void share());
  $("#room-start").addEventListener("click", () => {
    send({ type: "configure", settings: { houseRules: houseRules() } });
    send({ type: "start" });
  });
  for (const button of document.querySelectorAll("#room-timer button")) {
    button.addEventListener("click", () => {
      const seconds = button.dataset.seconds === "null" ? null : Number(button.dataset.seconds);
      send({ type: "configure", settings: { turnSeconds: seconds } });
    });
  }
  $("#room-leave").addEventListener("click", () => {
    $("#room-sheet").hidden = true;
    const wasPlaying = state.online === true;
    leaveRoom();
    if (wasPlaying) hooks.leftRoom();
  });

  const linked = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? null;
  const saved = savedSeat();
  if (linked !== null && CODE.test(linked)) {
    window.history.replaceState(null, "", window.location.pathname);
    if (saved?.code !== linked) {
      // A shared link: ask for a name first; the phone's own game waits underneath.
      openSheet(linked);
      return false;
    }
  }
  if (saved !== null) {
    join(saved.code, saved.name);
    return true;
  }
  return false;
}
