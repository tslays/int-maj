/**
 * The closest-hands panel (top right), the hand sheet behind it and the
 * Hints toggle in the menu. The hand sheet also serves the index of all
 * hands (`handbook.js`), and is where a hand is pinned: a pinned hand takes
 * the panel's first place, the next pin the second, and what the bots'
 * planner suggests fills the places left (`pins.js`).
 */

import { bookPages, visibleSamples } from "./pages.js";
import { createPins, MAX_PINS } from "./pins.js";
import { $, companionRules, faceChip, request, showToggle, state, storage } from "./shared.js";

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
let hintsFor = null; // the tiles and pins the panel was last built for

const pins = createPins(storage());
const pinListeners = [];

/** The pinned hands of the game on the table; none before a game. */
function pinsNow() {
  return state.payload === null ? [] : pins.list(state.payload.game);
}

export function isPinned(pattern) {
  return state.payload !== null && pins.has(state.payload.game, pattern);
}

/** Call `listener` whenever a hand is pinned or unpinned. */
export function onPinsChange(listener) {
  pinListeners.push(listener);
}

/**
 * The panel, top right: your pinned hands, then the catalogue hands your
 * tiles are nearest to. Asked for when your own tiles or your pins change and
 * at each of your decisions (the tiles in sight change too), never on a bot's
 * beat alone. With Hints off only the pinned hands show: they are your choice.
 */
export async function refreshHints(force = false) {
  const panel = $("#closest");
  const mine = pinsNow();
  if (
    (!hintsOn && mine.length === 0) ||
    state.payload === null ||
    state.payload.outcome !== null ||
    state.payload.view.phase === "finished"
  ) {
    // A sheet opened from the panel goes with it; one opened from the index stays.
    if (!panel.hidden) closeHandDetail();
    panel.hidden = true;
    hintsFor = null;
    return;
  }
  const player = state.payload.view.player;
  const melds = player.melds.map((meld) => meld.tiles.join()).join("/");
  const key = `${state.payload.game}|${player.hand.join()}|${melds}|${mine.join()}|${hintsOn}`;
  if (!force && key === hintsFor) return;
  hintsFor = key;
  try {
    // The places the pins leave are the suggestions'.
    const room = Math.max(1, MAX_PINS - mine.length);
    const answer = await request(
      `/api/closest?game=${encodeURIComponent(state.payload.game)}&limit=${room}&pins=${encodeURIComponent(mine.join())}`,
    );
    if (hintsFor !== key) return;
    if (!hintsOn && answer.pinned.length === 0) panel.hidden = true;
    else renderHints(hintsOn ? answer.hands.slice(0, room) : [], answer.pinned);
  } catch {
    panel.hidden = true;
  }
}

export const TIER_LABEL = {
  half: "Half limit",
  limit: "Limit",
  middle: "Middle limit",
  double: "Double limit",
  calculate: "Calculated score",
};

export function worth(tier, points) {
  return points === null ? TIER_LABEL[tier] : `${TIER_LABEL[tier]} · ${points.toLocaleString("en")}`;
}

/**
 * Open eye: exposed melds are fine. Closed eye: concealed only. Drawn in
 * the text colour so it stays quiet; the words appear on the hand's sheet.
 */
export function playIcon(concealedOnly) {
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

/** A drawing pin: the mark of a pinned hand. */
export function pinIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "play-icon pin-icon");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M9 3h6l-1 6 3.5 3.5V14h-11v-1.5L10 9z", "M12 14v7"]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** One row of the panel: a hand, how far it is, and its icon. `hand` is null for a pinned hand out of reach. */
function hintRow(hand, { name: label, pinned }) {
  const item = document.createElement("li");
  const row = document.createElement("button");
  row.type = "button";
  row.className = "closest-item";
  const away = hand === null;
  const play = away ? null : hand.concealedOnly;
  row.title = away
    ? "More than six tiles away, or no longer possible with the tiles in sight or your exposed melds"
    : hand.concealedOnly
      ? "Concealed only"
      : "Exposed melds allowed";
  row.setAttribute(
    "aria-label",
    `${pinned ? "Pinned: " : ""}${label}${
      away ? ", out of reach" : `, ${hand.concealedOnly ? "concealed only" : "exposed melds allowed"}`
    }. Tap for details.`,
  );
  const name = document.createElement("span");
  name.className = "closest-name";
  if (pinned) name.append(pinIcon());
  name.append(label);
  const meta = document.createElement("span");
  meta.className = "closest-meta";
  const progress = document.createElement("span");
  if (away) {
    progress.textContent = "Out of reach";
  } else {
    const value = hand.points === null ? "calculated" : hand.points.toLocaleString("en");
    if (hand.away === 0) {
      const done = document.createElement("span");
      done.className = "closest-done";
      done.textContent = "Complete";
      progress.append(done, ` · ${value}`);
    } else {
      progress.textContent = `${hand.away} to go · ${value}`;
    }
  }
  meta.append(progress);
  if (play !== null) meta.append(playIcon(play));
  row.append(name, meta);
  return { item, row };
}

