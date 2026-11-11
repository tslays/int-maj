/**
 * The index of all hands: every hand of both books in one searchable list,
 * opened with "All hands" above the closest-hands panel.
 *
 * Filters are the headings the Companion's synopsis files the hands under
 * (`GET /api/hands`), the hand's value, and concealed or exposed play; the
 * search box matches words in a hand's name, composition and headings. While
 * a hand is being played each card also says how many tiles you are away
 * (`GET /api/closest?limit=`), and the list can be sorted by that.
 */

import { openHandDetail, playIcon, TIER_LABEL } from "./hints.js";
import { bookPages } from "./pages.js";
import { $, companionRules, faceChip, handSetInForce, request, state } from "./shared.js";

let catalogue = null; // { set, groups, hands }: the hands in play, fetched again when the hand set changes
let progress = new Map(); // pattern -> closest-hands entry, for the hand in play
const cards = new Map(); // pattern -> its card, built once per catalogue and reused by every list
const filter = { text: "", group: "all", tier: "all", play: "all", book: "all", sort: "book" };

const TIERS = ["half", "limit", "middle", "double", "calculate"];
const TIER_SHORT = { half: "Half limit", limit: "Limit", middle: "Middle limit", double: "Double limit", calculate: "Calculated" };

/** Lower case, plain quotes and dashes, so "dragons tail" finds Dragon's Tail and "1-9" finds 1–9. */
function plain(text) {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/&/g, " and ");
}

function haystack(hand) {
  const groups = catalogue.groups.filter((group) => hand.groups.includes(group.id)).map((group) => group.name);
  return plain(
    [
      hand.name,
      hand.description,
      ...groups,
      TIER_LABEL[hand.concealedTier],
      hand.concealedPoints ?? "",
      hand.concealedOnly ? "concealed only" : "exposed or concealed",
      hand.requiresSelfDrawn ? "self-drawn wall" : "",
      bookPages(hand.pages, companionRules()),
    ].join(" "),
  );
}

function matches(hand) {
  if (filter.group !== "all" && !hand.groups.includes(filter.group)) return false;
  if (filter.tier !== "all" && hand.concealedTier !== filter.tier) return false;
  if (filter.play === "concealed" && !hand.concealedOnly) return false;
  if (filter.play === "exposed" && hand.concealedOnly) return false;
  if (filter.book === "illustrated" && hand.pages.illustrated.length === 0) return false;
  if (filter.book === "companion" && hand.pages.illustrated.length > 0) return false;
  const words = plain(filter.text).split(/\s+/).filter((word) => word.length > 0);
  return words.every((word) => hand.search.includes(word));
}

/** The book's order under a heading, the catalogue's otherwise; or nearest to your tiles first. */
function ordered(hands) {
  const list = [...hands];
  const group = catalogue.groups.find((entry) => entry.id === filter.group);
  if (group !== undefined) list.sort((a, b) => group.hands.indexOf(a.pattern) - group.hands.indexOf(b.pattern));
  if (filter.sort === "near") {
    const away = (hand) => progress.get(hand.pattern)?.away ?? 99;
    list.sort((a, b) => away(a) - away(b)); // stable: ties keep the book's order
  }
  return list;
}

function card(hand) {
  const cached = cards.get(hand.pattern);
  if (cached !== undefined) return cached;
  const item = document.createElement("button");
  item.type = "button";
  item.className = "index-card";
  item.dataset.pattern = hand.pattern;

  const head = document.createElement("span");
  head.className = "index-card-head";
  const name = document.createElement("strong");
  name.textContent = hand.name;
  const value = document.createElement("span");
  value.className = "index-value";
  value.textContent = hand.concealedPoints === null ? "Calculated" : hand.concealedPoints.toLocaleString("en");
  head.append(name, value);

  const tiles = document.createElement("span");
  tiles.className = "closest-need index-tiles";
  for (const key of hand.example) tiles.append(faceChip(key));

  const text = document.createElement("span");
  text.className = "index-text";
  text.textContent = hand.description;

  const foot = document.createElement("span");
  foot.className = "index-foot";
  const play = document.createElement("span");
  play.className = "index-play";
  play.append(playIcon(hand.concealedOnly), hand.concealedOnly ? "Concealed only" : "Exposed allowed");
  foot.append(play);

  item.append(head, tiles, text, foot);
  // The closest-hands entry is read when the card is tapped, so it is never stale.
  item.addEventListener("click", () => void openHandDetail(hand.pattern, progress.get(hand.pattern) ?? null));
  cards.set(hand.pattern, item);
  return item;
}

/** Put (or take away) the "n to go" badge on every card; the cards themselves are not rebuilt. */
function applyProgress() {
  for (const [pattern, item] of cards) {
    const mine = progress.get(pattern);
    let badge = item.querySelector(".index-away");
    if (mine === undefined) {
      badge?.remove();
      continue;
    }
    if (badge === null) {
      badge = document.createElement("span");
      badge.className = "index-away";
      item.querySelector(".index-foot").append(badge);
    }
    badge.textContent = mine.away === 0 ? "Complete" : `${mine.away} to go`;
  }
}

