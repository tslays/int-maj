/**
 * The closest-hands panel (top right), the hand sheet behind it and the
 * Hints toggle in the menu. The hand sheet also serves the index of all
 * hands (`handbook.js`).
 */

import { bookPages } from "./pages.js";
import { $, faceChip, request, showToggle, state, storage } from "./shared.js";

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
let hintsFor = null; // the tiles the panel was last built for

/**
 * The catalogue hands your tiles are nearest to, top right. Asked for when
 * your own tiles change and at each of your decisions (the tiles in sight
 * change too), never on a bot's beat alone.
 */
export async function refreshHints(force = false) {
  const panel = $("#closest");
  if (!hintsOn || state.payload === null || state.payload.outcome !== null || state.payload.view.phase === "finished") {
    // A sheet opened from the panel goes with it; one opened from the index stays.
    if (!panel.hidden) closeHandDetail();
    panel.hidden = true;
    hintsFor = null;
    return;
  }
  const player = state.payload.view.player;
  const key = `${state.payload.game}|${player.hand.join()}|${player.melds.map((meld) => meld.tiles.join()).join("/")}`;
  if (!force && key === hintsFor) return;
  hintsFor = key;
  try {
    const answer = await request(`/api/closest?game=${encodeURIComponent(state.payload.game)}`);
    if (hintsFor === key) renderHints(answer.hands);
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

function renderHints(hands) {
  const panel = $("#closest");
  const title = document.createElement("p");
  title.className = "closest-title";
  title.textContent = "Closest hands";
  if (hands.length === 0) {
    const empty = document.createElement("p");
    empty.className = "closest-empty";
    empty.textContent = "Nothing within six tiles yet.";
    panel.replaceChildren(title, empty);
    panel.hidden = false;
    return;
  }
  const list = document.createElement("ol");
  for (const hand of hands) {
    const item = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "closest-item";
    row.title = hand.concealedOnly ? "Concealed only" : "Exposed melds allowed";
    row.setAttribute(
      "aria-label",
      `${hand.name}, ${hand.concealedOnly ? "concealed only" : "exposed melds allowed"}. Tap for details.`,
    );
    const name = document.createElement("span");
    name.className = "closest-name";
    name.textContent = hand.name;
    const meta = document.createElement("span");
    meta.className = "closest-meta";
    const progress = document.createElement("span");
    const value = hand.points === null ? "calculated" : hand.points.toLocaleString("en");
    if (hand.away === 0) {
      const done = document.createElement("span");
      done.className = "closest-done";
      done.textContent = "Complete";
      progress.append(done, ` · ${value}`);
    } else {
      progress.textContent = `${hand.away} to go · ${value}`;
    }
    meta.append(progress, playIcon(hand.concealedOnly));
    row.append(name, meta);
    row.addEventListener("click", () => void openHandDetail(hand.pattern, hand));
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
  caption.textContent = `${sample.book}, p. ${sample.page}${sample.label === null ? "" : ` \u00b7 ${sample.label}`}`;
  figure.append(tiles, caption);
  if (sample.note !== null) {
    const note = document.createElement("p");
    note.className = "sample-note";
    note.textContent = sample.note;
    figure.append(note);
  }
  return figure;
}

function sampleSection(samples) {
  const line = document.createElement("div");
  line.className = "detail-line";
  const heading = document.createElement("h3");
  heading.textContent = "The hand in the book";
  line.append(heading);
  if (samples.length === 0) {
    const none = document.createElement("p");
    none.textContent = "The book lists this hand without a picture.";
    line.append(none);
  }
  for (const sample of samples) line.append(sampleFigure(sample));
  return line;
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
  card.className = "detail-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", detail.name);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "detail-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "\u00d7";
  close.addEventListener("click", closeHandDetail);

  const heading = document.createElement("h2");
  heading.textContent = detail.name;

  const banner = document.createElement("div");
  banner.className = "detail-banner";
  const bannerTitle = document.createElement("strong");
  bannerTitle.textContent = detail.concealedOnly ? "Concealed only" : "Exposed or concealed";
  const bannerText = document.createElement("span");
  bannerText.textContent = detail.concealedOnly
    ? "Build it entirely from your own tiles. Do not call Pung, Kong or Chow on a discard: " +
      "one exposed meld and this hand is gone. You may still win on a discard."
    : "You may call discards to make exposed melds and still win this hand, " +
      "though it pays less than playing it concealed.";
  banner.append(playIcon(detail.concealedOnly), bannerTitle, bannerText);

  card.append(close, heading, banner, detailLine("What it is", detail.description), sampleSection(detail.samples));
  if (detail.requiresSelfDrawn) {
    card.append(detailLine("Self-drawn", "Every tile, the winning one included, must come from the wall."));
  }
  const pays = [`Concealed: ${worth(detail.concealedTier, detail.concealedPoints)}`];
  pays.push(
    detail.exposedTier === null
      ? "Exposed: not possible"
      : `Exposed: ${worth(detail.exposedTier, detail.exposedPoints)}`,
  );
  const payLine = detailLine("What it pays", pays[0]);
  payLine.lastChild.append(document.createElement("br"), pays[1]);
  card.append(payLine);

  // The book's own picture is the example; only a hand it does not picture gets a made-up one.
  if (detail.samples.length === 0) {
    const example = document.createElement("span");
    example.className = "closest-need detail-need";
    for (const key of detail.example) example.append(faceChip(key));
    card.append(detailLine("For example", example));
  }

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
  card.append(detailLine("In the books", bookPages(detail.pages)));

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
