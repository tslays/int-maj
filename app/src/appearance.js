/**
 * The look of the table (Settings, Style): the felt, the tile backs and
 * fronts, the room around the table and the accent colours of the buttons,
 * each a curated swatch, plus themes that set all five at once. Device
 * preferences like the sound and the pace, safe with missing, refusing or
 * garbled storage; they change only how the table looks, never the game.
 *
 * Pure data and preferences, for Node tests; `appearance-apply.js` paints
 * them onto the 3D table and the page.
 */

import { browserStorage, storedString } from "./prefs.js";

/** Felt: a radial gradient (centre, middle, edge), the engraved guides and the light the felt throws back. */
export const FELTS = [
  { id: "jade", name: "Jade", stops: ["#1f716d", "#185a59", "#0b3334"], guide: "rgba(4, 26, 26, 0.45)", bounce: "#10292a" },
  { id: "emerald", name: "Emerald", stops: ["#2a7a45", "#1f6036", "#0d311b"], guide: "rgba(4, 24, 10, 0.45)", bounce: "#10291a" },
  { id: "navy", name: "Navy", stops: ["#24497a", "#1b3a63", "#0b1c33"], guide: "rgba(4, 12, 28, 0.5)", bounce: "#101c2c" },
  { id: "burgundy", name: "Burgundy", stops: ["#7a2632", "#621d28", "#320c12"], guide: "rgba(28, 4, 8, 0.5)", bounce: "#2a1014" },
  { id: "plum", name: "Plum", stops: ["#5d3672", "#4a2a5c", "#24122e"], guide: "rgba(20, 6, 26, 0.5)", bounce: "#221428" },
  { id: "charcoal", name: "Charcoal", stops: ["#454b50", "#363b3f", "#17191b"], guide: "rgba(0, 0, 0, 0.45)", bounce: "#1a1c1e" },
  { id: "sand", name: "Sand", stops: ["#9a8058", "#806a48", "#4a3c26"], guide: "rgba(40, 28, 10, 0.45)", bounce: "#2a2418" },
];

/** Tile backs: the lacquer of the 3D tiles, and the flat colour of the small chips. */
export const BACKS = [
  { id: "sky", name: "Sky", tile: "#7fc2e4", chip: "#8ccbea" },
  { id: "jade", name: "Jade", tile: "#3fa47c", chip: "#55b48e" },
  { id: "crimson", name: "Crimson", tile: "#c2343c", chip: "#cf4a50" },
  { id: "amber", name: "Amber", tile: "#e0a12e", chip: "#e8b04a" },
  { id: "violet", name: "Violet", tile: "#7d5cc6", chip: "#9074d0" },
  { id: "coral", name: "Coral", tile: "#ef7d64", chip: "#f2907a" },
  { id: "ink", name: "Ink", tile: "#23272e", chip: "#3a404a" },
];

/** Tile fronts: all light, so every face's ink stays easy to read. */
export const FRONTS = [
  { id: "ivory", name: "Ivory", tile: "#f1efe9", chip: "#f8f6f0" },
  { id: "bone", name: "Bone", tile: "#efe3c8", chip: "#f4ead4" },
  { id: "pearl", name: "Pearl", tile: "#f4f6fa", chip: "#fbfcfe" },
  { id: "mint", name: "Mint", tile: "#e2f0e6", chip: "#ecf6ef" },
];

/** The room: the table's rail, and the floor and backdrop around it (the page behind the menus too). */
export const ROOMS = [
  { id: "slate", name: "Slate", rail: "#2a3236", floor: "#11191c" },
  { id: "walnut", name: "Walnut", rail: "#5a3a24", floor: "#1a130e" },
  { id: "midnight", name: "Midnight", rail: "#262a3e", floor: "#0b0d18" },
  { id: "lounge", name: "Lounge", rail: "#4a2630", floor: "#1c1014" },
];

