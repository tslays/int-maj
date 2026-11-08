/**
 * What the table camera shows: every discard and every meld or bonus tile
 * stays on screen, clear of the hand strip along the bottom, at phone and
 * desktop shapes. The framing lives in `app/src/camera.js`, pure three.js
 * maths, so this needs no browser.
 */

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const THREE_URL = pathToFileURL(new URL("../../app/vendor/three/three.module.min.js", import.meta.url).pathname).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "three" ? { url: THREE_URL, shortCircuit: true } : next(specifier, context);
  },
});

const THREE = await import(THREE_URL);
// @ts-expect-error - a plain browser module without type declarations
const { fitTableCamera } = await import("../../app/src/camera.js");
// @ts-expect-error - a plain browser module without type declarations
const { discardRect, meldRects, TABLE, H } = await import("../../app/src/layout.js");

const SHAPES: [string, number, number][] = [
  ["desktop", 1280, 720],
  ["wide", 1920, 1080],
  ["laptop", 1024, 640],
  ["phone landscape", 844, 390],
  ["phone portrait", 390, 844],
  ["tablet portrait", 768, 1024],
];

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The screen box (NDC) of a tile's top face and base corners. */
function seen(camera: unknown, rect: Rect) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [rect.minX, rect.maxX]) {
    for (const z of [rect.minZ, rect.maxZ]) {
      for (const y of [0, 0.78]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

describe("3D table camera", () => {
  for (const [name, width, height] of SHAPES) {
    it(`shows every discard and lane tile, clear of the hand strip (${name})`, () => {
      const portrait = height > width;
      const strip = Math.round(portrait ? height * 0.16 : height * 0.27);
      const camera = new THREE.PerspectiveCamera(17, width / height, 0.5, 1200);
      fitTableCamera(camera, portrait ? 62 : 46, strip / height);
      camera.updateMatrixWorld();
      const floor = -1 + (2 * strip) / height;

      const things: { what: string; rect: Rect }[] = [];
      for (let rel = 0; rel < 4; rel++) {
        for (let index = 0; index < 24; index++) things.push({ what: `seat ${rel} discard ${index + 1}`, rect: discardRect(rel, index) });
        // A seat that has made four melds and holds all eight bonus tiles.
        const groups = [8, 3, 3, 3, 3];
        for (const [i, rect] of meldRects(rel, groups, 6, 5, { bonusFirst: true }).entries()) {
          things.push({ what: `seat ${rel} lane tile ${i + 1}`, rect });
        }
      }
      for (const { what, rect } of things) {
        const box = seen(camera, rect);
        assert.ok(box.left >= -1 && box.right <= 1, `${what} leaves the screen sideways (${box.left.toFixed(2)}..${box.right.toFixed(2)})`);
        assert.ok(box.top <= 1, `${what} is cut off at the top (${box.top.toFixed(2)})`);
        // The hand covers the middle of the strip; the corners beside it stay visible.
        const beside = box.left > 0.85 || box.right < -0.85;
        assert.ok(beside || box.bottom >= floor, `${what} hides behind the hand strip (${box.bottom.toFixed(2)} < ${floor.toFixed(2)})`);
      }
    });
  }
});
