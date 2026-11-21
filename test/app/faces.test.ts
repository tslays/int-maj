/**
 * The face sets (Settings, Style, Tile faces): every set named in
 * `appearance.js` has a folder with all 42 faces as pure vector drawings, its
 * own licence file and a place in the build; the faces taken from Cangjie6
 * carry their CC BY-SA credit; and the faces are painted sharper on big
 * screens (`face-scale.js`).
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { FACE_SETS } = await import("../../app/src/appearance.js");
// @ts-expect-error - a plain browser module without type declarations
const { faceScaleFor } = await import("../../app/src/face-scale.js");

const FACES = new URL("../../app/assets/faces/", import.meta.url);
const KEYS = [
  ..."123456789".split("").flatMap((rank) => ["b", "c", "o"].map((suit) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
  "f1", "f2", "f3", "f4", "s1", "s2", "s3", "s4",
];
const BONUS = ["f1", "f2", "f3", "f4", "s1", "s2", "s3", "s4"];

function face(set: string, key: string): string {
  return readFileSync(new URL(`${set}/${key}.svg`, FACES), "utf8");
}

describe("the face sets", () => {
  it("has a folder of exactly the 42 faces for every set, and no other folder", () => {
    const folders = readdirSync(FACES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    assert.deepEqual(folders.sort(), FACE_SETS.map((set: any) => set.id).sort());
    for (const { id } of FACE_SETS) {
      const svgs = readdirSync(new URL(`${id}/`, FACES)).filter((name) => name.endsWith(".svg"));
      assert.deepEqual(svgs.sort(), KEYS.map((key) => `${key}.svg`).sort(), id);
    }
  });

  it("draws every face as a vector with no embedded picture, text or script", () => {
    for (const { id } of FACE_SETS) {
      for (const key of KEYS) {
        const svg = face(id, key);
        assert.match(svg, /^<svg[^>]*viewBox="[^"]+"/, `${id}/${key} is an SVG with a view box`);
        assert.doesNotMatch(svg, /<(image|text|script|foreignObject)\b|data:image|href="http/i, `${id}/${key}`);
      }
    }
  });

  it("credits Cangjie6 and CC BY-SA 4.0 in every face taken from that set", () => {
    const fromCangjie: [string, string[]][] = [
      ["chinese", KEYS],
      ["riichi", BONUS],
      ["riichi-dark", BONUS],
    ];
    for (const [set, keys] of fromCangjie) {
      for (const key of keys) assert.match(face(set, key), /<!-- MJ\w+-\.svg by Cangjie6, Wikimedia Commons, CC BY-SA 4\.0/, `${set}/${key}`);
    }
  });

  it("keeps a licence file beside every set, and the build copies every set", () => {
    const build = readFileSync(new URL("../../scripts/build.ts", import.meta.url), "utf8");
    const index = readFileSync(new URL("LICENSE.md", FACES), "utf8");
    for (const { id } of FACE_SETS) {
      assert.ok(existsSync(new URL(`${id}/LICENSE.md`, FACES)), `${id}/LICENSE.md`);
      assert.match(build, new RegExp(`dir: "assets/faces/${id}"`), `build copies ${id}`);
      assert.match(index, new RegExp(`\\| \`${id}/\` \\|`), `faces/LICENSE.md lists ${id}`);
    }
  });
});

describe("the faces' sharpness", () => {
  const big = 16384;

  it("paints at 1x on phones and ordinary laptop screens", () => {
    assert.equal(faceScaleFor({ width: 390, height: 844, pixelRatio: 3, maxTexture: big }), 1);
    assert.equal(faceScaleFor({ width: 1440, height: 900, pixelRatio: 1, maxTexture: big }), 1);
  });

  it("grows with the screen: 2x on a 4K display, at most 2.5x on larger ones", () => {
    assert.equal(faceScaleFor({ width: 2560, height: 1440, pixelRatio: 1, maxTexture: big }), 1.25);
    assert.equal(faceScaleFor({ width: 3840, height: 2160, pixelRatio: 1, maxTexture: big }), 2);
    assert.equal(faceScaleFor({ width: 1920, height: 1080, pixelRatio: 2, maxTexture: big }), 2);
    assert.equal(faceScaleFor({ width: 7680, height: 4320, pixelRatio: 1, maxTexture: big }), 2.5);
  });

  it("never asks for a texture larger than the GPU allows", () => {
    assert.equal(faceScaleFor({ width: 3840, height: 2160, pixelRatio: 1, maxTexture: 820 }), 2);
    assert.equal(faceScaleFor({ width: 3840, height: 2160, pixelRatio: 1, maxTexture: 256 }), 1);
  });
});