function renderHints(hands, pinned) {
  const panel = $("#closest");
  const title = document.createElement("p");
  title.className = "closest-title";
  title.textContent = pinned.length === 0 ? "Closest hands" : hands.length === 0 ? "Pinned hands" : "Pinned and closest";
  if (hands.length === 0 && pinned.length === 0) {
    const empty = document.createElement("p");
    empty.className = "closest-empty";
    empty.textContent = "Nothing within six tiles yet.";
    panel.replaceChildren(title, empty);
    panel.hidden = false;
    return;
  }
  const list = document.createElement("ol");
  const rows = [
    ...pinned.map((entry) => ({ pattern: entry.pattern, hand: entry.hand, name: entry.name, pinned: true })),
    ...hands.map((hand) => ({ pattern: hand.pattern, hand, name: hand.name, pinned: false })),
  ];
  for (const entry of rows) {
    const { item, row } = hintRow(entry.hand, entry);
    row.addEventListener("click", () => void openHandDetail(entry.pattern, entry.hand));
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

/** A card the book prints in place of a tile, such as "Any tile paired". */
function anyChip(words) {
  const chip = document.createElement("span");
  chip.className = "chip chip-any";
  chip.textContent = words;
  return chip;
}

/** One printed picture: the book's tiles in the book's order and grouping. */
function sampleFigure(sample) {
  const figure = document.createElement("figure");
  figure.className = "detail-sample";
  const tiles = document.createElement("div");
  tiles.className = "sample-tiles";
  for (const group of sample.groups) {
    const set = document.createElement("span");
    set.className = "sample-group";
    for (const tile of group) set.append(typeof tile === "string" ? faceChip(tile) : anyChip(tile.any));
    tiles.append(set);
  }
  const caption = document.createElement("figcaption");
  const where = sample.sources.map((source) => `${source.book.includes("Companion") ? "Companion" : "Illustrated"} p. ${source.page}`);
  caption.textContent = (sample.label === null ? where : [sample.label, ...where]).join(" \u00b7 ");
  figure.append(tiles, caption);
  for (const text of sample.notes) {
    const note = document.createElement("p");
    note.className = "sample-note";
    note.textContent = text;
    figure.append(note);
  }
  return figure;
}

function sampleSection(samples, pages) {
  const companionOnly = companionRules();
  const wrap = document.createElement("div");
  wrap.className = "detail-samples";
  if (samples.length === 0) {
    const none = document.createElement("p");
    none.className = "detail-muted";
    none.textContent = companionOnly
      ? `The Companion lists this hand (${bookPages(pages, true)}) without a picture.`
      : `The books list this hand (${bookPages(pages)}) without a picture.`;
    wrap.append(none);
  }
  for (const sample of samples) wrap.append(sampleFigure(sample));
  return wrap;
}

/**
 * The icon button, top right of a hand's sheet, that pins the hand to the
 * panel or unpins it. `null` before a game (pins belong to a game). A fourth
 * pin is not taken: the button stays but says so when tapped (`note`), and
 * unpinning one frees a place.
 */
function pinControl(pattern) {
  if (state.payload === null) return null;
  const game = state.payload.game;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pin-button";
  const note = document.createElement("p");
  note.className = "detail-muted pin-note";
  note.setAttribute("role", "status");
  note.hidden = true;
  const show = () => {
    const pinned = pins.has(game, pattern);
    const blocked = !pinned && pins.full(game);
    const words = pinned ? "Unpin from hints" : "Pin to hints";
    button.replaceChildren(pinIcon());
    button.setAttribute("aria-label", words);
    button.title = blocked ? `All ${MAX_PINS} pins are in use` : words;
    button.setAttribute("aria-pressed", String(pinned));
    button.classList.toggle("is-blocked", blocked);
    return blocked;
  };
  button.addEventListener("click", () => {
    if (show()) {
      note.textContent = `All ${MAX_PINS} pins are in use. Unpin a hand to pin this one.`;
      note.hidden = false;
      return;
    }
    note.hidden = true;
    pins.toggle(game, pattern);
    show();
    for (const listener of pinListeners) listener();
    void refreshHints(true);
  });
  show();
  return { button, note };
}

/** A small value chip: a muted label and the words. */
function factChip(label, words) {
  const chip = document.createElement("span");
  chip.className = "detail-fact";
  if (label !== null) {
    const tag = document.createElement("small");
    tag.textContent = label;
    chip.append(tag);
  }
  chip.append(words);
  return chip;
}

/**
 * The sheet for one hand. `progress` is the hand's closest-hands entry (how
 * many tiles away, which ones), or null when the hand is out of reach or no
 * hand is being played.
 */
export async function openHandDetail(pattern, progress = null) {
  let detail;
  try {
    detail = await request(`/api/hand?pattern=${encodeURIComponent(pattern)}`);
  } catch {
    return;
  }
  const sheet = $("#hand-detail");
  const card = document.createElement("div");
  card.className = "detail-card hand-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", detail.name);

  // Top row: the name, then the pin and the close cross at the right.
  const close = document.createElement("button");
  close.type = "button";
  close.className = "detail-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "\u00d7";
  close.addEventListener("click", closeHandDetail);
  const heading = document.createElement("h2");
  heading.textContent = detail.name;
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const pin = pinControl(pattern);
  if (pin !== null) actions.append(pin.button);
  actions.append(close);
  const head = document.createElement("div");
  head.className = "detail-head";
  head.append(heading, actions);

  // How it is played and what it pays, in one row of chips. The play chip
  // opens the long explanation, which a player needs once and then knows.
  const rule = document.createElement("button");
  rule.type = "button";
  rule.className = "detail-fact detail-rule";
  rule.setAttribute("aria-expanded", "false");
  rule.setAttribute("aria-controls", "hand-rule-note");
  const ruleChevron = document.createElement("span");
  ruleChevron.className = "rule-chevron";
  ruleChevron.setAttribute("aria-hidden", "true");
  rule.append(playIcon(detail.concealedOnly), detail.concealedOnly ? "Concealed only" : "Exposed allowed", ruleChevron);
  const ruleNote = document.createElement("p");
  ruleNote.className = "detail-note";
  ruleNote.id = "hand-rule-note";
  ruleNote.hidden = true;
  ruleNote.textContent =
    (detail.concealedOnly
      ? "Build it entirely from your own tiles. Do not call Pung, Kong or Chow on a discard: " +
        "one exposed meld and this hand is gone. You may still win on a discard."
      : "You may call discards to make exposed melds and still win this hand, " +
        "though it pays less than playing it concealed.") +
    (detail.requiresSelfDrawn ? " Self-drawn: every tile, the winning one included, must come from the wall." : "");
  rule.addEventListener("click", () => {
    ruleNote.hidden = !ruleNote.hidden;
    rule.setAttribute("aria-expanded", String(!ruleNote.hidden));
  });
  const facts = document.createElement("div");
  facts.className = "detail-facts";
  facts.append(rule);
  const concealedWorth = worth(detail.concealedTier, detail.concealedPoints);
  const exposedWorth = detail.concealedOnly ? null : worth(detail.exposedTier, detail.exposedPoints);
  if (exposedWorth === null || exposedWorth === concealedWorth) {
    // One value when the hand pays the same either way, or cannot be exposed.
    facts.append(factChip("Pays", concealedWorth));
  } else {
    facts.append(factChip("Concealed", concealedWorth), factChip("Exposed", exposedWorth));
  }
  if (detail.requiresSelfDrawn) facts.append(factChip(null, "Self-drawn only"));

  const lede = document.createElement("p");
  lede.className = "detail-lede";
  lede.textContent = detail.description;

  card.append(head);
  if (pin !== null) card.append(pin.note);
  card.append(facts, ruleNote, lede);

  // What you still need comes before the picture: it is what you act on.
  if (progress !== null) {
    const need = document.createElement("span");
    need.className = "closest-need detail-need";
    if (progress.away === 0) {
      need.textContent = "Complete: you can declare it.";
    } else {
      for (const key of progress.need) need.append(faceChip(key));
    }
    card.append(detailLine(progress.away === 0 ? "Your hand" : `You still need (${progress.away})`, need));
  }

  // A Companion-only table sees the Companion's pictures and pages alone.
  const samples = visibleSamples(detail.samples, companionRules());
  card.append(sampleSection(samples, detail.pages));

  // The book's own picture is the example; only a hand it does not picture gets a made-up one.
  if (samples.length === 0) {
    const example = document.createElement("span");
    example.className = "closest-need detail-need";
    for (const key of detail.example) example.append(faceChip(key));
    card.append(detailLine("For example", example));
  }

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
