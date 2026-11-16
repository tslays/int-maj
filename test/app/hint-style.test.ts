/**
 * The hint style (`app/src/hint-style.js`): three styles, Mixed to start, the
 * choice remembered on the device, and safe with missing, refusing or garbled
 * storage.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createHintStyle, HINT_STYLES, HINT_STYLE_KEY } = await import("../../app/src/hint-style.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("hint style", () => {
  it("offers likeliest, mixed and discovery, and starts at mixed", () => {
    assert.deepEqual(
      HINT_STYLES.map((entry: { id: string }) => entry.id),
      ["likeliest", "mixed", "discovery"],
    );
    const style = createHintStyle({ storage: memory() });
    assert.equal(style.id, "mixed");
    assert.equal(style.rotates, true);
  });

  it("remembers the choice, and only the styles that pick discoveries rotate", () => {
    const store = memory();
    const style = createHintStyle({ storage: store });
    assert.equal(style.set("likeliest"), true);
    assert.equal(style.rotates, false);
    assert.equal(store.getItem(HINT_STYLE_KEY), "likeliest");
    assert.equal(createHintStyle({ storage: store }).id, "likeliest");
    assert.equal(style.set("discovery"), true);
    assert.equal(style.rotates, true);
  });

  it("ignores an unknown id and unusable storage", () => {
    const style = createHintStyle({ storage: memory({ [HINT_STYLE_KEY]: "sneaky" }) });
    assert.equal(style.id, "mixed");
    assert.equal(style.set("sneaky"), false);
    assert.equal(style.id, "mixed");
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const guarded = createHintStyle({ storage: refusing });
    assert.equal(guarded.id, "mixed");
    assert.equal(guarded.set("likeliest"), true);
    assert.equal(guarded.id, "likeliest", "lasts until the page is closed");
    assert.equal(createHintStyle({ storage: null }).id, "mixed");
  });
});
