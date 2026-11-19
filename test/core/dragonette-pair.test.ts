/**
 * Dragonette (C p. 24) prints its fourteenth tile as "Any Wind or Dragon
 * paired". Report #244: a hand with a paired North was refused as a wait, so
 * the player was never offered the fishing announcement.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fishingDeclarationFor, waitsOf } from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

/** The #244 hand: pairs b2 b7, one of each wind with North paired, R G W, waiting on b8. */
const PAIRED_WIND = {
  hands: { E: "b2 b2 b7 b7 b8 wE wS wW wN wN dR dG dW" },
  phase: "discard",
} as const;

describe("Dragonette with a paired wind (C p. 24)", () => {
  it("waits on the third suit pair and offers limit fishing", () => {
    const state = fixture({ ...PAIRED_WIND });
    assert.deepEqual(waitsOf(state, "E"), ["b8"]);
    const fishing = fishingDeclarationFor(state, "E");
    assert.equal(fishing?.hand, "Dragonette");
    assert.equal(fishing?.tier, "limit");
  });

  it("still takes a paired dragon", () => {
    const state = fixture({ hands: { E: "b2 b2 b7 b7 b8 wE wS wW wN dR dG dG dW" }, phase: "discard" });
    assert.deepEqual(waitsOf(state, "E"), ["b8"]);
  });

  it("does not take a 1 or 9 pair in the suit", () => {
    const state = fixture({ hands: { E: "b2 b2 b7 b7 b9 wE wS wW wN wN dR dG dW" }, phase: "discard" });
    assert.deepEqual(waitsOf(state, "E"), []);
  });
});
