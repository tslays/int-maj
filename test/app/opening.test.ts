/**
 * The opening of a hand (`app/src/opening.js`): the choice to watch it is
 * remembered on the device and survives missing or refusing storage, and the
 * deal's stages start with an empty table, pass through the printed rounds of
 * four tiles and end on exactly the payload the engine dealt.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createApiContext, routeApi } from "../../src/table/api.ts";
import { seedWithDealer } from "../helpers/seeds.ts";

// @ts-expect-error - a plain browser module without type declarations
const { createOpeningPref, dealStages, OPENING_KEY, PIPS } = await import("../../app/src/opening.js");

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

interface Payload {
  readonly seat: string;
  readonly view: { readonly player: { readonly hand: readonly string[] }; readonly dealer: string };
  readonly table: readonly { readonly seat: string; readonly handCount: number; readonly flowers: readonly string[] }[];
  readonly wall: { readonly front: number; readonly remaining: number; readonly loose: number; readonly dead: number; readonly size: number };
}

function dealt(seed: string): Payload {
  const context = createApiContext();
  const answer = routeApi(context, { method: "POST", path: "/api/new", query: new URLSearchParams(), body: { seed } });
  return JSON.parse(JSON.stringify(answer!.body)) as Payload;
}

describe("the opening preference", () => {
  it("is on until turned off, and remembered", () => {
    const storage = memory();
    const pref = createOpeningPref({ storage });
    assert.equal(pref.enabled, true);
    pref.set(false);
    assert.equal(storage.getItem(OPENING_KEY), "off");
    assert.equal(createOpeningPref({ storage }).enabled, false);
    pref.set(true);
    assert.equal(createOpeningPref({ storage }).enabled, true);
  });

  it("works without storage, and with storage that refuses", () => {
    assert.equal(createOpeningPref({ storage: null }).enabled, true);
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const pref = createOpeningPref({ storage: refusing });
    assert.equal(pref.enabled, true);
    pref.set(false);
    assert.equal(pref.enabled, false, "the choice lasts for the visit");
  });
});

describe("the deal's stages", () => {
  for (const dealer of ["E", "S"] as const) {
    it(`deals four tiles a round and ends on the dealt hand (dealer ${dealer})`, () => {
      const payload = dealt(seedWithDealer("opening-stages", dealer));
      const stages = dealStages(payload) as Payload[];
      assert.equal(stages.length, 5, "empty, three rounds of four, the deal");
      assert.equal(stages.at(-1), payload, "the last stage is the engine's payload itself");

      const counts = stages.map((stage) => stage.table.map((entry) => entry.handCount));
      assert.deepEqual(counts[0], [0, 0, 0, 0]);
      for (let stage = 1; stage < 4; stage++) {
        assert.deepEqual(counts[stage], payload.table.map((entry) => Math.min(entry.handCount, 4 * stage)));
      }
      assert.deepEqual(counts[4], payload.table.map((entry) => entry.handCount));

      for (const [index, stage] of stages.entries()) {
        const own = stage.table.find((entry) => entry.seat === payload.seat)!;
        assert.equal(stage.view.player.hand.length, own.handCount, "your hand is as large as your count says");
        assert.deepEqual(stage.view.player.hand, payload.view.player.hand.slice(0, own.handCount));
        // The wall is drawn down as the hands fill, and its tiles are accounted for.
        assert.equal(stage.wall.front + stage.wall.remaining, payload.wall.front + payload.wall.remaining);
        assert.ok(stage.wall.front >= (stages[index - 1]?.wall.front ?? 0));
      }
      assert.equal(stages[0]!.wall.front, 0);
      assert.equal(stages[0]!.wall.remaining, payload.wall.remaining + payload.wall.front);
    });
  }

  it("leaves the payload it was given untouched", () => {
    const payload = dealt("opening-copy");
    const before = JSON.stringify(payload);
    dealStages(payload);
    assert.equal(JSON.stringify(payload), before);
  });
});

describe("the dice faces", () => {
  it("shows every face with as many pips as its number", () => {
    for (let face = 1; face <= 6; face++) assert.equal(PIPS[face].length, face);
  });
});
