/**
 * Tile numbers (`app/src/tile-numbers.js`): on by default, remembered on
 * the device, safe with missing, refusing or garbled storage, and telling the
 * table at once when it changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createTileNumbers, TILE_NUMBERS_KEY } = await import("../../app/src/tile-numbers.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("tile numbers", () => {
  it("are on by default and remember being turned off", () => {
    const store = memory();
    const tiles = createTileNumbers({ storage: store });
    assert.equal(tiles.on, true);
    tiles.set(false);
    assert.equal(store.getItem(TILE_NUMBERS_KEY), "off");
    assert.equal(createTileNumbers({ storage: store }).on, false);
    tiles.set(true);
    assert.equal(createTileNumbers({ storage: store }).on, true);
  });

  it("stay on with a garbled value, no storage, or storage that refuses", () => {
    assert.equal(createTileNumbers({ storage: memory({ [TILE_NUMBERS_KEY]: "maybe" }) }).on, true);
    assert.equal(createTileNumbers({ storage: null }).on, true);
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const tiles = createTileNumbers({ storage: refusing });
    assert.equal(tiles.on, true);
    tiles.set(false);
    assert.equal(tiles.on, false, "the choice lasts for the page");
  });

  it("tells the table when it changes", () => {
    const tiles = createTileNumbers({ storage: memory() });
    const heard: boolean[] = [];
    tiles.onChange((on: boolean) => heard.push(on));
    tiles.set(false);
    tiles.set(true);
    assert.deepEqual(heard, [false, true]);
  });
});
