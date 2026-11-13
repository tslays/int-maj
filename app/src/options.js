/**
 * The Options sheet: sound, large discards (phones only), the discard layout, the pace, the bot
 * level, dice and dealing, the house rules, and the doors to New game, Help
 * and Report a problem.
 *
 * A house rule is a preference kept on the device. The table fixes a hand's
 * rules at its deal, so `houseRules()` is sent with every new game and every
 * next hand, and a change made mid-hand shows as pending until then.
 */

import { largeDiscards } from "./large-discards.js";
import { discardLayout } from "./discard-layout.js";
import { roundLayersWanted } from "./layout.js";
import { level } from "./level.js";
import { openingPref } from "./opening.js";
import { pace } from "./pace.js";
import { sound } from "./sound.js";
import { $, request, state, storage } from "./shared.js";
import { viewport } from "./stage.js";

const RULES_KEY = "int-maj:house-rules";
const HAND_SETS = ["all", "companion", "companion-pictured"];

/** What each hand set means, before the table names the hands it leaves out. */
const HAND_SET_TEXT = {
  all: "Every hand either book prints, with or without a sample picture.",
  companion: "Only hands the Companion prints. Left out:",
  "companion-pictured": "Only Companion hands that come with a sample picture. Left out:",
};

function savedRules() {
  const rules = { handSet: "all", goulashNoHalfLimit: true, winNeedsFish: false };
  try {
    const saved = JSON.parse(storage()?.getItem(RULES_KEY) ?? "{}");
    if (HAND_SETS.includes(saved?.handSet)) rules.handSet = saved.handSet;
    // The first version of this option was a plain on/off switch.
    else if (saved?.companionHandsOnly === true) rules.handSet = "companion";
    if (typeof saved?.goulashNoHalfLimit === "boolean") rules.goulashNoHalfLimit = saved.goulashNoHalfLimit;
    if (typeof saved?.winNeedsFish === "boolean") rules.winNeedsFish = saved.winNeedsFish;
  } catch {
    // Unreadable: start from the default.
  }
  return rules;
}

function saveRules() {
  try {
    storage()?.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    // Storage refused: the choice lasts until the page is closed.
  }
}

const rules = savedRules();
/** The names of the hands each set leaves out, as the table reports them. */
let leftOut = null;

/** The house rules the player has chosen, for the next deal. */
export function houseRules() {
  return { ...rules };
}

function showRules() {
  for (const button of document.querySelectorAll("#hand-set [data-set]")) {
    button.setAttribute("aria-checked", String(button.dataset.set === rules.handSet));
  }
  const names = leftOut?.[rules.handSet] ?? [];
  $("#hand-set-note").textContent =
    rules.handSet === "all" || leftOut === null ? HAND_SET_TEXT[rules.handSet] : `${HAND_SET_TEXT[rules.handSet]} ${names.join(", ")}.`;
  // Pending: the hand on the table was dealt under another set.
  const inForce = state.payload?.houseRules?.handSet;
  $("#hand-set-pending").hidden = inForce === undefined || inForce === rules.handSet;
  $("#goulash-rule").setAttribute("aria-checked", String(rules.goulashNoHalfLimit));
  $("#fish-rule").setAttribute("aria-checked", String(rules.winNeedsFish));
}

function showSound() {
  $("#sound").setAttribute("aria-checked", String(!sound.muted));
}

/* Large discards: only a phone shows them, so only a phone offers the switch. */
function showLargeDiscards() {
  $("#large-discards-row").hidden = !roundLayersWanted(viewport.width, viewport.height);
  $("#large-discards").setAttribute("aria-checked", String(largeDiscards.on));
}

function showDiscardLayout() {
  for (const button of document.querySelectorAll("#discard-layout [data-layout]")) {
    button.setAttribute("aria-checked", String(button.dataset.layout === discardLayout.id));
  }
}

function showPace() {
  for (const button of document.querySelectorAll("#pace [data-pace]")) {
    button.setAttribute("aria-checked", String(button.dataset.pace === pace.id));
  }
}

