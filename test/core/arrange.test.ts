import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arrangeConcealed } from "../../src/core/arrange.ts";
import { createHand } from "../../src/core/hand.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";

const pattern = (id: string) => PATTERNS.find((entry) => entry.id === id)!;

describe("arrangeConcealed", () => {
  it("keeps each mixed chow of Crazy Chows together, the pair last", () => {
    const hand = createHand({ concealed: "b1 c2 o3 b4 c5 o6 b7 c8 o9 c2 o3 b4 b5 c5" });
    const groups = arrangeConcealed(hand, pattern("crazy-chows"));
    assert.ok(groups !== null);
    assert.equal(groups.length, 5);
    for (const group of groups.slice(0, 4)) {
      assert.equal(group.length, 3);
      assert.equal(new Set(group.map((key) => key[0])).size, 3, `one tile of each suit: ${group}`);
    }
    assert.equal(groups[4]!.length, 2);
    assert.equal(groups.flat().length, 14);
    for (const group of groups.slice(0, 4)) {
      const ranks = group.map((key) => Number(key[1]));
      assert.deepEqual(ranks, [ranks[0]!, ranks[0]! + 1, ranks[0]! + 2], `reads by number: ${group}`);
    }
  });

  it("leaves a declared meld out and shows only the concealed groups", () => {
    const hand = createHand({
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 dR dR",
      melds: [{ kind: "pung", tiles: "wE wE wE", exposed: true }],
    });
    assert.deepEqual(arrangeConcealed(hand, { groups: undefined }), [
      ["b1", "b2", "b3"],
      ["c4", "c5", "c6"],
      ["o7", "o8", "o9"],
      ["dR", "dR"],
    ]);
  });

  it("splits an ordinary hand into sets and a pair", () => {
    const hand = createHand({ concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 wE wE wE dR dR" });
    const groups = arrangeConcealed(hand, { groups: undefined });
    assert.deepEqual(groups, [
      ["b1", "b2", "b3"],
      ["c4", "c5", "c6"],
      ["o7", "o8", "o9"],
      ["wE", "wE", "wE"],
      ["dR", "dR"],
    ]);
  });

  it("has no grouping for seven pairs", () => {
    const hand = createHand({ concealed: "b1 b1 b3 b3 c2 c2 c5 c5 o7 o7 o9 o9 dR dR" });
    assert.equal(arrangeConcealed(hand, { groups: undefined }), null);
  });
});

describe("arrangeConcealed, mixed-suit hands", () => {
  it("lays Triple Knitting out as four triple sets by number, then the pair", () => {
    const hand = createHand({ concealed: "o7 c1 b4 o1 c4 b1 c7 b7 o4 b9 o9 c9 c1 b1" });
    assert.deepEqual(arrangeConcealed(hand, pattern("triple-knitting")), [
      ["b1", "c1", "o1"],
      ["b4", "c4", "o4"],
      ["b7", "c7", "o7"],
      ["b9", "c9", "o9"],
      ["b1", "c1"],
    ]);
  });

  it("pairs Knitting by number", () => {
    const hand = createHand({ concealed: "o8 b1 o1 b8 b2 o2 b2 o2 b4 o4 b5 o5 b7 o7" });
    const groups = arrangeConcealed(hand, pattern("knitting"))!;
    assert.deepEqual(groups.map((group) => group.map((key) => key[1]).join("")), ["11", "22", "22", "44", "55", "77", "88"]);
  });

  it("orders the pungs of Mixed Pung whatever order the tiles came in", () => {
    const hand = createHand({ concealed: "o9 o9 o9 c2 c2 c2 b5 b5 b5 wE wE wE dR dR", selfDrawn: true });
    assert.deepEqual(arrangeConcealed(hand, pattern("mixed-pung")), [
      ["b5", "b5", "b5"],
      ["c2", "c2", "c2"],
      ["o9", "o9", "o9"],
      ["wE", "wE", "wE"],
      ["dR", "dR"],
    ]);
  });
});
