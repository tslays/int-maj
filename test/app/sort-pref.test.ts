/**
 * Sort (`app/src/sort-pref.js`, #213): on by default, remembered on the
 * device across hands and games, safe with missing, refusing or garbled
 * storage, and telling the menu when it changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createSortPref, SORT_KEY } = await import("../../app/src/sort-pref.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("Sort preference", () => {
  it("is on by default and remembers being turned off", () => {
    const store = memory();
    const sort = createSortPref({ storage: store });
    assert.equal(sort.on, true);
    sort.set(false);
    assert.equal(store.getItem(SORT_KEY), "off");
    assert.equal(createSortPref({ storage: store }).on, false, "a new game (a new page) keeps it off");
    sort.set(true);
    assert.equal(createSortPref({ storage: store }).on, true);
  });

  it("stays on with a garbled value, no storage, or storage that refuses", () => {
    assert.equal(createSortPref({ storage: memory({ [SORT_KEY]: "maybe" }) }).on, true);
    assert.equal(createSortPref({ storage: null }).on, true);
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const sort = createSortPref({ storage: refusing });
    sort.set(false);
    assert.equal(sort.on, false, "the choice lasts for the page");
  });

  it("tells listeners only when it changes", () => {
    const sort = createSortPref({ storage: memory() });
    const heard: boolean[] = [];
    sort.onChange((on: boolean) => heard.push(on));
    sort.set(false);
    sort.set(false);
    sort.set(true);
    assert.deepEqual(heard, [false, true]);
  });

  it("says why it changed, so a drag that turns it off can be announced (#269)", () => {
    const sort = createSortPref({ storage: memory() });
    const heard: string[] = [];
    sort.onChange((_on: boolean, reason: string) => heard.push(reason));
    sort.set(false, "arranged");
    sort.set(false, "arranged"); // every further swap of the same drag: no second change
    sort.set(true);
    assert.deepEqual(heard, ["arranged", "button"]);
  });
});
