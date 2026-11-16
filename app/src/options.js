/**
 * The Options sheet, in three tabs: Game (bot level, pace, dice and dealing),
 * Table (sound, large discards on phones, the discard layout) and Rules (the
 * house rules), with the doors to New game, Help and Report a problem under
 * every tab.
 *
 * A house rule is a preference kept on the device. The table fixes a hand's
 * rules at its deal, so `houseRules()` is sent with every new game and every
 * next hand, and a change made mid-hand shows as pending until then.
 */

import { refreshHints } from "./hints.js";
import { hintStyle, HINT_STYLES } from "./hint-style.js";
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
/** Widest first: each step leaves out what the one before does, and more. */
const HAND_SETS = ["all", "companion", "companion-pictured", "rare"];

/**
 * What each step of the filter means. Each step leaves out what the one before
 * does and more; the table names only the hands the step adds.
 */
const HAND_SET_TEXT = {
  all: "Every hand either book prints. Each step to the right leaves out more.",
  companion: "Only the hands the Companion prints. Left out:",
  "companion-pictured": "Only Companion hands with a sample picture. Also left out:",
  rare: "Our own house rule: also drops the easy hands nearly any deal is halfway to, so the rarer ones are worth chasing. Left out:",
};

const TABS = ["game", "table", "rules"];

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
/** What the table reports for each set: the names it leaves out and how many hands stay. */
let leftOut = null;
let inPlay = null;
let total = null;
/** The tab the sheet opens on: the last one used while the page is open. */
let tab = "game";

/** The house rules the player has chosen, for the next deal. */
export function houseRules() {
  return { ...rules };
}

function showRules() {
  for (const button of document.querySelectorAll("#hand-set [data-set]")) {
    button.setAttribute("aria-checked", String(button.dataset.set === rules.handSet));
  }
  // Each step names only what it adds to the step before (Robin is already out of Pictured).
  const step = HAND_SETS.indexOf(rules.handSet);
  const before = new Set(step > 0 ? (leftOut?.[HAND_SETS[step - 1]] ?? []) : []);
  const names = (leftOut?.[rules.handSet] ?? []).filter((name) => !before.has(name));
  $("#hand-set-note").textContent =
    rules.handSet === "all" || names.length === 0
      ? HAND_SET_TEXT[rules.handSet].replace(/ (Also left|Left) out:$/, "").replace(/:$/, ".")
      : `${HAND_SET_TEXT[rules.handSet]} ${names.join(", ")}.`;
  $("#hand-count").textContent = inPlay === null ? "" : `${inPlay[rules.handSet]} of ${total} hands`;
  // Pending: the hand on the table was dealt under other rules.
  const inForce = state.payload?.houseRules;
  const pending =
    inForce !== undefined &&
    (inForce.handSet !== rules.handSet ||
      inForce.goulashNoHalfLimit !== rules.goulashNoHalfLimit ||
      inForce.winNeedsFish !== rules.winNeedsFish);
  $("#hand-set-pending").hidden = !pending;
  $("#rules-dot").hidden = !pending;
  $("#goulash-rule").setAttribute("aria-checked", String(rules.goulashNoHalfLimit));
  $("#fish-rule").setAttribute("aria-checked", String(rules.winNeedsFish));
}

function showTab(name) {
  tab = name;
  for (const button of document.querySelectorAll("#options-tabs [data-tab]")) {
    const selected = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const id of TABS) $(`#panel-${id}`).hidden = id !== name;
  $(".options-body").scrollTop = 0;
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

function showHintStyle() {
  for (const button of document.querySelectorAll("#hint-style [data-hint-style]")) {
    button.setAttribute("aria-checked", String(button.dataset.hintStyle === hintStyle.id));
  }
  $("#hint-style-note").textContent = HINT_STYLES.find((entry) => entry.id === hintStyle.id)?.about ?? "";
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
    const offered = await request("/api/house-rules");
    leftOut = Object.fromEntries(offered.handSets.map((set) => [set.id, set.leftOut]));
    inPlay = Object.fromEntries(offered.handSets.map((set) => [set.id, set.inPlay]));
    total = offered.total;
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
  showHintStyle();
  showLevel();
  showOpening();
  showRules();

  $("#options").addEventListener("click", () => {
    showSound();
    showLargeDiscards();
    showRules();
    void nameHands();
    showTab(tab);
    $("#options-sheet").hidden = false;
    $("#options-close").focus();
  });
  $("#options-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button !== null) showTab(button.dataset.tab);
  });
  $("#options-tabs").addEventListener("keydown", (event) => {
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (move === 0) return;
    const next = TABS[(TABS.indexOf(tab) + move + TABS.length) % TABS.length];
    showTab(next);
    $(`#tab-${next}`).focus();
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

  /* Table animations (dice, dealing, thrown counters): takes effect with the next deal or result. */
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

  /* Hint style: the panel picks its hands anew at once. */
  $("#hint-style").addEventListener("click", (event) => {
    const button = event.target.closest("[data-hint-style]");
    if (button === null || !hintStyle.set(button.dataset.hintStyle)) return;
    showHintStyle();
    void refreshHints(true);
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