/** Accents: the gold, blue and silver of the buttons, keys and highlights. */
export const ACCENTS = [
  { id: "classic", name: "Classic", gold: ["#ffe08a", "#e5a12f"], blue: ["#78d8ff", "#2d7fd2"], silver: ["#f3f6f8", "#a6b2bb"] },
  { id: "jade", name: "Jade", gold: ["#c9f2a0", "#5fae3e"], blue: ["#7ff0d8", "#1f9a86"], silver: ["#eef6f2", "#9fb6ac"] },
  { id: "rose", name: "Rose", gold: ["#ffd0dc", "#e0607e"], blue: ["#d6b8ff", "#8a5ad6"], silver: ["#fbf1f4", "#bfa8b0"] },
  { id: "mono", name: "Mono", gold: ["#ffffff", "#b8bec4"], blue: ["#e2e8ee", "#7c8892"], silver: ["#f3f6f8", "#a6b2bb"] },
];

/** Themes: one tap sets all five; a single swatch changed afterwards makes it Custom. */
export const BUNDLES = [
  { id: "classic", name: "Classic", felt: "jade", back: "sky", front: "ivory", room: "slate", accent: "classic" },
  { id: "midnight", name: "Midnight", felt: "navy", back: "ink", front: "pearl", room: "midnight", accent: "mono" },
  { id: "sakura", name: "Sakura", felt: "plum", back: "coral", front: "pearl", room: "lounge", accent: "rose" },
  { id: "casino", name: "Casino", felt: "emerald", back: "crimson", front: "bone", room: "walnut", accent: "classic" },
];

/** The five aspects: the bundle field, its storage key and its swatches (the default first). */
export const ASPECTS = [
  { aspect: "felt", key: "int-maj.felt", swatches: FELTS },
  { aspect: "back", key: "int-maj.tile-back", swatches: BACKS },
  { aspect: "front", key: "int-maj.tile-front", swatches: FRONTS },
  { aspect: "room", key: "int-maj.room", swatches: ROOMS },
  { aspect: "accent", key: "int-maj.accent", swatches: ACCENTS },
];

/** One swatch kept on the device: an id from `swatches`, the first by default. */
export function createChoice({ key, swatches, storage = browserStorage }) {
  const stored = storedString(key, storage);
  const fallback = swatches[0].id;
  const known = (value) => swatches.some((swatch) => swatch.id === value);
  const read = stored.read();
  let id = known(read) ? read : fallback;
  const listeners = [];

  return {
    get id() {
      return id;
    },
    /** The chosen swatch itself. */
    get swatch() {
      return swatches.find((swatch) => swatch.id === id);
    },
    /** Choose a swatch and remember it; false for an unknown id. */
    set(value) {
      if (!known(value)) return false;
      if (value === id) return true;
      id = value;
      stored.write(id);
      for (const listener of listeners) listener(id);
      return true;
    },
    reset() {
      this.set(fallback);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

/** All five choices together, with the themes over them. */
export function createAppearance({ storage = browserStorage } = {}) {
  const choices = Object.fromEntries(ASPECTS.map(({ aspect, key, swatches }) => [aspect, createChoice({ key, swatches, storage })]));
  return {
    ...choices,
    /** Set every aspect from a theme; false for an unknown one. */
    applyBundle(id) {
      const bundle = BUNDLES.find((entry) => entry.id === id);
      if (bundle === undefined) return false;
      for (const { aspect } of ASPECTS) choices[aspect].set(bundle[aspect]);
      return true;
    },
    /** The theme the five choices make up, or null: Custom. */
    matchingBundle() {
      return BUNDLES.find((bundle) => ASPECTS.every(({ aspect }) => choices[aspect].id === bundle[aspect]))?.id ?? null;
    },
    reset() {
      for (const { aspect } of ASPECTS) choices[aspect].reset();
    },
    /** Called once for any change, with the aspect that changed. */
    onChange(listener) {
      for (const { aspect } of ASPECTS) choices[aspect].onChange(() => listener(aspect));
    },
  };
}

export const appearance = createAppearance();
