/**
 * Little Robert (Companion p. 16): "Chow in each suit", "Pung/K in any suit",
 * "Pair any suit". A suit is Bamboo, Characters or Circles only; Winds and
 * Dragons are honours, so neither the pung nor the pair may be one.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand } from "../../src/core/hand.ts";
import { matchHand } from "../../src/core/match.ts";

const CHOWS = "b1 b2 b3 c4 c5 c6 o7 o8 o9";

function isLittleRobert(tiles: string): boolean {
  return matchHand(createHand({ concealed: tiles })).some(
    (match) => match.pattern.id === "little-robert",
  );
}

describe("Little Robert: the pung and the pair are suited", () => {
  it("accepts a suited pung and a suited pair, in any suit", () => {
    for (const pung of ["b5 b5 b5", "c9 c9 c9", "o1 o1 o1"]) {
      for (const pair of ["b2 b2", "c7 c7", "o4 o4"]) {
        assert.equal(isLittleRobert(`${CHOWS} ${pung} ${pair}`), true, `${pung} + ${pair}`);
      }
    }
  });

  it("accepts a kong as the pung", () => {
    const hand = createHand({
      concealed: `${CHOWS} c2 c2`,
      melds: [{ kind: "kong", tiles: "b5 b5 b5 b5", exposed: false }],
    });
    assert.equal(matchHand(hand).some((match) => match.pattern.id === "little-robert"), true);
  });

  it("rejects a Dragon pung", () => {
    assert.equal(isLittleRobert(`${CHOWS} dG dG dG c2 c2`), false);
  });

  it("rejects a Wind pung", () => {
    assert.equal(isLittleRobert(`${CHOWS} wE wE wE c2 c2`), false);
  });

  it("rejects a Wind pair", () => {
    assert.equal(isLittleRobert(`${CHOWS} b5 b5 b5 wE wE`), false);
  });

  it("rejects a Dragon pair", () => {
    assert.equal(isLittleRobert(`${CHOWS} b5 b5 b5 dR dR`), false);
  });

  it("rejects an honour pung with an honour pair", () => {
    assert.equal(isLittleRobert(`${CHOWS} dG dG dG wE wE`), false);
  });
});
