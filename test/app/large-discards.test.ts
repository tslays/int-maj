/**
 * Large discards (`app/src/large-discards.js`): on by default, remembered on
 * the device, safe with missing, refusing or garbled storage, and telling the
 * table at once when it changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createLargeDiscards, LARGE_DISCARDS_KEY } = await import("../../app/src/large-discards.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("large discards", () => {
  it("are on by default and remember being turned off", () => {
    const store = memory();
    const large = createLargeDiscards({ storage: store });
    assert.equal(large.on, true);
    large.set(false);
    assert.equal(store.getItem(LARGE_DISCARDS_KEY), "off");
    assert.equal(createLargeDiscards({ storage: store }).on, false);
    large.set(true);
    assert.equal(createLargeDiscards({ storage: store }).on, true);
  });

  it("stay on with a garbled value, no storage, or storage that refuses", () => {
    assert.equal(createLargeDiscards({ storage: memory({ [LARGE_DISCARDS_KEY]: "maybe" }) }).on, true);
    assert.equal(createLargeDiscards({ storage: null }).on, true);
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const large = createLargeDiscards({ storage: refusing });
    assert.equal(large.on, true);
    large.set(false);
    assert.equal(large.on, false, "the choice lasts for the page");
  });

  it("tells the table when it changes", () => {
    const large = createLargeDiscards({ storage: memory() });
    const heard: boolean[] = [];
    large.onChange((on: boolean) => heard.push(on));
    large.set(false);
    large.set(true);
    assert.deepEqual(heard, [false, true]);
  });
});
