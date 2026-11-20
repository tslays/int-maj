/**
 * The table's keys (`app/src/keymap.js`): what each press asks for, and that
 * the guide's Keyboard tab lists every action letter. Pure, so it needs no
 * browser; `keys.js` carries the commands out.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { ACTION_KEY, SHORTCUTS, commandFor } = await import("../../app/src/keymap.js");

describe("the table's keys", () => {
  it("moves along the hand with the arrows, and carries the tile with Shift", () => {
    assert.deepEqual(commandFor({ key: "ArrowLeft" }), { type: "move", step: -1 });
    assert.deepEqual(commandFor({ key: "ArrowRight" }), { type: "move", step: 1 });
    assert.deepEqual(commandFor({ key: "ArrowRight", shiftKey: true }), { type: "shift", step: 1 });
    assert.deepEqual(commandFor({ key: "Home" }), { type: "move", step: -Infinity });
  });

  it("throws with Enter and Space", () => {
    assert.deepEqual(commandFor({ key: "Enter" }), { type: "throw" });
    assert.deepEqual(commandFor({ key: " " }), { type: "pick" });
  });

  it("takes each call by its letter, in either case", () => {
    for (const key of Object.values(ACTION_KEY) as string[]) {
      assert.deepEqual(commandFor({ key }), { type: "action", key });
      assert.deepEqual(commandFor({ key: key.toLowerCase() }), { type: "action", key });
    }
  });

  it("gives every action its own letter, apart from the table's other keys", () => {
    const letters = Object.values(ACTION_KEY) as string[];
    assert.equal(new Set(letters).size, letters.length);
    for (const other of ["D", "S", "H"]) assert.ok(!letters.includes(other), `${other} is taken`);
  });

  it("presses the nth button with 1 to 9", () => {
    assert.deepEqual(commandFor({ key: "1" }), { type: "button", index: 0 });
    assert.deepEqual(commandFor({ key: "9" }), { type: "button", index: 8 });
    assert.equal(commandFor({ key: "0" }), null);
  });

  it("leaves the browser's own shortcuts alone", () => {
    assert.equal(commandFor({ key: "r", ctrlKey: true }), null);
    assert.equal(commandFor({ key: "r", metaKey: true }), null);
    assert.equal(commandFor({ key: "ArrowLeft", altKey: true }), null);
    assert.equal(commandFor({ key: "Tab" }), null);
    assert.equal(commandFor({ key: "Escape" }), null);
  });

  it("opens the guide with ?, and lists every letter there", () => {
    assert.deepEqual(commandFor({ key: "?" }), { type: "guide" });
    const listed = SHORTCUTS.map(([keys]: [string, string]) => keys).join(" ").split(/\s+/);
    for (const key of Object.values(ACTION_KEY) as string[]) assert.ok(listed.includes(key), `${key} is not in the guide`);
  });
});
