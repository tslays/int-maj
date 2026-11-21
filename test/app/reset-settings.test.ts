/**
 * Reset settings (`reset()` on each preference module): every preference goes
 * back to its default and the default is what is kept on the device, so a
 * reload agrees. Sort and the discard layout tell their listeners.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createLevel } = await import("../../app/src/level.js");
// @ts-expect-error - a plain browser module without type declarations
const { createPace } = await import("../../app/src/pace.js");
// @ts-expect-error - a plain browser module without type declarations
const { createHintStyle } = await import("../../app/src/hint-style.js");
// @ts-expect-error - a plain browser module without type declarations
const { createOpeningPref } = await import("../../app/src/opening.js");
// @ts-expect-error - a plain browser module without type declarations
const { createLargeDiscards } = await import("../../app/src/large-discards.js");
// @ts-expect-error - a plain browser module without type declarations
const { createTileNumbers } = await import("../../app/src/tile-numbers.js");
// @ts-expect-error - a plain browser module without type declarations
const { createDiscardLayout } = await import("../../app/src/discard-layout.js");
// @ts-expect-error - a plain browser module without type declarations
const { createAppearance } = await import("../../app/src/appearance.js");
// @ts-expect-error - a plain browser module without type declarations
const { createSortPref } = await import("../../app/src/sort-pref.js");

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("reset settings", () => {
  it("puts the choice-based preferences back to their defaults and keeps them", () => {
    const store = memory();
    const cases = [
      { make: createLevel, change: (p: any) => p.set("hard"), read: (p: any) => p.id, fallback: "medium" },
      { make: createPace, change: (p: any) => p.set("faster"), read: (p: any) => p.id, fallback: "normal" },
      { make: createHintStyle, change: (p: any) => p.set("discovery"), read: (p: any) => p.id, fallback: "mixed" },
      { make: createOpeningPref, change: (p: any) => p.set(false), read: (p: any) => p.enabled, fallback: true },
      { make: createLargeDiscards, change: (p: any) => p.set(false), read: (p: any) => p.on, fallback: true },
      { make: createTileNumbers, change: (p: any) => p.set(false), read: (p: any) => p.on, fallback: true },
      { make: createDiscardLayout, change: (p: any) => p.set("pile"), read: (p: any) => p.id, fallback: "rows" },
      { make: createSortPref, change: (p: any) => p.set(false), read: (p: any) => p.on, fallback: true },
      { make: createAppearance, change: (p: any) => p.applyBundle("midnight"), read: (p: any) => p.matchingBundle(), fallback: "modern" },
    ];
    for (const { make, change, read, fallback } of cases) {
      const pref = make({ storage: store });
      change(pref);
      assert.notEqual(read(pref), fallback);
      pref.reset();
      assert.equal(read(pref), fallback);
      assert.equal(read(make({ storage: store })), fallback, "a reload agrees");
    }
  });

  it("tells the listeners of Sort and the discard layout", () => {
    const sort = createSortPref({ storage: memory() });
    const seen: boolean[] = [];
    sort.onChange((on: boolean) => seen.push(on));
    sort.set(false);
    sort.reset();
    assert.deepEqual(seen, [false, true]);

    const layout = createDiscardLayout({ storage: memory() });
    const ids: string[] = [];
    layout.onChange((id: string) => ids.push(id));
    layout.set("pile");
    layout.reset();
    assert.deepEqual(ids, ["pile", "rows"]);
  });

  it("is harmless when the preference is already at its default", () => {
    const sort = createSortPref({ storage: memory() });
    let calls = 0;
    sort.onChange(() => calls++);
    sort.reset();
    assert.equal(calls, 0);
  });
});