function showLevel() {
  for (const button of document.querySelectorAll("#level [data-level]")) {
    button.setAttribute("aria-checked", String(button.dataset.level === level.id));
  }
}

function showOpening() {
  for (const button of document.querySelectorAll("#opening-pref [data-opening]")) {
    button.setAttribute("aria-checked", String((button.dataset.opening === "on") === openingPref.enabled));
  }
}

/* The left-out hands are named by the table, never by a list kept here. */
async function nameHands() {
  try {
    const { handSets } = await request("/api/house-rules");
    leftOut = Object.fromEntries(handSets.map((set) => [set.id, set.leftOut]));
    showRules();
  } catch {
    // The sentence reads without the names.
  }
}

/* New game ends the game in progress, so it asks first, in place of the links. */
function askNewGame(asking) {
  $("#new-game-confirm").hidden = !asking;
  $("#option-links").hidden = asking;
}

function closeOptions() {
  $("#options-sheet").hidden = true;
  askNewGame(false);
}

/** `hooks.newGame` starts a fresh game. */
export function installOptions({ newGame }) {
  showSound();
  showLargeDiscards();
  showDiscardLayout();
  showPace();
  showLevel();
  showOpening();
  showRules();

  $("#options").addEventListener("click", () => {
    showSound();
    showLargeDiscards();
    showRules();
    void nameHands();
    $("#options-sheet").hidden = false;
    $("#options-close").focus();
  });
  $("#options-close").addEventListener("click", closeOptions);
  $("#new-game").addEventListener("click", () => {
    askNewGame(true);
    $("#new-game-keep").focus();
  });
  $("#new-game-keep").addEventListener("click", () => {
    askNewGame(false);
    $("#new-game").focus();
  });
  $("#new-game-go").addEventListener("click", () => {
    closeOptions();
    void newGame();
  });
  $("#options-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeOptions();
  });
  window.addEventListener("keydown", (event) => {
    // Help, Report and Install open on top of this sheet; Escape closes the top one first.
    const onTop = ["#help-sheet", "#report-sheet", "#install-sheet"].some((sheet) => !$(sheet).hidden);
    if (event.key === "Escape" && !onTop) closeOptions();
  }, true);

  /* Sound: on by default; the choice is remembered on the device. */
  $("#sound").addEventListener("click", () => {
    sound.setMuted(!sound.muted);
    showSound();
    sound.cue("press"); // heard only when sound has just been turned on
  });

  /* Large discards: on by default; the table follows at once, mid-round too. */
  $("#large-discards").addEventListener("click", () => {
    largeDiscards.set(!largeDiscards.on);
    showLargeDiscards();
  });

  /* Dice and dealing: takes effect with the next deal. */
  $("#opening-pref").addEventListener("click", (event) => {
    const button = event.target.closest("[data-opening]");
    if (button === null) return;
    openingPref.set(button.dataset.opening === "on");
    showOpening();
  });

  /* Pace: takes effect at once, the next move already runs at it. */
  $("#pace").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pace]");
    if (button === null) return;
    pace.set(button.dataset.pace);
    showPace();
  });

  /* Discards: rows or the centre pile (#122); the table re-lays them at once. */
  $("#discard-layout").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout]");
    if (button === null) return;
    discardLayout.set(button.dataset.layout);
    showDiscardLayout();
  });

  /* Bot level: sent with every bot move, so the next one already plays at it. */
  $("#level").addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (button === null) return;
    level.set(button.dataset.level);
    showLevel();
  });

  $("#hand-set").addEventListener("click", (event) => {
    const button = event.target.closest("[data-set]");
    if (button === null) return;
    rules.handSet = button.dataset.set;
    saveRules();
    showRules();
  });

  $("#goulash-rule").addEventListener("click", () => {
    rules.goulashNoHalfLimit = !rules.goulashNoHalfLimit;
    saveRules();
    showRules();
  });

  $("#fish-rule").addEventListener("click", () => {
    rules.winNeedsFish = !rules.winNeedsFish;
    saveRules();
    showRules();
  });
}
