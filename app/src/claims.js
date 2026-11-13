/**
 * The claims sheet: every player's flowers, seasons and exposed melds, large
 * and upright, for when the lanes along the walls are too small to read (a
 * phone). A tap on a seat's lane, or on its seat label, opens it with that
 * seat's row lit; a tap anywhere closes it. It shows only what the table
 * already shows face up (a concealed kong keeps its ends face down), and it
 * follows the table while open: a new meld appears in its row with a glow.
 *
 * Plain DOM over the canvas, like the seat labels.
 */

import { claimsSeatAt } from "./layout.js";
import { board, faceChip, scores, state } from "./shared.js";
import { FISH } from "./seat-labels.js";
import { feltPoint, renderer, viewport } from "./stage.js";

/** Rows in the order the others play after you, then you, by `rel`. */
const ORDER = [1, 2, 3, 0];
const WHO = ["You", "Right", "Across", "Left"];

let sheet = null;
let shown = null; // the rel of the lit row, or null when closed
/** Melds per seat when the sheet last drew, so a new meld can glow. */
let drawnCounts = null;

function build() {
  sheet = document.createElement("div");
  sheet.className = "claims-sheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="claims-panel" role="dialog" aria-modal="true" aria-label="Claims"></div>';
  // Any tap closes it, the panel included: there is nothing in it to press.
  // Only a tap that began on the sheet: the tap that opened it ends with a
  // click on the sheet too (on touch), and that one must not close it.
  let pressed = false;
  sheet.addEventListener("pointerdown", () => {
    pressed = true;
  });
  sheet.addEventListener("click", () => {
    if (pressed) closeClaims();
    pressed = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shown !== null) closeClaims();
  });
  document.body.append(sheet);
}

/**
 * Whose claims a pointer event on the table asks for (a `rel`), or null: a
 * tap near a seat's laid-out tiles, or between its wall and the rail.
 */
export function claimsTap(event) {
  if (state.payload === null) return null;
  // Your own lane lies just above your hand, in the hand strip's headroom:
  // there only a tap near a laid-out tile counts, and never on the hand's row.
  const fromBottom = renderer.domElement.getBoundingClientRect().bottom - event.clientY;
  if (fromBottom <= viewport.handTop) return null;
  const hit = feltPoint(event, { strip: true });
  return hit === null ? null : claimsSeatAt(hit.x, hit.z, board.claimTiles(), { nearOnly: fromBottom <= viewport.strip });
}

export const claimsOpen = () => shown !== null;

/** Open the sheet with seat `rel`'s row lit. */
export function openClaims(rel) {
  if (state.payload === null) return;
  if (sheet === null) build();
  shown = rel;
  drawnCounts = null;
  render();
  sheet.hidden = false;
  document.documentElement.classList.add("claims-on");
}

export function closeClaims() {
  if (sheet === null || shown === null) return;
  shown = null;
  sheet.hidden = true;
  document.documentElement.classList.remove("claims-on");
}

/** The table moved on: redraw an open sheet (a new hand closes it). */
export function refreshClaims() {
  if (shown === null) return;
  if (state.payload === null) closeClaims();
  else render();
}

/** A seat's groups: its bonus tiles (if any), then its melds in the order made; null keys are tile backs. */
function groupsOf(entry) {
  const bonus = [...entry.flowers, ...entry.seasons].sort();
  const melds = entry.melds.map((meld) => {
    // A concealed kong shows its two middle tiles; its ends stay face down, as on the table.
    if (meld.kind === "kong" && !meld.exposed) return meld.tiles.map((key, index) => (index === 0 || index === 3 ? null : key));
    return [...meld.tiles];
  });
  return { bonus, melds };
}

function render() {
  const panel = sheet.firstElementChild;
  const payload = state.payload;
  const totals = scores();
  const fishing = new Set(payload.view.fishing.map((entry) => entry.seat));
  const byRel = new Map(payload.table.map((entry) => [board.rel(entry.seat), entry]));
  const marked = board.lifted?.key ?? null;
  const counts = new Map();
  let widest = 0;
  panel.replaceChildren();
  for (const rel of ORDER) {
    const entry = byRel.get(rel);
    if (entry === undefined) continue;
    const { bonus, melds } = groupsOf(entry);
    counts.set(rel, melds.length);
    const row = document.createElement("div");
    row.className = `claims-row${rel === shown ? " lit" : ""}`;
    row.dataset.rel = String(rel);
    const who = document.createElement("div");
    who.className = "claims-who";
    who.innerHTML =
      `<b class="claims-wind${entry.dealer ? " dealer" : ""}">${entry.wind}</b>` +
      `<span class="claims-name">${WHO[rel]}</span>` +
      `<span class="claims-score">${totals[entry.seat].toLocaleString("en")}</span>` +
      (fishing.has(entry.seat) ? FISH : "");
    const tiles = document.createElement("div");
    tiles.className = "claims-tiles";
    if (bonus.length + melds.length === 0) {
      tiles.innerHTML = '<span class="claims-none">No claims</span>';
    } else {
      const previous = drawnCounts?.get(rel) ?? null;
      const groups = [...(bonus.length > 0 ? [{ keys: bonus, bonus: true }] : []), ...melds.map((keys, meld) => ({ keys, bonus: false, meld }))];
      groups.forEach((group) => {
        const element = document.createElement("span");
        element.className = `claims-group${group.bonus ? " bonus" : ""}`;
        if (previous !== null && !group.bonus && group.meld >= previous) element.classList.add("fresh");
        for (const key of group.keys) {
          const chip = faceChip(key);
          if (key !== null && key === marked) chip.classList.add("claims-copy");
          element.append(chip);
        }
        tiles.append(element);
      });
      widest = Math.max(widest, groups.reduce((sum, group) => sum + group.keys.length, 0) + groups.length * 0.45 + (bonus.length > 0 ? 0.5 : 0));
    }
    row.append(who, tiles);
    panel.append(row);
  }
  drawnCounts = counts;
  // One tile size for the whole sheet, as large as the fullest row allows.
  sheet.hidden = false;
  const room = panel.querySelector(".claims-tiles")?.clientWidth ?? 0;
  const size = widest > 0 && room > 0 ? Math.min(40, Math.floor(room / widest) - 2) : 40;
  panel.style.setProperty("--claims-w", `${Math.max(14, size)}px`);
}

/** The seat labels open the sheet too (they sit on the felt with the centre pile). */
document.addEventListener("click", (event) => {
  const label = event.target instanceof Element ? event.target.closest(".seat-label") : null;
  if (label !== null) openClaims(Number(label.dataset.rel));
});
