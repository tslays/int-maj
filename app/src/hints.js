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
  // The panel is worked out when you have a decision to make (`force`), and
  // then stays as it is while the bots play: it changes once per decision,
  // not at every tile that passes. Only the first board of a game builds it
  // unasked.
  if (!force && hintsFor !== null && !panel.hidden) return;
  const player = state.payload.view.player;
  const melds = player.melds.map((meld) => meld.tiles.join()).join("/");
  const key = `${state.payload.game}|${player.hand.join()}|${melds}|${mine.join()}|${hintsOn}`;
  if (!force && key === hintsFor) return;
  // A new position: what the panel showed so far is what the arrows compare with.
  if (key !== hintsFor) {
    previousChance = shownChance;
    shownChance = new Map();
  }
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

/** Each scoring of a hand, one line apiece: what it pays and when (`readings` from the hand index). */
export function readingList(readings) {
  const list = document.createElement("span");
  list.className = "reading-list";
  for (const reading of readings) {
    const line = document.createElement("span");
    line.className = "reading-line";
    const value = document.createElement("strong");
    value.textContent = worth(reading.concealedTier, reading.concealedPoints);
    line.append(value, ` ${reading.scoringWhen}`);
    list.append(line);
  }
  return list;
}

/** The book's words for how a hand may be played: Concealed, or Exposed (melds may be called). */
export function playWord(concealedOnly) {
  return concealedOnly ? "Concealed" : "Exposed";
}

/* ------------------------------------------------------------ the chance */

/**
 * The chance of completing a hand is shown as a band, never as a number: a
 * player gets the gist of what can still be built (and what to give up)
 * without fixing on percentages the estimate is not that precise about.
 */

/**
 * Five bands of chance, each with its name and colour (`--chance-<id>` in
 * styles.css): a glance says how buildable a hand is. Lower bounds, best
 * first.
 */
const BANDS = [
  { id: "excellent", name: "Excellent", from: 0.8 },
  { id: "very-good", name: "Very good", from: 0.6 },
  { id: "good", name: "Good", from: 0.4 },
  { id: "average", name: "Average", from: 0.2 },
  { id: "bad", name: "Bad", from: 0 },
];

/** The band a chance falls in. */
export function chanceBand(chance) {
  return BANDS.find((band) => chance >= band.from) ?? BANDS[BANDS.length - 1];
}

/** A band's rank, 0 for bad up to 4 for excellent: the arrows compare ranks. */
function bandRank(chance) {
  return BANDS.length - 1 - BANDS.indexOf(chanceBand(chance));
}

/** The chance for a screen reader: "good chance to complete". */
export function chanceWords(chance) {
  return `${chanceBand(chance).name.toLowerCase()} chance to complete`;
}

/**
 * The chance as a ring that fills clockwise from the top, in its band's
 * colour. The band's name is always written beside it, so colour is never
 * the only sign.
 */
export function chanceRing(chance) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "chance-ring");
  svg.setAttribute("aria-hidden", "true");
  const radius = 6;
  const around = 2 * Math.PI * radius;
  const track = document.createElementNS(ns, "circle");
  track.setAttribute("class", "chance-track");
  const fill = document.createElementNS(ns, "circle");
  fill.setAttribute("class", "chance-fill");
  for (const circle of [track, fill]) {
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", String(radius));
  }
  const share = Math.max(0, Math.min(1, chance));
  // Anything above nothing shows at least a sliver, so "under 1%" is not an empty ring.
  const shown = share === 0 ? 0 : Math.max(share, 0.04);
  fill.setAttribute("stroke-dasharray", `${(shown * around).toFixed(2)} ${around.toFixed(2)}`);
  svg.classList.add(`chance-${chanceBand(share).id}`);
  svg.append(track, fill);
  return svg;
}

/**
 * The ring and the band's name together (the hand's sheet, the index), with an arrow when the hand moved
 * up or down a band since your previous decision (`trend`: bands moved).
 */
export function chanceBadge(chance, trend = 0) {
  const badge = chanceMark(chance, trend);
  const band = document.createElement("span");
  band.className = "chance-band";
  band.textContent = chanceBand(chance).name;
  badge.insertBefore(band, badge.querySelector(".chance-trend"));
  return badge;
}

/** The ring alone, with its arrow when the hand moved a band: the panel's row. */
function chanceMark(chance, trend = 0) {
  const mark = document.createElement("span");
  mark.className = "chance";
  mark.append(chanceRing(chance));
  if (trend !== 0) {
    const arrow = document.createElement("span");
    arrow.className = trend > 0 ? "chance-trend chance-up" : "chance-trend chance-down";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = trend > 0 ? "\u25b2" : "\u25bc";
    mark.append(arrow);
  }
  return mark;
}

/**
 * Each hand's chance as the panel shows it now, and as it showed it at your
 * previous decision: the arrows compare the two, so drawing the same
 * position again (a pin, Hints on) keeps its arrows.
 */
let shownChance = new Map();
let previousChance = new Map();

