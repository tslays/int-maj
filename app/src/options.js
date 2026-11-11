/**
 * The Options sheet: sound, the house rules, and the doors to Help and
 * Report a problem.
 *
 * A house rule is a preference kept on the device. The table fixes a hand's
 * rules at its deal, so `houseRules()` is sent with every new game and every
 * next hand, and a change made mid-hand shows as pending until then.
 */

import { sound } from "./sound.js";
import { $, request, state, storage } from "./shared.js";

const RULES_KEY = "int-maj:house-rules";

function savedRules() {
  try {
    const saved = JSON.parse(storage()?.getItem(RULES_KEY) ?? "{}");
    return { companionHandsOnly: saved?.companionHandsOnly === true };
  } catch {
    return { companionHandsOnly: false };
  }
}

const rules = savedRules();

/** The house rules the player has chosen, for the next deal. */
export function houseRules() {
  return { ...rules };
}

/* An option's switch says its state in words as well as by its light. */
function showSwitch(selector, on) {
  const button = $(selector);
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", String(on));
  button.firstElementChild.textContent = on ? "On" : "Off";
}

function showRules() {
  showSwitch("#rule-companion", rules.companionHandsOnly);
  // Pending: the hand on the table was dealt under the other setting.
  const inForce = state.payload?.houseRules?.companionHandsOnly;
  $("#rule-companion-pending").hidden = inForce === undefined || inForce === rules.companionHandsOnly;
}

function showSound() {
  showSwitch("#sound", !sound.muted);
}

/* The left-out hands are named by the table, never by a list kept here. */
async function nameHands() {
  try {
    const { companionHandsOnly } = await request("/api/house-rules");
    const names = companionHandsOnly.hands;
    if (names.length === 0) return;
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    $("#rule-companion-hands").textContent = ` (${list})`;
  } catch {
    // The sentence reads without the names.
  }
}

function closeOptions() {
  $("#options-sheet").hidden = true;
}

export function installOptions() {
  showSound();
  showRules();

  $("#options").addEventListener("click", () => {
    showSound();
    showRules();
    void nameHands();
    $("#options-sheet").hidden = false;
    $("#options-close").focus();
  });
  $("#options-close").addEventListener("click", closeOptions);
  $("#options-sheet").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeOptions();
  });
  window.addEventListener("keydown", (event) => {
    // Help and Report open on top of this sheet; Escape closes the top one first.
    if (event.key === "Escape" && $("#help-sheet").hidden && $("#report-sheet").hidden) closeOptions();
  }, true);

  /* Sound: on by default; the choice is remembered on the device. */
  $("#sound").addEventListener("click", () => {
    sound.setMuted(!sound.muted);
    showSound();
    sound.cue("press"); // heard only when sound has just been turned on
  });

  $("#rule-companion").addEventListener("click", () => {
    rules.companionHandsOnly = !rules.companionHandsOnly;
    try {
      storage()?.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      // Storage refused: the choice lasts until the page is closed.
    }
    showRules();
  });
}
