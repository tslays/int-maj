/**
 * The start screen focuses its first choice so keyboard play can press Enter at once, but a mouse or
 * touch user must not see a ring on it: the ring is hidden until a key is pressed (`keys-on`).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const start = readFileSync(new URL("../../app/src/start.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/styles.css", import.meta.url), "utf8");

describe("start screen focus ring", () => {
  it("marks keyboard use on the body and clears it on a pointer press", () => {
    assert.match(start, /addEventListener\("keydown", \(\) => document\.body\.classList\.add\("keys-on"\)/);
    assert.match(start, /addEventListener\("pointerdown", \(\) => document\.body\.classList\.remove\("keys-on"\)/);
  });

  it("hides the focus outline inside the start screen until keys-on is set", () => {
    assert.match(css, /body:not\(\.keys-on\) #start :focus \{\s*outline: none;\s*\}/);
  });
});