/** How many bands `hand` moved since your previous decision. */
function trendOf(hand) {
  const key = `${state.payload?.game}|${hand.pattern}`;
  shownChance.set(key, hand.chance);
  const before = previousChance.get(key);
  return before === undefined ? 0 : bandRank(hand.chance) - bandRank(before);
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
  const trend = away ? 0 : trendOf(hand);
  const moved = trend === 0 ? "" : `, ${trend > 0 ? "up" : "down"} since your last move`;
  row.setAttribute(
    "aria-label",
    `${pinned ? "Pinned: " : ""}${label}${
      away
        ? ", out of reach: more than six tiles away, or no longer possible with the tiles in sight or your exposed melds"
        : `, ${hand.away === 0 ? "complete" : chanceWords(hand.chance)}${moved}, ${hand.concealedOnly ? "concealed, no exposed melds" : "exposed melds allowed"}`
    }. Tap for details.`,
  );
  // The chance leads the row as a ring alone, in its band's colour and filled
  // as far as the chance goes: the panel is too narrow for the band's name,
  // which the hand's sheet and a screen reader give.
  const name = document.createElement("span");
  name.className = "closest-name";
  if (!away && hand.away > 0) name.append(chanceMark(hand.chance, trend));
  if (pinned) name.append(pinIcon());
  name.append(label);
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
    // How it is played and what it pays; a complete hand says so first.
    if (hand.away === 0) meta.append(piece("Complete", "closest-done"), piece("\u00b7"));
    meta.append(
      piece(playWord(hand.concealedOnly)),
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
    button.setAttribute("aria-label", blocked ? `${words}: all ${MAX_PINS} pins are in use` : words);
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

/** The words for a tile key ("c1" is "1 character"), for a sentence about the player's own tiles. */
export function tileWords(key) {
  const suit = { c: "character", o: "circle", b: "bamboo" }[key[0]];
  if (suit !== undefined) return `${key.slice(1)} ${suit}`;
  const wind = { E: "East wind", S: "South wind", W: "West wind", N: "North wind" }[key[1]];
  if (key[0] === "w" && wind !== undefined) return wind;
  const dragon = { R: "red dragon", G: "green dragon", W: "white dragon" }[key[1]];
  return key[0] === "d" && dragon !== undefined ? dragon : key;
}

/**
 * A needed tile's chip with, under it, how many copies are still out of
 * sight (in the wall or another player's hand): the evidence behind the
 * chance. A tile whose count is not known shows the chip alone.
 */
function withLeft(key, left) {
  const chip = faceChip(key);
  if (left === undefined) return chip;
  const stack = document.createElement("span");
  stack.className = "need-tile";
  const count = document.createElement("span");
  count.className = "need-left";
  count.textContent = String(left);
  stack.append(chip, count);
  stack.setAttribute("aria-label", `${tileWords(key)}, ${left} left`);
  stack.setAttribute("role", "img");
  return stack;
}

/**
 * The tiles still needed, one chip each. Where another tile would do as well
 * (a 4 where the 1 completes a pair) it follows the chip after "or".
 */
function needChips(into, progress) {
  const standIns = new Map((progress.instead ?? []).map((entry) => [entry.need, entry.or]));
  const shown = new Set();
  const unseen = progress.unseen ?? {};
  for (const key of progress.need) {
    const group = document.createElement("span");
    group.className = "need-pick";
    group.append(withLeft(key, unseen[key]));
    const or = standIns.get(key);
    if (or !== undefined && !shown.has(key)) {
      shown.add(key);
      const word = document.createElement("span");
      word.className = "need-or";
      word.textContent = "or";
      group.append(word);
      for (const other of or) group.append(withLeft(other, unseen[other]));
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", `${tileWords(key)} or ${or.map(tileWords).join(" or ")}`);
    }
    into.append(group);
  }
}

/**
 * When a needed tile is one the player already holds, say it is one more the
 * hand wants (the pair beside a run cannot use the run's own tile).
 */
function anotherNote(progress) {
  const held = progress.another ?? [];
  if (held.length === 0) return null;
  const note = document.createElement("p");
  note.className = "detail-muted need-note";
  const names = held.map(tileWords);
  const list = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  note.textContent = `You already hold the ${list}; this hand wants one more.`;
  return note;
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
    const far = factChip(null, progress.away === 0 ? "Complete" : chanceBadge(progress.chance));
    if (progress.away === 0) far.classList.add("detail-done");
    else far.setAttribute("aria-label", chanceWords(progress.chance));
    facts.append(far);
  }
  const concealedWorth = worth(detail.concealedTier, detail.concealedPoints);
  const exposedWorth = detail.concealedOnly ? null : worth(detail.exposedTier, detail.exposedPoints);
  // A hand with more than one scoring lists each one below, so it gets no single "Pays" chip.
  const scorings = detail.readings.length > 1;
  if (!scorings) {
    if (exposedWorth === null || exposedWorth === concealedWorth) {
      // One value when the hand pays the same either way, or cannot be exposed.
      facts.append(factChip("Pays", concealedWorth));
    } else {
      facts.append(factChip("Concealed", concealedWorth), factChip("Exposed", exposedWorth));
    }
  }

  const lede = document.createElement("p");
  lede.className = "detail-lede";
  lede.textContent = detail.description;

  card.append(head);
  if (pin !== null) card.append(pin.note);
  card.append(facts, ruleNote);
  if (scorings) card.append(readingList(detail.readings));

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
      needChips(need, progress);
    }
    const heading = document.createElement("h3");
    heading.textContent = progress.away === 0 ? "Your hand" : "Tiles you still need";
    yours.append(heading, need);
    if (progress.away > 0) {
      const left = document.createElement("p");
      left.className = "detail-muted need-note";
      left.textContent =
        "The number under each tile: copies you have not seen yet, in the wall or another player's hand. " +
        "The chance reads them, and every claim this hand may make.";
      yours.append(left);
      const note = anotherNote(progress);
      if (note !== null) yours.append(note);
    }
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
