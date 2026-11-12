/**
 * The hands pinned to the closest-hands panel: at most three, in the order
 * pinned, kept for one game and for a reload.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createPins, MAX_PINS, PINS_KEY } = await import("../../app/src/pins.js");

function memory() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("pinned hands", () => {
  it("keeps pins in the order they were pinned and gives a pin back when it is unpinned", () => {
    const pins = createPins(memory());
    assert.deepEqual(pins.list("g1"), []);
    assert.equal(pins.toggle("g1", "knitting"), true);
    assert.equal(pins.toggle("g1", "wriggly-snake"), true);
    assert.deepEqual(pins.list("g1"), ["knitting", "wriggly-snake"]);
    assert.equal(pins.has("g1", "knitting"), true);
    assert.equal(pins.toggle("g1", "knitting"), false, "unpinned");
    assert.deepEqual(pins.list("g1"), ["wriggly-snake"], "the second pin is the first now");
  });

  it("takes no more than three", () => {
    const pins = createPins(memory());
    for (const id of ["a", "b", "c"]) pins.toggle("g1", id);
    assert.equal(pins.full("g1"), true);
    assert.equal(pins.toggle("g1", "d"), false);
    assert.deepEqual(pins.list("g1"), ["a", "b", "c"]);
    pins.toggle("g1", "b");
    assert.equal(pins.full("g1"), false);
    assert.equal(pins.toggle("g1", "d"), true);
    assert.deepEqual(pins.list("g1"), ["a", "c", "d"]);
    assert.equal(MAX_PINS, 3);
  });

  it("survives a reload of the same game but starts empty in a new one", () => {
    const store = memory();
    createPins(store).toggle("g1", "knitting");
    assert.deepEqual(createPins(store).list("g1"), ["knitting"]);
    assert.deepEqual(createPins(store).list("g2"), [], "another game has none");
    assert.deepEqual(createPins(store).list("g1"), [], "and the first game's are gone");
  });

  it("works without storage, or with storage that fails or holds rubbish", () => {
    const none = createPins(null);
    assert.equal(none.toggle("g1", "knitting"), true);
    assert.deepEqual(none.list("g1"), ["knitting"]);

    const broken = createPins({
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
    });
    assert.equal(broken.toggle("g1", "knitting"), true);

    const odd = memory();
    odd.setItem(PINS_KEY, JSON.stringify({ game: "g1", pins: ["a", 7, "b", "c", "d"] }));
    assert.deepEqual(createPins(odd).list("g1"), ["a", "b", "c"]);
  });
});
