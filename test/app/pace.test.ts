/**
 * The table's pace (`app/src/pace.js`): three levels, Normal is exactly the
 * unscaled timing, the choice is remembered on the device and survives
 * missing, refusing or garbled storage.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createPace, PACES, PACE_KEY } = await import("../../app/src/pace.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("pace", () => {
  it("offers slower, normal and faster, ordered slow to fast", () => {
    assert.deepEqual(
      PACES.map((entry: { id: string }) => entry.id),
      ["slower", "normal", "faster"],
    );
    const [slower, normal, faster] = PACES.map((entry: { factor: number }) => entry.factor);
    assert.equal(normal, 1);
    assert.ok(slower > 1 && slower <= 2, "slower is noticeable but not slow-motion");
    assert.ok(faster < 1 && faster >= 0.4, "faster is quicker but stays readable");
  });

  it("starts at Normal, which leaves every timing untouched", () => {
    const pace = createPace({ storage: memory() });
    assert.equal(pace.id, "normal");
    assert.equal(pace.scale(320), 320);
    assert.equal(pace.scale(0.36), 0.36);
  });

  it("scales durations and remembers the choice", () => {
    const store = memory();
    const pace = createPace({ storage: store });
    assert.equal(pace.set("faster"), true);
    assert.equal(pace.scale(100), 60);
    assert.equal(store.getItem(PACE_KEY), "faster");
    assert.equal(createPace({ storage: store }).id, "faster");
    pace.set("slower");
    assert.equal(pace.scale(100), 150);
    assert.equal(createPace({ storage: store }).id, "slower");
  });

  it("ignores an unknown id and a garbled saved value", () => {
    const pace = createPace({ storage: memory({ [PACE_KEY]: "warp" }) });
    assert.equal(pace.id, "normal");
    assert.equal(pace.set("warp"), false);
    assert.equal(pace.id, "normal");
  });

  it("works with no storage and with storage that throws", () => {
    const none = createPace({ storage: () => null });
    assert.equal(none.set("faster"), true);
    assert.equal(none.id, "faster");
    const refusing = createPace({
      storage: () => ({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      }),
    });
    assert.equal(refusing.id, "normal");
    assert.equal(refusing.set("slower"), true);
    assert.equal(refusing.id, "slower");
  });
});