function renderList() {
  const hands = ordered(catalogue.hands.filter(matches));
  const list = $("#index-list");
  $("#index-count").textContent = `${hands.length} of ${catalogue.hands.length}`;
  if (hands.length === 0) {
    const empty = document.createElement("p");
    empty.className = "index-empty";
    empty.textContent = "No hand matches. Try fewer words or another filter.";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "index-chip";
    reset.textContent = "Show all hands";
    reset.addEventListener("click", () => {
      Object.assign(filter, { text: "", group: "all", tier: "all", play: "all", book: "all" });
      $("#index-search").value = "";
      renderFilters();
      renderList();
    });
    list.replaceChildren(empty, reset);
  } else {
    list.replaceChildren(...hands.map(card));
  }
  list.scrollTop = 0;
}

/** One titled set of choices; exactly one is on. */
function choices(title, key, options) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  for (const [value, label, count] of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "index-chip";
    chip.setAttribute("aria-pressed", String(filter[key] === value));
    const text = document.createElement("span");
    text.textContent = label;
    chip.append(text);
    if (count !== undefined) {
      const number = document.createElement("small");
      number.textContent = count;
      chip.append(number);
    }
    chip.addEventListener("click", () => {
      filter[key] = value;
      renderFilters();
      renderList();
    });
    section.append(chip);
  }
  return section;
}

function renderFilters() {
  const count = (test) => catalogue.hands.filter(test).length;
  const sections = [];
  if (progress.size > 0) {
    sections.push(
      choices("Order", "sort", [
        ["book", "As in the book"],
        ["near", "Nearest to my tiles"],
      ]),
    );
  }
  sections.push(
    choices("Kind of hand", "group", [
      ["all", "All hands", catalogue.hands.length],
      ...catalogue.groups.map((group) => [group.id, group.name, group.hands.length]),
    ]),
    choices("Value", "tier", [
      ["all", "Any value"],
      ...TIERS.map((tier) => [tier, TIER_SHORT[tier], count((hand) => hand.concealedTier === tier)]),
    ]),
    choices("Play", "play", [
      ["all", "Either"],
      ["concealed", "Concealed only", count((hand) => hand.concealedOnly)],
      ["exposed", "Exposed allowed", count((hand) => !hand.concealedOnly)],
    ]),
    // The Companion sets know only one book, so there is nothing to filter by.
    ...(companionRules()
      ? []
      : [
          choices("Book", "book", [
            ["all", "Both books"],
            ["illustrated", "Illustrated", count((hand) => hand.pages.illustrated.length > 0)],
            ["companion", "Companion only", count((hand) => hand.pages.illustrated.length === 0)],
          ]),
        ]),
  );
  const rail = $("#index-filters");
  const scroll = rail.scrollTop;
  rail.replaceChildren(...sections);
  rail.scrollTop = scroll;
}

/** How far your tiles are from each hand in reach; empty when no hand is being played. */
async function readProgress() {
  const payload = state.payload;
  if (payload === null || payload.outcome !== null || payload.view.phase === "finished") return new Map();
  try {
    const answer = await request(`/api/closest?game=${encodeURIComponent(payload.game)}&limit=100`);
    return new Map(answer.hands.map((hand) => [hand.pattern, hand]));
  } catch {
    return new Map();
  }
}

/** Fetch the hands in play and build their cards, when the hand set has changed since they were. */
async function loadCatalogue() {
  const set = handSetInForce();
  if (catalogue !== null && catalogue.set === set) return;
  const answer = await request(`/api/hands?set=${set}`);
  catalogue = { set, groups: answer.groups, hands: answer.hands };
  cards.clear();
  filter.group = "all";
  filter.book = "all";
  for (const hand of catalogue.hands) hand.search = haystack(hand);
  renderFilters();
  renderList();
}

/** Build the index while the panel is still hidden, so the first tap on "All hands" has nothing left to do. */
export function warmIndex() {
  if (state.api === null) return;
  void loadCatalogue().catch(() => {});
}

/** How close your tiles are, worked out after the panel is up: it costs a moment on a phone. */
async function refreshProgress() {
  const fresh = await readProgress();
  if ($("#hand-index").hidden) return;
  progress = fresh;
  if (progress.size === 0) filter.sort = "book";
  applyProgress();
  renderFilters();
  if (filter.sort === "near") renderList();
}

export async function openIndex() {
  if (state.api === null) return;
  try {
    await loadCatalogue();
  } catch {
    return;
  }
  if (progress.size === 0) filter.sort = "book";
  renderFilters();
  renderList();
  $("#hand-index").hidden = false;
  // After the panel has painted.
  requestAnimationFrame(() => setTimeout(() => void refreshProgress(), 0));
}

function closeIndex() {
  $("#hand-index").hidden = true;
  $("#index-search").blur();
}

$("#index-open").addEventListener("click", () => void openIndex());
$("#index-close").addEventListener("click", closeIndex);
$("#hand-index").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeIndex();
});
$("#index-search").addEventListener("input", (event) => {
  filter.text = event.target.value;
  renderList();
});
// Escape closes the hand sheet first (hints.js), the index only when no sheet is open.
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && !$("#hand-index").hidden && $("#hand-detail").hidden) closeIndex();
  },
  true,
);
