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
const { fitHandCamera, fitPondCamera, fitTableCamera } = await import("../../app/src/camera.js");
// @ts-expect-error - a plain browser module without type declarations
const { discardRect, meldRects, pondExtent, TABLE, H } = await import("../../app/src/layout.js");

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
    it(`shows every discard and lane tile, clear of the hand (${name})`, () => {
      const portrait = height > width;
      // A full hand of 14 tiles and the drawn one, the widest row there is.
      const { tileTop } = fitHandCamera(new THREE.PerspectiveCamera(5, 1, 1, 600), width, height, 15.5);
      const camera = new THREE.PerspectiveCamera(17, width / height, 0.5, 1200);
      fitTableCamera(camera, portrait ? 62 : 46, tileTop / height);
      camera.updateMatrixWorld();
      // The table reaches down to the top of the standing hand tiles, no further.
      const floor = -1 + (2 * tileTop) / height;

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
        assert.ok(beside || box.bottom >= floor, `${what} hides behind the hand (${box.bottom.toFixed(2)} < ${floor.toFixed(2)})`);
      }
    });
  }
});

describe("hand strip", () => {
  for (const [name, width, height] of SHAPES) {
    it(`is only as tall as its tiles and their lift, and shows them whole (${name})`, () => {
      const camera = new THREE.PerspectiveCamera(5, 1, 1, 600);
      const { strip, tileTop } = fitHandCamera(camera, width, height, 15.5);
      const cap = height > width ? height * 0.16 : height * 0.27;
      assert.ok(strip <= Math.max(56, Math.round(cap)), `strip ${strip}px is taller than its cap`);
      // The row fills the width, and its tiles are as tall as that allows (a tile's
      // top edge adds a little more in perspective); the strip holds that plus the lift.
      const tile = (1.36 * width) / 15.5;
      assert.ok(strip <= Math.max(56, tile * 1.45 + 4), `strip ${strip}px leaves dead space over a ${tile.toFixed(0)}px tile`);
      assert.ok(tileTop > tile && tileTop < strip, `resting tile tops at ${tileTop}px of ${strip}px`);

      // A resting tile, and the same tile lifted, both lie inside the strip.
      for (const lift of [0, 0.32]) {
        for (const x of [-7.5, 7.5]) {
          for (const y of [-0.68, 0.68]) {
            const p = new THREE.Vector3(x, y + lift, 0).project(camera);
            assert.ok(Math.abs(p.x) <= 1.0001, `tile edge x=${x} leaves the strip sideways`);
            assert.ok(p.y >= -1 && p.y <= 1, `tile edge y=${y + lift} leaves the strip (${p.y.toFixed(2)})`);
          }
        }
      }
    });
  }
});

describe("zoomed pond view", () => {
  for (const [name, width, height] of SHAPES) {
    it(`shows every discard from straight above, larger than the table view (${name})`, () => {
      const portrait = height > width;
      const { tileTop } = fitHandCamera(new THREE.PerspectiveCamera(5, 1, 1, 600), width, height, 15.5);
      const table = new THREE.PerspectiveCamera(17, width / height, 0.5, 1200);
      fitTableCamera(table, portrait ? 62 : 46, tileTop / height);
      for (const counts of [[0, 0, 0, 0], [18, 18, 18, 18], [24, 19, 22, 18]]) {
        const pond = new THREE.PerspectiveCamera(17, width / height, 0.5, 1200);
        fitPondCamera(pond, pondExtent(counts) + 0.35, 0.05);
        // Straight down, the far side of the table up the screen.
        const forward = pond.getWorldDirection(new THREE.Vector3());
        assert.ok(forward.y < -0.9999, "the camera looks straight down");
        const far = new THREE.Vector3(0, 0, -5).project(pond);
        const near = new THREE.Vector3(0, 0, 5).project(pond);
        assert.ok(far.y > near.y, "your own pond is nearest the bottom");
        counts.forEach((count, rel) => {
          for (let index = 0; index < count; index++) {
            const rect = discardRect(rel, index);
            const box = seen(pond, rect);
            assert.ok(box.left >= -1 && box.right <= 1, `seat ${rel} discard ${index + 1} is on screen across`);
            assert.ok(box.bottom >= -1 && box.top <= 1, `seat ${rel} discard ${index + 1} is on screen up and down`);
            // On the felt, the tile is drawn larger than the table view draws it.
            const size = (camera: unknown) => {
              const a = new THREE.Vector3(rect.minX, 0, rect.minZ).project(camera);
              const b = new THREE.Vector3(rect.maxX, 0, rect.maxZ).project(camera);
              return Math.abs((a.x - b.x) * (a.y - b.y));
            };
            assert.ok(size(pond) > size(table) * 1.2, `seat ${rel} discard ${index + 1} is larger zoomed`);
          }
        });
      }
    });
  }
});
