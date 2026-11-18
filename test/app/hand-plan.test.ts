/**
 * Your hand after the table moves (`app/src/hand-plan.js`): which copy of a
 * face leaves, and the order the rest lie in with Sort on or off. Pure, so
 * it needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { picksStand, planHand } = await import("../../app/src/hand-plan.js");

type Entry = { key: string; drawn: boolean; name: string };
type Item = { entry: Entry | null; key: string; drawn: boolean };

const tile = (key: string, name = key, drawn = false): Entry => ({ key, drawn, name });
const names = (order: Item[]) => order.map((item) => (item.entry === null ? `new ${item.key}` : item.entry.name));

describe("the copy that leaves the hand (#210, #214)", () => {
  // A Goulash pass of one of two 4 Bamboo: the copy you picked (and raised) is the first one.
  const picked = tile("b4", "picked b4");
  const other = tile("b4", "other b4");
  const hand = [picked, tile("c2"), tile("o9"), other, tile("wS")];

  for (const sorted of [true, false]) {
    it(`is the picked copy, not the first of that face (Sort ${sorted ? "on" : "off"})`, () => {
      const { order, dropped } = planHand({
        hand,
        keys: ["b4", "c2", "o9", "wS"],
        sorted,
        leaving: new Set([picked]),
      });
      assert.deepEqual(dropped, [picked]);
      assert.ok(names(order).includes("other b4"));
      assert.ok(!names(order).includes("picked b4"), "the passed tile, still marked picked, would stand raised");
    });
  }

  it("is the thrown copy when you discard one of two in your own order", () => {
    const thrown = tile("c5", "thrown c5");
    const kept = tile("c5", "kept c5");
    const { order } = planHand({
      hand: [tile("wE"), thrown, tile("b1"), kept],
      keys: ["wE", "b1", "c5"],
      sorted: false,
      leaving: new Set([thrown]),
    });
    assert.deepEqual(names(order), ["wE", "b1", "kept c5"]);
  });

  it("is a later copy when nothing marks one", () => {
    const first = tile("d9", "first");
    const second = tile("d9", "second");
    const { dropped } = planHand({ hand: [first, second], keys: ["d9"], sorted: false });
    assert.deepEqual(dropped, [second]);
  });
});

describe("picks stand raised only during an exchange (#214)", () => {
  it("stand while a Goulash exchange is offered", () => {
    assert.equal(picksStand({ legalActions: [{ type: "GoulashExchange", tiles: ["b4", "c2", "o9"] }] }), true);
  });
  it("come down once the exchanges are over, even if a picked copy stayed in the hand", () => {
    assert.equal(picksStand({ legalActions: [{ type: "Discard", tile: "b4" }] }), false);
    assert.equal(picksStand({ legalActions: [] }), false);
    assert.equal(picksStand(null), false);
  });
});

describe("the hand's order with Sort on or off (#213)", () => {
  const mine = [tile("wS"), tile("c8"), tile("b4"), tile("c2")];

  it("Sort off: tiles keep your places; Goulash tiles received join at the end", () => {
    const { order } = planHand({ hand: mine, keys: ["wS", "c8", "c2", "o3", "b4", "c1"], sorted: false });
    assert.deepEqual(names(order), ["wS", "c8", "b4", "c2", "new c1", "new o3"]);
    assert.ok(order.every((item: Item) => !item.drawn));
  });

  it("Sort off: a drawn tile joins at the end, and nothing is re-sorted", () => {
    const { order } = planHand({ hand: mine, keys: ["wS", "c8", "b4", "c2", "c1"], drawnKey: "c1", sorted: false });
    assert.deepEqual(names(order), ["wS", "c8", "b4", "c2", "new c1"]);
    assert.equal(order.at(-1).drawn, true);
  });

  it("Sort on: the hand lies in order, the drawn tile apart at the end", () => {
    const { order } = planHand({ hand: mine, keys: ["wS", "c8", "b4", "c2", "c1"], drawnKey: "c1", sorted: true });
    assert.deepEqual(names(order), ["c2", "c8", "b4", "wS", "new c1"]);
    assert.deepEqual(order.map((item: Item) => item.drawn), [false, false, false, false, true]);
  });

  it("Sort on: the tile drawn earlier stays apart while the hand is shown again", () => {
    const drawn = tile("c1", "drawn c1", true);
    const { order } = planHand({ hand: [tile("c2"), tile("c8"), drawn], keys: ["c2", "c8", "c1"], drawnKey: "c1", sorted: true });
    assert.deepEqual(names(order), ["c2", "c8", "drawn c1"]);
    assert.equal(order.at(-1).drawn, true);
  });
});
