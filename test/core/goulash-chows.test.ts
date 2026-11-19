/**
 * A Goulash allows no chow outside a specialty hand (I p. 21, no. 27; RULES.md
 * R-102). The bar reaches the win, the wait and the fishing announcement, not
 * only the chow claim. Report #233: an Ordinary hand with a chow was declared
 * as a fishing hand in a Goulash and won.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fishingDeclarationFor,
  handIsComplete,
  viewFor,
  waitsOf,
  type MeldState,
} from "../../src/core/game/index.ts";
import { completesAsChow, winsOnDiscard, WIN_NEEDS_FISH } from "../../src/core/game/hands.ts";
import { NO_CHOWS } from "../../src/core/match.ts";
import { fixture, handOf } from "../helpers/game-fixture.ts";

const pung = (key: string): MeldState => ({ kind: "pung", tiles: [key, key, key], exposed: true });
const kong = (key: string): MeldState => ({ kind: "kong", tiles: [key, key, key, key], exposed: true });

/** The #233 hand: pung c1, kong c2, pung c4, pair c3 and c8 c9 waiting on the c7 for a chow. */
const WITH_CHOW = {
  hands: { E: "c3 c3 c4 c4 c4 c8 c9" },
  melds: { E: [pung("c1"), kong("c2")] },
  phase: "discard",
} as const;

/** Four pungs and a pair in one suit: no chow, so a Goulash may hold it. */
const ALL_PUNGS = {
  hands: { E: "c3 c3 c4 c4 c4 c8 c8" },
  melds: { E: [pung("c1"), kong("c2")] },
  phase: "discard",
} as const;

describe("a Goulash and the chow in an Ordinary hand (I p. 21)", () => {
  it("is no wait, no fishing announcement and no win for an Ordinary hand with a chow", () => {
    const state = fixture({ ...WITH_CHOW, goulash: true });
    assert.deepEqual(waitsOf(state, "E"), []);
    assert.equal(fishingDeclarationFor(state, "E"), null);
    assert.equal(winsOnDiscard(state, "E", "c7"), false);
  });

  it("still lets the same hand win outside a Goulash", () => {
    const state = fixture({ ...WITH_CHOW, goulash: false });
    assert.deepEqual(waitsOf(state, "E"), ["c7"]);
    assert.equal(fishingDeclarationFor(state, "E")?.hand, "Ordinary Mah Jong");
    assert.equal(winsOnDiscard(state, "E", "c7"), true);
  });

  it("keeps an Ordinary hand of pungs and a pair in a Goulash", () => {
    const state = fixture({ ...ALL_PUNGS, goulash: true });
    assert.deepEqual(waitsOf(state, "E"), ["c3", "c8"]);
    assert.equal(fishingDeclarationFor(state, "E")?.hand, "Ordinary Mah Jong");
    assert.equal(winsOnDiscard(state, "E", "c8"), true);
  });

  it("bars a chow in a Purity hand too", () => {
    const hands = { E: "c3 c3 c4 c4 c4 c8 c9" };
    const melds = { E: [pung("c1"), kong("c2")] };
    const inGoulash = fixture({ hands, melds, phase: "discard", goulash: true });
    const outside = fixture({ hands, melds, phase: "discard", goulash: false });
    assert.equal(winsOnDiscard(inGoulash, "E", "c7"), false);
    assert.equal(winsOnDiscard(outside, "E", "c7"), true);
  });

  it("does not bar a specialty hand that is made of chows", () => {
    // Four chows and a pair in one suit is a printed hand of its own, so the
    // Goulash bar on plain chows does not touch it.
    const state = fixture({
      hands: { E: "o2 o3 o4 o3 o4 o5 o6 o7 o8 o6 o7 o8 o9 o9" },
      phase: "discard",
      goulash: true,
    });
    assert.equal(handIsComplete(state, "E", "o9")?.winning?.pattern.id, "chow-chow");
  });

  it("is a win by self-draw for pungs but not for a chow in a Goulash", () => {
    const pungs = fixture({ ...ALL_PUNGS, hands: { E: "c3 c3 c3 c4 c4 c4 c8 c8" }, goulash: true });
    assert.equal(handIsComplete(pungs, "E", "c3")?.winning?.pattern.id, "ordinary-mahjong");
    const chow = fixture({ ...WITH_CHOW, hands: { E: "c3 c3 c4 c4 c4 c7 c8 c9" }, goulash: true });
    assert.equal(handIsComplete(chow, "E", "c7"), null);
  });

  it("shows the bar to bots and hints through the view, only in a Goulash", () => {
    assert.ok(viewFor(fixture({ goulash: true }), "E").excludedHands.includes(NO_CHOWS));
    assert.ok(!viewFor(fixture({ goulash: false }), "E").excludedHands.includes(NO_CHOWS));
  });
});

describe("a chow claimed to win obeys the same rules as any win", () => {
  // Dragon's Tail missing the c1 of its run: S may chow c1-c2-c3 off E's discard to win.
  const hands = { S: "c2 c3 c4 c5 c6 c7 c8 c9 wE wE wE dG dG" };
  const chow = ["c1", "c2", "c3"];
  const needed = ["c2", "c3"];

  it("wins when nothing bars it", () => {
    const state = fixture({ hands, phase: "claim" });
    assert.equal(completesAsChow(state, "S", handOf(state, "S"), chow, needed), true);
  });

  it("does not win while the fish rule says the fish must be shown first", () => {
    const state = fixture({ hands, phase: "claim", excludedHands: [WIN_NEEDS_FISH], fishOffered: ["S"] });
    assert.equal(completesAsChow(state, "S", handOf(state, "S"), chow, needed), false);
  });
});
