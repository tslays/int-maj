/**
 * Canonical tile keys and the SVG art for each face.
 *
 * The 34 play tiles, the eight bonus marks and the tile back are original
 * flat sprites drawn for this project (see web/tiles/LICENSE.md). Each SVG is
 * a complete tile — face, frame and bevel — on a 3:4 canvas, so `.tile` in
 * app.css only sizes it and the table needs no drawing code of its own. A key
 * either has an SVG file or the UI shows the missing-art placeholder.
 */

export const PLAY_TILE_KEYS = Object.freeze([
  ...Array.from({ length: 9 }, (_, i) => `b${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `c${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `o${i + 1}`),
  "wE",
  "wS",
  "wW",
  "wN",
  "dR",
  "dG",
  "dW",
]);

export const BONUS_TILE_KEYS = Object.freeze([
  "f1",
  "f2",
  "f3",
  "f4",
  "s1",
  "s2",
  "s3",
  "s4",
]);

export const BONUS_NAMES = Object.freeze({
  f1: "plum flower",
  f2: "orchid flower",
  f3: "chrysanthemum flower",
  f4: "bamboo flower",
  s1: "spring season",
  s2: "summer season",
  s3: "autumn season",
  s4: "winter season",
});

/** Canonical key -> file name under web/tiles/. */
const ART = Object.create(null);
for (const key of PLAY_TILE_KEYS) ART[key] = `${key}.svg`;
for (const key of BONUS_TILE_KEYS) ART[key] = `${key}.svg`;

export const TILE_ART = Object.freeze(ART);

export const BACK_ART = "back.svg";
export const BACK_ART_URL = `/tiles/${BACK_ART}`;

/** The art file for a canonical key, or null when the key is not a tile. */
export function artFile(key) {
  return Object.hasOwn(TILE_ART, key) ? TILE_ART[key] : null;
}

/** The URL the table loads for a canonical key, or null for an unknown key. */
export function artUrl(key) {
  const file = artFile(key);
  return file === null ? null : `/tiles/${file}`;
}
