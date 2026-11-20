/**
 * The table's keys (`app/src/keymap.js`): arrows, Enter or Space, and Esc,
 * read by where you are (your hand or the buttons above it). Pure, so it
 * needs no browser; `keys.js` carries the commands out.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { SHORTCUTS, commandFor, wrap } = await import("../../app/src/keymap.js");

describe("the table's keys", () => {
  it("moves along the hand or the buttons with ← →", () => {
    for (const zone of ["hand", "buttons"]) {
      assert.deepEqual(commandFor({ key: "ArrowLeft" }, zone), { type: "move", step: -1 });
      assert.deepEqual(commandFor({ key: "ArrowRight" }, zone), { type: "move", step: 1 });
    }
  });

  it("goes round the ends: past the last comes back at the first, and back", () => {
    assert.equal(wrap(14, 14), 0);
    assert.equal(wrap(-1, 14), 13);
    assert.equal(wrap(5, 14), 5);
    assert.equal(wrap(-1, 1), 0);
  });

  it("presses with Enter and Space", () => {
    assert.deepEqual(commandFor({ key: "Enter" }), { type: "press" });
    assert.deepEqual(commandFor({ key: " " }, "buttons"), { type: "press" });
  });

  it("goes up to the buttons from the hand, and down from the buttons", () => {
    assert.deepEqual(commandFor({ key: "ArrowUp" }, "hand"), { type: "zone", to: "buttons" });
    assert.deepEqual(commandFor({ key: "ArrowDown" }, "buttons"), { type: "zone", to: "hand" });
    assert.equal(commandFor({ key: "ArrowUp" }, "buttons"), null);
    assert.equal(commandFor({ key: "ArrowDown" }, "hand"), null);
  });

  it("passes with Esc", () => {
    assert.deepEqual(commandFor({ key: "Escape" }), { type: "pass" });
  });

  it("uses no other key, and leaves modified presses to the browser", () => {
    for (const key of ["a", "m", "p", "1", "?", "Tab", "Home"]) assert.equal(commandFor({ key }), null, key);
    assert.equal(commandFor({ key: "ArrowLeft", shiftKey: true }), null);
    assert.equal(commandFor({ key: "Enter", ctrlKey: true }), null);
    assert.equal(commandFor({ key: "Escape", metaKey: true }), null);
  });

  it("lists every key it uses in the guide", () => {
    const listed = SHORTCUTS.map(([keys]: [string, string]) => keys).join(" ");
    for (const key of ["←", "→", "↑", "↓", "Enter", "Space", "Esc"]) assert.ok(listed.includes(key), key);
  });
});
