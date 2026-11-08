/**
 * Every event has a line of text, so no log can break on a new event type,
 * and the per-seat text never names another seat's hidden tile.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeEvent, describeEventFor, formatAction } from "../../src/core/game/describe.ts";
import type { Event } from "../../src/core/game/events.ts";

const exchange = {
  type: "GoulashExchanged",
  seq: 1,
  stage: 0,
  a: { seat: "E", tiles: ["b1", "b2", "b3"] },
  b: { seat: "W", tiles: ["c7", "c8", "c9"] },
} as unknown as Event;

describe("event and action text", () => {
  it("describes the Goulash and the reshuffle instead of crashing", () => {
    assert.match(describeEvent(exchange), /^Goulash 1: E gives b1 b2 b3, W gives c7 c8 c9$/);
    const reshuffle = { type: "Reshuffled", seq: 2, seat: "S", hand: 3 } as unknown as Event;
    assert.match(describeEvent(reshuffle), /S asks for a reshuffle/);
    assert.match(formatAction({ type: "GoulashExchange", seat: "E", tiles: ["b1", "b2", "b3"] }), /passes three tiles/);
    assert.equal(describeEvent({ type: "SomethingNew", seq: 3 } as unknown as Event), "SomethingNew");
  });

  it("tells each seat only its own side of an exchange", () => {
    assert.equal(describeEventFor(exchange, "E"), "Goulash 1: you give b1 b2 b3 to W and receive c7 c8 c9");
    assert.equal(describeEventFor(exchange, "S"), "Goulash 1: E and W exchange three tiles");
  });

  it("hides another seat's drawn and replacement tiles", () => {
    const drew = { type: "Drew", seq: 4, seat: "S", tile: "o5", end: "front" } as unknown as Event;
    assert.equal(describeEventFor(drew, "E"), "S draws a tile");
    assert.equal(describeEventFor(drew, "S"), "S draws o5");
    const flower = { type: "FlowerReplaced", seq: 5, seat: "N", tile: "f2", replacement: "c4" } as unknown as Event;
    assert.equal(describeEventFor(flower, "E"), "N sets aside f2 and draws a replacement");
    const loose = { type: "KongReplacementDrawn", seq: 6, seat: "W", tile: "dG" } as unknown as Event;
    assert.equal(describeEventFor(loose, "E"), "W draws a loose tile");
  });

  it("shows the table that a seat is fishing, never its wait", () => {
    const fishing = { type: "FishingDeclared", seq: 7, seat: "S", wait: ["b5", "b8"], tier: "limit" } as unknown as Event;
    assert.equal(describeEventFor(fishing, "E"), "S is fishing");
    assert.equal(describeEventFor(fishing, "S"), "S announces fishing on b5 b8 (limit)");
  });
});
