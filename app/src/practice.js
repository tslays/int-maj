/**
 * Practice, from the start screen: questions that train the eye for the
 * hands, away from a game (`GET /api/practice`, built and graded by the
 * engine: `src/table/practice.ts`).
 *
 *   Name the hand    fourteen tiles: which hand is it?
 *   Winning tile     the same hand less one tile: which tile completes it?
 *   Best aim         thirteen tiles as dealt: which hand to aim for?
 *
 * Questions follow the hand set chosen in Options › Rules. After an answer
 * the tiles are shown grouped as the hand reads them, with every winning
 * tile, or how near each aim is; the hand can be opened in full. A right
 * answer adds to the streak, and the best streak is kept on the device, as
 * are the hands you missed: they come back sooner until you get them right.
 * The next question is fetched while you read. Back (the button, Escape or
 * the phone's back) returns to the start screen.
 */

import { chanceBand } from "./chance.js";
import { openHandDetail, TIER_LABEL, tileWords } from "./hints.js";
import { houseRules } from "./options.js";
import { storedString } from "./prefs.js";
import { $, faceChip, request, toast } from "./shared.js";
import { sound } from "./sound.js";
import { focusForKeys } from "./start.js";
import { tileOrder } from "./tile-order.js";

const BEST_KEY = "int-maj.practice-best";
const KIND_KEY = "int-maj.practice-kind";
const MISSED_KEY = "int-maj.practice-missed";
const KINDS = ["name", "wait", "aim"];
const PROMPT = {
  name: "Which hand do these tiles make?",
  wait: "Which tile completes the hand?",
  aim: "Your deal: which hand should you aim for?",
};

const best = storedString(BEST_KEY);
const kindPref = storedString(KIND_KEY);
const missedStore = storedString(MISSED_KEY);
let kind = KINDS.includes(kindPref.read()) ? kindPref.read() : "name";
let streak = 0;
let question = null;
/** The next question, asked for while the player reads the last answer. */
let pending = null;
let onBack = () => {};

const sorted = (tiles) => [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b));
const bestStreak = () => Number(best.read() ?? 0) || 0;

/* ------------------------------------------------ the hands you missed */

