/**
 * First-game tips: a short note at the top of the table the first time
 * something new happens (your first throw, the first call offered, the first
 * result...). Each shows once on this device; "No more tips" stops them and
 * the guide's "Show tips again" brings them back. Review boards show none.
 *
 * Before the very first deal on a device a welcome card offers the guide.
 */

import { openGuide } from "./guide.js";
import { $, storage } from "./shared.js";

const KEY = "int-maj.tips";
const PARAMS = new URLSearchParams(window.location.search);
const REVIEW = PARAMS.has("state");

function load() {
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? "{}");
    return { off: saved?.off === true, seen: Array.isArray(saved?.seen) ? saved.seen : [] };
  } catch {
    return { off: false, seen: [] };
  }
}

const memory = load();

function save() {
  try {
    storage()?.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Not stored: the tips may show again next time.
  }
}

/** Whether the tip `id` would still show. */
export function tipPending(id) {
  return !REVIEW && !memory.off && !memory.seen.includes(id);
}

let bubble = null;

export function hideTip() {
  if (bubble === null) return;
  const old = bubble;
  bubble = null;
  old.classList.add("tip-out");
  setTimeout(() => old.remove(), 220);
}

/**
 * Show the tip `id` (text, with an optional bold `title`) unless it has
 * shown before; it counts as seen at once. Returns whether it showed.
 */
export function showTip(id, text, title = "Tip", { guide = false } = {}) {
  if (!tipPending(id)) return false;
  memory.seen.push(id);
  save();
  hideTip();
  const box = document.createElement("div");
  box.className = "tip";
  box.setAttribute("role", "status");
  const head = document.createElement("b");
  head.textContent = title;
  const body = document.createElement("p");
  body.textContent = text;
  const buttons = document.createElement("div");
  buttons.className = "tip-buttons";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "tip-ok";
  ok.textContent = "Got it";
  ok.addEventListener("click", hideTip);
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "tip-stop";
  stop.textContent = "No more tips";
  stop.addEventListener("click", () => {
    memory.off = true;
    save();
    hideTip();
  });
  buttons.append(stop);
  if (guide) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "tip-ok";
    open.textContent = "Guide";
    open.addEventListener("click", () => {
      hideTip();
      openGuide();
    });
    buttons.append(open);
  }
  buttons.append(ok);
  box.append(head, body, buttons);
  // The table must not take a tap meant for the tip.
  for (const type of ["pointerdown", "pointerup", "click", "touchstart"]) {
    box.addEventListener(type, (event) => event.stopPropagation());
  }
  document.body.append(box);
  bubble = box;
  return true;
}

/** Bring every tip back (the guide's "Show tips again"). */
export function tipsReset() {
  memory.off = false;
  memory.seen = [];
  save();
}

/**
 * The tip for a decision of yours: the first of those that apply which has
 * not shown yet, so a new tip comes with each of your first turns.
 */
export function tipForChoices(legal, { callsOff }) {
  hideTip();
  const has = (test) => legal.some(test);
  const candidates = [];
  if (has((a) => a.type === "Win" || (a.type === "Claim" && a.kind === "mahjong"))) {
    candidates.push(["win", "Your hand is complete. Tap Mah Jong to win it!", "You can win"]);
  }
  if (has((a) => a.type === "DeclareFishing")) {
    candidates.push([
      "fishing",
      "You are one tile from winning. Fishing announces it, and the tiles shown are the ones you wait on; Don't announce keeps it to yourself.",
      "Fishing",
    ]);
  }
  if (has((a) => a.type === "GoulashExchange")) {
    candidates.push(["goulash", "Tap three tiles to pass on, then Pass 3 tiles.", "Goulash"]);
  }
  if (has((a) => a.type === "RequestReshuffle")) {
    candidates.push(["reshuffle", "If the deal gives you nothing to build on, Reshuffle asks for a new one.", "A poor deal?"]);
  }
  if (!callsOff && has((a) => a.type === "Claim" && a.kind !== "mahjong")) {
    candidates.push([
      "claim",
      "You can use the tile just thrown: each button shows the set it would make. Take it, or Pass to let it go.",
      "A call",
    ]);
  }
  if (!callsOff && has((a) => a.type === "ConcealedKong" || a.type === "AddedKong")) {
    candidates.push(["kong", "You have four alike: Kong declares them. Or throw a tile as usual.", "A kong"]);
  }
  if (has((a) => a.type === "Discard")) {
    candidates.push([
      "throw",
      "Tap a tile to lift it, tap it again to throw it.",
      "Your turn",
      { guide: true },
    ]);
    if ($("#closest") !== null && !$("#closest").hidden) {
      candidates.push(["closest", "Top right: the hands your tiles are nearest to. Tap one to see it.", "Closest hands"]);
    }
    candidates.push(["discards", "Tap the middle of the table to see every discard large. Tap again to go back.", "Study the discards"]);
    candidates.push(["arrange", "Drag a tile sideways to arrange your hand your own way. Sort puts it back in order.", "Your hand"]);
  }
  for (const [id, text, title, extra] of candidates) {
    if (tipPending(id)) {
      showTip(id, text, title, extra);
      return;
    }
  }
}

/* --------------------------------------------------------- welcome */

/**
 * The first time the game opens on this device (not on a review board or a
 * link with a pinned `?seed=`): a card offering the guide before the first
 * deal. Resolves when the player chooses to play, or closes the guide.
 */
export function welcome() {
  if (REVIEW || PARAMS.has("seed") || memory.seen.includes("welcome")) return Promise.resolve();
  memory.seen.push("welcome");
  save();
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "welcome";
    box.innerHTML = `
      <div class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <p class="welcome-kicker">International mahjong · by the book</p>
        <h2 id="welcome-title">Welcome to the table</h2>
        <p>You play against three bots, on this device. New to mahjong, or to this app? A one-minute guide shows the aim, the taps and the buttons.</p>
        <div class="welcome-buttons">
          <button class="act act-win" id="welcome-guide" type="button"><span>Show me how</span></button>
          <button class="act act-pass" id="welcome-play" type="button"><span>Just play</span></button>
        </div>
        <p class="welcome-fine">Help in the menu opens the guide at any time.</p>
      </div>`;
    document.body.append(box);
    const done = () => {
      box.remove();
      resolve();
    };
    box.querySelector("#welcome-play").addEventListener("click", done);
    box.querySelector("#welcome-guide").addEventListener("click", () => {
      box.remove();
      openGuide();
      // The game deals when the guide is closed.
      const sheet = $("#help-sheet");
      const watch = new MutationObserver(() => {
        if (sheet.hidden) {
          watch.disconnect();
          resolve();
        }
      });
      watch.observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
    });
    box.querySelector("#welcome-guide").focus();
  });
}
