import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, isConcealed, kongCount, meld } from "../../src/core/hand.ts";
import { normalizeHand } from "../../src/core/shape.ts";

describe("hand model", () => {
  it("tracks exposed versus concealed melds", () => {
    const hand = createHand({
      concealed: "b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    assert.equal(isConcealed(hand), false);
    assert.equal(kongCount(hand), 0);
    assert.equal(normalizeHand(hand).total, 14);
  });

  it("keeps flowers and seasons out of the shape", () => {
    const hand = createHand({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
      flowers: "f1 f3",
      seasons: "s2",
    });
    const shape = normalizeHand(hand);
    assert.equal(shape.total, 14);
    assert.equal(hand.flowers.length, 2);
    assert.equal(hand.seasons.length, 1);
  });

  it("rejects a winning tile that is not in the hand", () => {
    assert.throws(
      () =>
        createHand({
          concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
          winningTile: "dR",
        }),
      /Winning tile/,
    );
  });

  it("rejects malformed melds", () => {
    assert.throws(() => meld({ kind: "chow", tiles: "b1 b2 b4" }), /consecutive/);
    assert.throws(() => meld({ kind: "pung", tiles: "b1 b1 b2" }), /identical/);
    assert.throws(() => meld({ kind: "kong", tiles: "b1 b1 b1" }), /4 tiles/);
  });

  it("rejects more than four copies of a tile", () => {
    assert.throws(
      () => createHand({ concealed: "b1 b1 b1 b1 b1" }),
      /More than four copies/,
    );
  });

  it("rejects bonus tiles in the concealed hand", () => {
    assert.throws(() => createHand({ concealed: "f1" }), /Bonus tile/);
  });
});
