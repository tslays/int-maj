/**
 * A preference kept on the device (`app/src/prefs.js`), the storage under the
 * sound, pace, bot level, opening and large-discards switches: it reads and
 * writes one string per key and never throws, whatever the storage does.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { storedString } = await import("../../app/src/prefs.js");

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const refusing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("stored preference", () => {
  it("reads back what it wrote, under its own key", () => {
    const store = memory();
    const stored = storedString("int-maj.test", store);
    assert.equal(stored.read(), null);
    stored.write("on");
    assert.equal(stored.read(), "on");
    assert.deepEqual([...store.data], [["int-maj.test", "on"]]);
  });

  it("looks the storage up on each use when given a function", () => {
    let store: ReturnType<typeof memory> | null = null;
    const stored = storedString("k", () => store);
    stored.write("lost");
    assert.equal(stored.read(), null);
    store = memory();
    stored.write("kept");
    assert.equal(stored.read(), "kept");
  });

  it("never throws: no storage, or storage that refuses", () => {
    for (const storage of [null, () => null, refusing, () => refusing]) {
      const stored = storedString("k", storage);
      assert.equal(stored.read(), null);
      assert.doesNotThrow(() => stored.write("x"));
    }
  });
});
