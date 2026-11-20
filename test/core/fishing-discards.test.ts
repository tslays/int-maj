/**
 * The discards that would leave you fishing (`fishingDiscards`, the table's
 * fish on a hand tile). The offer itself still comes after the discard; the
 * marks must name exactly the discards the reducer follows with it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apply, viewFor, type GameState } from "../../src/core/game/index.ts";
import { fishingDiscards } from "../../src/core/game/hands.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};
const WALL = Array.from({ length: 40 }, (_, index) => ["c6", "o9", "dW", "c3", "o5", "wN"][index % 6]!);
// Wriggly Snake one wind short, plus a North Wind drawn: throwing a spare 5 bamboo keeps the wait.
const NEAR = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5 o9";

const discardTurn = (hand: string, extra: Partial<Parameters<typeof fixture>[0]> = {}): GameState =>
  fixture({ hands: { E: hand, ...OTHERS }, wall: WALL, phase: "discard", turn: "E", ...extra });

describe("discards that leave you fishing", () => {
  it("marks exactly the discards the Fishing offer follows", () => {
    const state = discardTurn(NEAR);
    const marked = new Map(fishingDiscards(state, "E").map((entry) => [entry.tile, entry]));
    assert.ok(marked.has("o9"), "throwing the stray circle leaves the snake fishing");
    for (const tile of new Set(state.players[0]!.hand)) {
      const result = apply(state, { type: "Discard", seat: "E", tile });
      assert.ok(!("error" in result), `discarding ${tile} is legal`);
      const offer = viewFor(result.state, "E").legalActions.find((action) => action.type === "DeclareFishing");
      const mark = marked.get(tile);
      if (mark === undefined) {
        assert.equal(offer, undefined, `no fish on ${tile}, so no offer after it`);
        continue;
      }
      assert.equal(result.state.phase, "announce", `the fish on ${tile} is followed by the offer`);
      assert.ok(offer && offer.type === "DeclareFishing");
      assert.equal(offer.hand, mark.hand);
    }
  });

  it("marks only on your own discard turn", () => {
    assert.deepEqual(fishingDiscards(discardTurn(NEAR), "S"), []);
    assert.deepEqual(fishingDiscards(discardTurn(NEAR, { phase: "draw" }), "E"), []);
  });

  it("marks nothing once the fish is shown", () => {
    const state = discardTurn(NEAR, { fishing: [{ seat: "E", wait: ["wN"], tier: "limit", value: 400 }] });
    assert.deepEqual(fishingDiscards(state, "E"), []);
  });

  it("does not count as the offer under 'a win needs the fish shown'", () => {
    const state = discardTurn(NEAR);
    fishingDiscards(state, "E");
    assert.equal(state.fishOffered?.includes("E") ?? false, false);
  });
});
