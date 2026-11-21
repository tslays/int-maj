/**
 * Settings, Style: the theme chips and a row of swatches for the felt, the
 * tile backs, faces and fronts, the room and the buttons (`appearance.js`),
 * over a small preview of the table. Only the fronts that suit the chosen
 * faces are offered. The 3D table behind the sheet follows at once.
 * Swatches are named for screen readers only: no tooltips anywhere. Reset
 * style puts the look alone back to Modern, leaving every other setting.
 */

import { appearance, ASPECTS, BUNDLES, frontsFor } from "./appearance.js";
import { $, faceChip, toast } from "./shared.js";

/** What each swatch shows: the colour, or the colours, the choice makes. */
const PAINT = {
  felt: (swatch) => `radial-gradient(circle at 50% 45%, ${swatch.stops[0]}, ${swatch.stops[1]} 60%, ${swatch.stops[2]})`,
  back: (swatch) => swatch.chip,
  front: (swatch) => swatch.chip,
  room: (swatch) => `linear-gradient(135deg, ${swatch.rail} 0 50%, ${swatch.floor} 50% 100%)`,
  accent: (swatch) => `linear-gradient(135deg, ${swatch.gold[1]} 0 34%, ${swatch.blue[1]} 34% 67%, ${swatch.silver[1]} 67% 100%)`,
  faces: (swatch) => frontsFor(swatch)[0].chip,
};

/** The tile a face set's swatch shows: the five circles differ most between sets. */
const FACES_SAMPLE = "o5";

function radio(label, checked) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-checked", String(checked));
  button.tabIndex = checked ? 0 : -1;
  if (label !== null) button.setAttribute("aria-label", label);
  return button;
}

function buildSwatches() {
  for (const { aspect, swatches } of ASPECTS) {
    const group = $(`#style-${aspect}`);
    group.replaceChildren(
      ...swatches.map((swatch) => {
        const button = radio(swatch.name, false);
        button.className = `swatch swatch-${aspect}`;
        button.dataset.swatch = swatch.id;
        button.style.setProperty("--swatch", PAINT[aspect](swatch));
        if (aspect === "faces") {
          const image = document.createElement("img");
          image.src = `assets/faces/${swatch.id}/${FACES_SAMPLE}.svg`;
          image.alt = "";
          button.append(image);
        }
        return button;
      }),
    );
  }
  $("#style-bundle").replaceChildren(
    ...BUNDLES.map((bundle) => {
      const button = radio(null, false);
      button.dataset.bundle = bundle.id;
      button.textContent = bundle.name;
      return button;
    }),
  );
  // The preview: a strip of felt in its rail, two faces and two backs, and a button.
  const tiles = document.createElement("div");
  tiles.className = "style-preview-tiles";
  tiles.append(faceChip("c5"), faceChip("dR"), faceChip("wE"), faceChip(null), faceChip(null));
  const key = document.createElement("span");
  key.className = "style-preview-key";
  key.textContent = "Mah Jong";
  $("#style-preview").replaceChildren(tiles, key);
}

function check(group, selector, on) {
  for (const button of group.querySelectorAll(selector)) {
    const checked = on(button);
    button.setAttribute("aria-checked", String(checked));
    button.tabIndex = checked ? 0 : -1;
  }
}

/** Every Style control as the choices stand. */
export function showStyle() {
  for (const { aspect } of ASPECTS) {
    const choice = appearance[aspect];
    check($(`#style-${aspect}`), "[data-swatch]", (button) => button.dataset.swatch === choice.id);
    $(`#style-${aspect}-name`).textContent = choice.swatch.name;
  }
  const suited = new Set(frontsFor(appearance.faces.swatch).map((front) => front.id));
  for (const button of $("#style-front").querySelectorAll("[data-swatch]")) button.hidden = !suited.has(button.dataset.swatch);
  const bundle = appearance.matchingBundle();
  check($("#style-bundle"), "[data-bundle]", (button) => button.dataset.bundle === bundle);
  $("#style-bundle-note").textContent = bundle === null ? "Custom: your own mix" : "Sets everything below at once";
  // With no theme matching, the first chip still takes the focus by Tab.
  if (bundle === null) $("#style-bundle [data-bundle]").tabIndex = 0;
  $("#style-reset").disabled = bundle === BUNDLES[0].id;
}

/** Left and right (up and down) move the choice along a row, as in any radio group. */
function arrowKeys(group, pick) {
  group.addEventListener("keydown", (event) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = [...group.querySelectorAll("[role=radio]")].filter((button) => !button.hidden);
    const at = Math.max(0, buttons.indexOf(document.activeElement));
    const next = buttons[(at + move + buttons.length) % buttons.length];
    pick(next);
    next.focus();
  });
}

export function installStyleOptions() {
  buildSwatches();
  showStyle();
  appearance.onChange(showStyle);
  for (const { aspect } of ASPECTS) {
    const group = $(`#style-${aspect}`);
    const pick = (button) => appearance[aspect].set(button.dataset.swatch);
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-swatch]");
      if (button !== null) pick(button);
    });
    arrowKeys(group, pick);
  }
  const bundles = $("#style-bundle");
  const pickBundle = (button) => appearance.applyBundle(button.dataset.bundle);
  bundles.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bundle]");
    if (button !== null) pickBundle(button);
  });
  arrowKeys(bundles, pickBundle);
  $("#style-reset").addEventListener("click", () => {
    // Focus stays in the tab: the button is disabled once the look is Modern.
    $(`#style-bundle [data-bundle="${BUNDLES[0].id}"]`).focus();
    appearance.reset();
    toast("Style reset");
  });
}
