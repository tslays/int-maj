/**
 * The bot level (`app/src/level.js`): easy, medium and hard, Hard by default
 * (the bots as they always played), remembered on the device and safe with
 * missing, refusing or garbled storage. The table checks the same three ids.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BOT_LEVELS } from "../../src/core/game/bot.ts";

// @ts-expect-error - a plain browser module without type declarations
const { createLevel, LEVELS, LEVEL_KEY } = await import("../../app/src/level.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("bot level", () => {
  it("offers the levels the table plays, easiest first", () => {
    assert.deepEqual(LEVELS.map((entry: { id: string }) => entry.id), [...BOT_LEVELS]);
  });

  it("starts at Hard and remembers the choice", () => {
    const store = memory();
    const level = createLevel({ storage: store });
    assert.equal(level.id, "hard");
    assert.equal(level.set("easy"), true);
    assert.equal(store.getItem(LEVEL_KEY), "easy");
    assert.equal(createLevel({ storage: store }).id, "easy");
  });

  it("ignores an unknown id and a garbled saved value", () => {
    const level = createLevel({ storage: memory({ [LEVEL_KEY]: "expert" }) });
    assert.equal(level.id, "hard");
    assert.equal(level.set("expert"), false);
    assert.equal(level.id, "hard");
  });

  it("works with no storage and with storage that throws", () => {
    const none = createLevel({ storage: () => null });
    assert.equal(none.set("medium"), true);
    assert.equal(none.id, "medium");
    const refusing = createLevel({
      storage: () => ({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      }),
    });
    assert.equal(refusing.id, "hard");
    assert.equal(refusing.set("easy"), true);
    assert.equal(refusing.id, "easy");
  });
});
