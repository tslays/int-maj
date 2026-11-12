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

/** The book's words for how a hand may be played: Concealed, or Exposed (melds may be called). */
export function playWord(concealedOnly) {
  return concealedOnly ? "Concealed" : "Exposed";
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
  row.title = away
    ? "More than six tiles away, or no longer possible with the tiles in sight or your exposed melds"
    : hand.concealedOnly
      ? "Concealed: no exposed melds"
      : "Exposed: exposed melds allowed";
  row.setAttribute(
    "aria-label",
    `${pinned ? "Pinned: " : ""}${label}${
      away ? ", out of reach" : `, ${hand.concealedOnly ? "concealed, no exposed melds" : "exposed melds allowed"}`
    }. Tap for details.`,
  );
  const name = document.createElement("span");
  name.className = "closest-name";
  if (pinned) name.append(pinIcon());
  name.append(label);
  // The same order as the hand's sheet: how it is played, how far it is, what it pays.
  const meta = document.createElement("span");
  meta.className = "closest-meta";
  const piece = (words, className) => {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = words;
    return span;
  };
  if (away) {
    meta.append(piece("Out of reach"));
  } else {
    meta.append(
      piece(playWord(hand.concealedOnly)),
      piece("\u00b7"),
      hand.away === 0 ? piece("Complete", "closest-done") : piece(`${hand.away} to go`),
      piece("\u00b7"),
      piece(hand.points === null ? "calculated" : hand.points.toLocaleString("en")),
    );
  }
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

/** A card the book prints in place of a tile, such as "Any tile paired". */
function anyChip(words) {
  const chip = document.createElement("span");
  chip.className = "chip chip-any";
  chip.textContent = words;
  return chip;
}

/** One printed picture: the book's tiles in the book's order and grouping, with the pill of where it is printed below. */
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
  figure.append(tiles);
  for (const text of sample.notes) {
    const note = document.createElement("p");
    note.className = "sample-note";
    note.textContent = text;
    figure.append(note);
  }
  const caption = document.createElement("figcaption");
  for (const source of sample.sources) {
    const badge = document.createElement("span");
    badge.className = "sample-source";
    badge.textContent = `${source.book.includes("Companion") ? "Companion" : "Illustrated"} p. ${source.page}`;
    caption.append(badge);
  }
  if (sample.label !== null) caption.append(sample.label);
  figure.append(caption);
  return figure;
}

function sampleSection(samples, pages, example) {
  const companionOnly = companionRules();
  const wrap = document.createElement("section");
  wrap.className = "detail-book";
  const heading = document.createElement("h3");
  heading.textContent =
    samples.length === 0 ? "Example hand (not from a book)" : samples.length === 1 ? "Sample hand from the book" : "Sample hands from the books";
  wrap.append(heading);
  if (samples.length === 0) {
    const tiles = document.createElement("div");
    tiles.className = "sample-tiles";
    for (const key of example) tiles.append(faceChip(key));
    const none = document.createElement("p");
    none.className = "detail-muted";
    none.textContent = companionOnly
      ? `The Companion lists this hand (${bookPages(pages, true)}) without a picture.`
      : `The books list this hand (${bookPages(pages)}) without a picture.`;
    wrap.append(tiles, none);
    return wrap;
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
  rule.append(playWord(detail.concealedOnly), ruleChevron);
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
  // How it is played, how far you are, and last what it pays: the panel's order.
  if (detail.requiresSelfDrawn) facts.append(factChip(null, "Self-drawn only"));
  if (progress !== null) {
    const far = factChip(null, progress.away === 0 ? "Complete" : `${progress.away} to go`);
    if (progress.away === 0) far.classList.add("detail-done");
    facts.append(far);
  }
  const concealedWorth = worth(detail.concealedTier, detail.concealedPoints);
  const exposedWorth = detail.concealedOnly ? null : worth(detail.exposedTier, detail.exposedPoints);
  if (exposedWorth === null || exposedWorth === concealedWorth) {
    // One value when the hand pays the same either way, or cannot be exposed.
    facts.append(factChip("Pays", concealedWorth));
  } else {
    facts.append(factChip("Concealed", concealedWorth), factChip("Exposed", exposedWorth));
  }

  const lede = document.createElement("p");
  lede.className = "detail-lede";
  lede.textContent = detail.description;

  card.append(head);
  if (pin !== null) card.append(pin.note);
  card.append(facts, ruleNote);

  // First the book's sample hand, then what the hand is, below it. A
  // Companion-only table sees the Companion's pictures and pages alone.
  const samples = visibleSamples(detail.samples, companionRules());
  card.append(sampleSection(samples, detail.pages, detail.example), lede);

  // Then, clearly apart, your own hand: the tiles still needed to complete it.
  if (progress !== null) {
    const yours = document.createElement("section");
    yours.className = "detail-yours";
    const need = document.createElement("span");
    need.className = "closest-need detail-need";
    if (progress.away === 0) {
      need.textContent = "Complete: you can declare it.";
    } else {
      for (const key of progress.need) need.append(faceChip(key));
    }
    const heading = document.createElement("h3");
    heading.textContent = progress.away === 0 ? "Your hand" : "Tiles you still need";
    yours.append(heading, need);
    card.append(yours);
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
