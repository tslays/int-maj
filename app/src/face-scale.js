/**
 * How sharp to paint the tile faces (`tiles.js`). Faces are drawn in a
 * 300-wide space and painted larger on big screens, so the art stays crisp on
 * a television or a wall display: the scale grows with the screen's longest
 * side in device pixels (at most 2 per CSS pixel), in quarter steps, from 1x on
 * phones, about 1.5x on a retina laptop, 2x on a 4K screen and up to 2.5x
 * beyond, and never past the GPU's largest texture. Pure, for Node tests.
 */

/** The face canvas's height at 1x (300 wide, in the tile's own shape). */
const FACE_TALL = 410;
const MAX_SCALE = 2.5;

export function faceScaleFor({ width, height, pixelRatio, maxTexture }) {
  const longest = Math.max(width, height) * Math.min(pixelRatio || 1, 2);
  const wanted = Math.min(MAX_SCALE, Math.max(1, Math.round((longest / 2000) * 4) / 4));
  const fits = Math.max(1, Math.floor((maxTexture / FACE_TALL) * 4) / 4);
  return Math.min(wanted, fits);
}
