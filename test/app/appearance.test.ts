/**
 * The look (Settings, Style, `appearance.js`): curated swatches kept on the
 * device, safe with missing, refusing or garbled storage, and themes that set
 * all five at once and read as Custom after any single change.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { ACCENTS, ASPECTS, BACKS, BUNDLES, FELTS, FRONTS, ROOMS, createAppearance, createChoice } = await import("../../app/src/appearance.js");

function memory(seed: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const refusing = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
};

const HEX = /^#[0-9a-f]{6}$/;

describe("the look's swatches", () => {
  it("keeps today's table as the first, default swatch of each", () => {
    assert.deepEqual(FELTS[0].stops, ["#1f716d", "#185a59", "#0b3334"]);
    assert.equal(BACKS[0].tile, "#7fc2e4");
    assert.equal(BACKS[0].chip, "#8ccbea");
    assert.equal(FRONTS[0].tile, "#f1efe9");
    assert.equal(ROOMS[0].rail, "#2a3236");
    assert.equal(ROOMS[0].floor, "#11191c");
    assert.deepEqual(ACCENTS[0].gold, ["#ffe08a", "#e5a12f"]);
  });

  it("gives every swatch a unique id, a name and hex colours", () => {
    for (const { swatches } of ASPECTS) {
      const ids = swatches.map((swatch: any) => swatch.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const swatch of swatches) {
        assert.ok(swatch.name.length > 0);
        const colours = [
          ...(swatch.stops ?? []),
          swatch.tile,
          swatch.chip,
          swatch.rail,
          swatch.floor,
          swatch.bounce,
          ...(swatch.gold ?? []),
          ...(swatch.blue ?? []),
          ...(swatch.silver ?? []),
        ].filter((value) => value !== undefined);
        assert.ok(colours.length > 0, `${swatch.id} has colours`);
        for (const colour of colours) assert.match(colour, HEX, `${swatch.id}: ${colour}`);
      }
    }
  });

  it("names only real swatches in every theme, Classic being the defaults", () => {
    for (const bundle of BUNDLES) {
      for (const { aspect, swatches } of ASPECTS) {
        assert.ok(swatches.some((swatch: any) => swatch.id === bundle[aspect]), `${bundle.id}.${aspect}`);
      }
    }
    for (const { aspect, swatches } of ASPECTS) assert.equal(BUNDLES[0][aspect], swatches[0].id);
  });
});

describe("a swatch choice", () => {
  it("is remembered on the device and tells its listeners", () => {
    const store = memory();
    const felt = createChoice({ key: "int-maj.felt", swatches: FELTS, storage: store });
    const seen: string[] = [];
    felt.onChange((id: string) => seen.push(id));
    assert.equal(felt.id, "jade");
    assert.equal(felt.set("navy"), true);
    assert.equal(felt.swatch.name, "Navy");
    assert.equal(store.data.get("int-maj.felt"), "navy");
    assert.equal(createChoice({ key: "int-maj.felt", swatches: FELTS, storage: store }).id, "navy", "a reload agrees");
    assert.deepEqual(seen, ["navy"]);
  });

  it("refuses an unknown swatch and reads garbled storage as the default", () => {
    const felt = createChoice({ key: "int-maj.felt", swatches: FELTS, storage: memory({ "int-maj.felt": "tartan" }) });
    assert.equal(felt.id, "jade");
    assert.equal(felt.set("tartan"), false);
    assert.equal(felt.id, "jade");
  });

  it("works with no storage and with storage that refuses", () => {
    for (const storage of [null, refusing]) {
      const back = createChoice({ key: "int-maj.tile-back", swatches: BACKS, storage });
      assert.equal(back.id, "sky");
      back.set("crimson");
      assert.equal(back.id, "crimson", "the choice lasts until the page is closed");
    }
  });
});

describe("the look as a whole", () => {
  it("applies a theme to all five and recognises it", () => {
    const look = createAppearance({ storage: memory() });
    assert.equal(look.matchingBundle(), "classic");
    assert.equal(look.applyBundle("sakura"), true);
    assert.equal(look.felt.id, "plum");
    assert.equal(look.back.id, "coral");
    assert.equal(look.accent.id, "rose");
    assert.equal(look.matchingBundle(), "sakura");
    assert.equal(look.applyBundle("nope"), false);
  });

  it("reads as Custom after any single change, and Reset brings back Classic", () => {
    const store = memory();
    const look = createAppearance({ storage: store });
    look.applyBundle("casino");
    look.room.set("slate");
    assert.equal(look.matchingBundle(), null);
    const changed: string[] = [];
    look.onChange((aspect: string) => changed.push(aspect));
    look.reset();
    assert.equal(look.matchingBundle(), "classic");
    assert.deepEqual(changed.sort(), ["back", "felt", "front"], "only what differs from Classic changes");
    assert.equal(createAppearance({ storage: store }).matchingBundle(), "classic", "a reload agrees");
  });
});
