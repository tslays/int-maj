/**
 * What the player has met (`app/src/familiar.js`): hands shown as a discovery
 * and hands built, kept on the device, halved with every new game, and sent
 * to the table as a small `seen` query. Safe with any storage.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createFamiliar, FAMILIAR_KEY, BUILT_WEIGHT } = await import("../../app/src/familiar.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("familiar hands", () => {
  it("starts with nothing met", () => {
    const familiar = createFamiliar({ storage: memory() });
    assert.equal(familiar.weight("knitting"), 0);
    assert.equal(familiar.query(), "");
  });

  it("counts sightings once per call and weights a built hand more", () => {
    const familiar = createFamiliar({ storage: memory() });
    familiar.recordShown(["knitting", "knitting", "robin"]);
    assert.equal(familiar.weight("knitting"), 1);
    familiar.recordBuilt("knitting");
    assert.equal(familiar.weight("knitting"), 1 + BUILT_WEIGHT);
    familiar.recordBuilt("");
    assert.equal(familiar.weight(""), 0);
  });

  it("remembers across visits and sends the most familiar hands first", () => {
    const store = memory();
    const first = createFamiliar({ storage: store });
    first.recordShown(["robin"]);
    first.recordShown(["robin"]);
    first.recordBuilt("knitting");
    const second = createFamiliar({ storage: store });
    assert.equal(second.weight("robin"), 2);
    assert.equal(second.query(), `knitting:${BUILT_WEIGHT},robin:2`);
  });

  it("fades by half with every new game and forgets what falls away", () => {
    const familiar = createFamiliar({ storage: memory() });
    familiar.recordShown(["robin"]);
    familiar.decay();
    assert.equal(familiar.weight("robin"), 0.5);
    familiar.decay();
    familiar.decay();
    assert.equal(familiar.weight("robin"), 0, "an eighth of a sighting is forgotten");
    assert.equal(familiar.query(), "");
  });

  it("survives garbled, refusing or missing storage", () => {
    assert.equal(createFamiliar({ storage: memory({ [FAMILIAR_KEY]: "{not json" }) }).weight("robin"), 0);
    const odd = memory({ [FAMILIAR_KEY]: JSON.stringify({ shown: { robin: "x", a: -1, knitting: 2 }, built: 5 }) });
    const familiar = createFamiliar({ storage: odd });
    assert.equal(familiar.weight("robin"), 0);
    assert.equal(familiar.weight("a"), 0);
    assert.equal(familiar.weight("knitting"), 2);
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const guarded = createFamiliar({ storage: refusing });
    guarded.recordShown(["robin"]);
    assert.equal(guarded.weight("robin"), 1, "lasts until the page is closed");
    createFamiliar({ storage: null }).recordShown(["robin"]);
  });
});
