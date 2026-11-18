/** The Goulash marker in the round badge: on for the whole Goulash hand, absent otherwise. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { goulashRow, isGoulashView } = await import("../../app/src/goulash-bar.js");

describe("the round badge's Goulash marker", () => {
  it("is on during the exchanges and after them, off in an ordinary hand", () => {
    assert.equal(isGoulashView({ goulash: { stage: 1, partner: "S" }, goulashReceived: null }), true);
    assert.equal(isGoulashView({ goulash: null, goulashReceived: { stage: 2, tiles: [] } }), true);
    assert.equal(isGoulashView({ goulash: null, goulashReceived: null }), false);
    assert.equal(isGoulashView(undefined), false);
  });

  it("says briefly when half-limit hands are barred, and carries no tooltip", () => {
    assert.match(goulashRow(false), /Goulash<\/span>/);
    assert.match(goulashRow(true), /Goulash<br>No half limit/);
    assert.doesNotMatch(goulashRow(true), /title/);
  });
});