function missed() {
  try {
    const value = JSON.parse(missedStore.read() ?? "{}");
    return value !== null && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** A miss counts up (at most 3); a right answer counts down until the hand is forgotten. */
function noteMiss(id, right) {
  const counts = missed();
  const count = Math.max(0, Math.min(3, (counts[id] ?? 0) + (right ? -1 : 1)));
  if (count === 0) delete counts[id];
  else counts[id] = count;
  missedStore.write(JSON.stringify(counts));
}

/** The missed hands to ask again, most missed first. */
function focus() {
  return Object.entries(missed())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
}

/* ------------------------------------------------ asking */

function load(of) {
  const seed = `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const set = encodeURIComponent(houseRules().handSet ?? "all");
  const path = `/api/practice?kind=${of}&set=${set}&seed=${seed}&focus=${encodeURIComponent(focus().join(","))}`;
  const question = request(path);
  question.catch(() => {}); // a failed prefetch is reported when it is used, if it is
  return { kind: of, question };
}

/** "Red Lantern · Limit": a hand's name and value. */
function handLine(hand) {
  return `${hand.name} · ${TIER_LABEL[hand.tier] ?? hand.tier}`;
}

function showScore(record = false) {
  const element = $("#practice-streak");
  element.textContent = `Streak ${streak} · Best ${bestStreak()}`;
  element.classList.toggle("practice-record", record);
}

function showKind() {
  for (const button of document.querySelectorAll("#practice-kind [data-kind]")) {
    button.setAttribute("aria-checked", String(button.dataset.kind === kind));
  }
}

async function next() {
  const asked = pending !== null && pending.kind === kind ? pending : load(kind);
  pending = null;
  $("#practice-prompt").textContent = kind === "aim" ? "Dealing…" : PROMPT[kind];
  $("#practice-options").replaceChildren();
  $("#practice-result").hidden = true;
  let received;
  try {
    received = await asked.question;
  } catch (error) {
    toast(error.message);
    return;
  }
  // A drill switched while this one was on its way: that one shows instead.
  if (asked.kind !== kind) return;
  question = received;
  $("#practice-prompt").textContent = PROMPT[question.kind];
  $("#practice-tiles").replaceChildren(...sorted(question.tiles).map((key) => faceChip(key)));
  $("#practice-options").replaceChildren(
    ...question.options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `practice-option${question.kind === "wait" ? " practice-tile" : ""}`;
      button.dataset.id = option.id;
      if (question.kind === "wait") {
        button.append(faceChip(option.id));
        button.setAttribute("aria-label", tileWords(option.id));
      } else {
        const name = document.createElement("span");
        name.textContent = option.label;
        button.append(name);
      }
      button.addEventListener("click", () => answer(option.id));
      return button;
    }),
  );
  focusForKeys($("#practice-options").querySelector("button"));
}

/* ------------------------------------------------ answering */

/** A row of tile chips, in groups with a gap between them. */
function tileGroups(groups) {
  const row = document.createElement("div");
  row.className = "practice-groups";
  for (const group of groups) {
    const set = document.createElement("span");
    set.className = "practice-group";
    set.append(...group.map((key) => faceChip(key)));
    row.append(set);
  }
  return row;
}

/** One winning tile with the hand it makes under it. */
function winChip(win) {
  const item = document.createElement("span");
  item.className = "practice-win";
  const label = document.createElement("small");
  label.textContent = win.selfDrawnOnly ? `${win.hand.name} (drawn)` : win.hand.name;
  item.append(faceChip(win.tile), label);
  return item;
}

/** What an aim choice is: "2 away · Likely", or "out of reach". */
function aimLine(aim) {
  if (aim.away === null) return "Out of reach, or far off";
  return `${aim.away} away · ${chanceBand(aim.chance).name}`;
}

function reveal() {
  const parts = [];
  if (question.kind === "aim") {
    const top = question.aims.find((aim) => aim.id === question.hand.id);
    if (top !== undefined && top.need.length > 0) {
      const row = document.createElement("div");
      row.className = "practice-needs";
      const label = document.createElement("small");
      label.textContent = "It still needs";
      row.append(label, ...sorted(top.need).map((key) => faceChip(key)));
      parts.push(row);
    }
  } else {
    if (question.groups !== null) parts.push(tileGroups(question.groups));
    if (question.kind === "wait" && question.wins.length > 0) {
      const row = document.createElement("div");
      row.className = "practice-wins";
      const label = document.createElement("small");
      label.textContent = question.wins.length > 1 ? "Every winning tile" : "The winning tile";
      row.append(label, ...question.wins.map(winChip));
      parts.push(row);
    }
  }
  $("#practice-reveal").replaceChildren(...parts);
}

function answer(id) {
  if (question === null || !$("#practice-result").hidden) return;
  const right = question.correct.includes(id);
  for (const button of $("#practice-options").querySelectorAll("button")) {
    button.disabled = true;
    if (question.correct.includes(button.dataset.id)) button.classList.add("practice-right");
    else if (button.dataset.id === id) button.classList.add("practice-wrong");
    // Each aim says how near it is.
    const aim = question.aims.find((entry) => entry.id === button.dataset.id);
    if (aim !== undefined) {
      const line = document.createElement("small");
      line.textContent = aimLine(aim);
      button.append(line);
    }
  }
  const before = bestStreak();
  streak = right ? streak + 1 : 0;
  const record = streak > before && streak >= 3;
  if (streak > before) best.write(String(streak));
  showScore(record);
  sound.cue(record ? "alertWin" : right ? "meld" : "notice");
  if (question.kind !== "aim") noteMiss(question.hand.id, right);

  const verdict = $("#practice-verdict");
  verdict.className = `practice-verdict ${right ? "is-right" : "is-wrong"}`;
  verdict.textContent = record ? "New best!" : right ? "Right!" : "Not quite.";
  $("#practice-hand").textContent = question.kind === "aim" ? `Best aim: ${handLine(question.hand)}` : handLine(question.hand);
  reveal();
  const notes = [];
  if (question.also.length > 0) notes.push(`These tiles also make ${question.also.map((hand) => hand.name).join(", ")}.`);
  if (question.kind === "aim") notes.push("As the hint panel rates them: the likeliest hand to finish from this deal.");
  $("#practice-note").textContent = notes.join(" ");
  $("#practice-note").hidden = notes.length === 0;
  $("#practice-result").hidden = false;
  focusForKeys($("#practice-next"));
  pending = load(kind);
}

/* ------------------------------------------------ opening and leaving */

export function practiceOpen() {
  return !$("#practice").hidden;
}

export function openPractice() {
  showKind();
  showScore();
  $("#practice").hidden = false;
  // The phone's back button leaves practice, not the page.
  try {
    history.pushState({ practice: true }, "");
  } catch {
    // No history: the Menu button still leaves.
  }
  void next();
}

function closePractice() {
  if (!practiceOpen()) return;
  $("#practice").hidden = true;
  pending = null;
  onBack();
}

function leave() {
  if (history.state?.practice === true) history.back(); // closes it, through popstate
  else closePractice();
}

/** `back` runs when the player leaves practice (back to the start screen). */
export function installPractice({ back }) {
  onBack = back;
  $("#practice-back").addEventListener("click", leave);
  $("#practice-next").addEventListener("click", () => void next());
  $("#practice-see").addEventListener("click", () => {
    if (question !== null) void openHandDetail(question.hand.id);
  });
  $("#practice-kind").addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    if (button === null || button.dataset.kind === kind) return;
    kind = button.dataset.kind;
    kindPref.write(kind);
    showKind();
    void next();
  });
  window.addEventListener("popstate", closePractice);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !practiceOpen()) return;
    // A sheet over practice (a hand, the guide) closes first.
    if ([...document.querySelectorAll(".hand-detail")].some((sheet) => !sheet.hidden)) return;
    leave();
  }, true); // ahead of the sheets' own Escape, which would close them first
}
