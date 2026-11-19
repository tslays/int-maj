/**
 * Practice, from the start screen: questions that train the eye for the
 * hands, away from a game (`GET /api/practice`, built and graded by the
 * engine: `src/table/practice.ts`).
 *
 *   Name the hand    fourteen tiles: which hand is it?
 *   Winning tile     the same hand less one tile: which tile completes it?
 *
 * Questions follow the hand set chosen in Options › Rules. A right answer
 * adds to the streak; the best streak is kept on the device. After each
 * answer the hand can be opened in full, as in the index of all hands.
 */

import { openHandDetail, TIER_LABEL, tileWords } from "./hints.js";
import { houseRules } from "./options.js";
import { storedString } from "./prefs.js";
import { $, faceChip, request, toast } from "./shared.js";
import { tileOrder } from "./tile-order.js";

const BEST_KEY = "int-maj.practice-best";
const KIND_KEY = "int-maj.practice-kind";
const PROMPT = { name: "Which hand do these tiles make?", wait: "Which tile completes the hand?" };

const best = storedString(BEST_KEY);
const kindPref = storedString(KIND_KEY);
let kind = kindPref.read() === "wait" ? "wait" : "name";
let streak = 0;
let question = null;
let onBack = () => {};

const sorted = (tiles) => [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b));
const bestStreak = () => Number(best.read() ?? 0) || 0;

/** "Red Lantern · Limit": a hand's name and value. */
function handLine(hand) {
  return `${hand.name} · ${TIER_LABEL[hand.tier] ?? hand.tier}`;
}

function showScore() {
  $("#practice-streak").textContent = `Streak ${streak} · Best ${bestStreak()}`;
}

function showKind() {
  for (const button of document.querySelectorAll("#practice-kind [data-kind]")) {
    button.setAttribute("aria-checked", String(button.dataset.kind === kind));
  }
}

async function next() {
  const seed = `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  try {
    question = await request(
      `/api/practice?kind=${kind}&set=${encodeURIComponent(houseRules().handSet ?? "all")}&seed=${seed}`,
    );
  } catch (error) {
    toast(error.message);
    return;
  }
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
      } else button.textContent = option.label;
      button.addEventListener("click", () => answer(option.id));
      return button;
    }),
  );
  $("#practice-result").hidden = true;
  $("#practice-options").querySelector("button")?.focus();
}

function answer(id) {
  if (question === null || !$("#practice-result").hidden) return;
  const right = question.correct.includes(id);
  for (const button of $("#practice-options").querySelectorAll("button")) {
    button.disabled = true;
    if (question.correct.includes(button.dataset.id)) button.classList.add("practice-right");
    else if (button.dataset.id === id) button.classList.add("practice-wrong");
  }
  streak = right ? streak + 1 : 0;
  if (streak > bestStreak()) best.write(String(streak));
  showScore();

  const verdict = $("#practice-verdict");
  verdict.className = `practice-verdict ${right ? "is-right" : "is-wrong"}`;
  verdict.textContent = right ? "Right!" : "Not quite.";
  $("#practice-hand").textContent = handLine(question.hand);
  const notes = [];
  if (question.also.length > 0) notes.push(`These tiles also make ${question.also.map((hand) => hand.name).join(", ")}.`);
  if (question.kind === "wait" && question.wins.length > 1) {
    const words = question.wins.map((win) => `${tileWords(win.tile)} (${win.hand.name}${win.selfDrawnOnly ? ", drawn from the wall" : ""})`);
    notes.push(`Every winning tile: ${words.join(", ")}.`);
  } else if (question.kind === "wait" && question.wins[0]?.selfDrawnOnly) {
    notes.push("It wins only when drawn from the wall.");
  }
  $("#practice-note").textContent = notes.join(" ");
  $("#practice-note").hidden = notes.length === 0;
  $("#practice-result").hidden = false;
  $("#practice-next").focus();
}

export function practiceOpen() {
  return !$("#practice").hidden;
}

export function openPractice() {
  showKind();
  showScore();
  $("#practice").hidden = false;
  void next();
}

function closePractice() {
  $("#practice").hidden = true;
  onBack();
}

/** `back` runs when the player leaves practice (back to the start screen). */
export function installPractice({ back }) {
  onBack = back;
  $("#practice-back").addEventListener("click", closePractice);
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
}
