/**
 * Issue #191: Knitting and Triple Knitting declared looser `groups` than their
 * `match`, so the hints counted three-suit hands as Knitting (the closest-hands
 * search reads `groups`). A hand's groups must complete exactly when it matches.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestHands, viewFor } from "../../src/core/game/index.ts";
import { createHand } from "../../src/core/hand.ts";
import { createRng } from "../../src/core/rng.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { matchesGroups, ownWindKey } from "../../src/core/patterns/predicates.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { fixture } from "../helpers/game-fixture.ts";

const SUITS = ["b", "c", "o"] as const;
const HONOURS = ["wE", "wS", "wW", "wN", "dR", "dG", "dW"] as const;

/** A 14-tile hand shaped to land near the pair, triple-set, run and honour hands. */
function randomHand(rng: ReturnType<typeof createRng>): string[] {
  const tile = () => SUITS[rng.int(3)]! + (1 + rng.int(9));
  const tiles: string[] = [];
  const kind = rng.int(5);
  if (kind === 0) {
    for (let i = 0; i < 7; i++) {
      const rank = 1 + rng.int(9);
      const a = rng.int(3);
      tiles.push(SUITS[a]! + rank, SUITS[(a + 1 + rng.int(2)) % 3]! + rank);
    }
  } else if (kind === 1) {
    for (let i = 0; i < 4; i++) {
      const rank = 1 + rng.int(9);
      for (const suit of SUITS) tiles.push(suit + rank);
    }
    const rank = 1 + rng.int(9);
    const a = rng.int(3);
    tiles.push(SUITS[a]! + rank, SUITS[(a + 1 + rng.int(2)) % 3]! + rank);
  } else if (kind === 2) {
    for (let i = 0; i < 4; i++) {
      const suit = SUITS[rng.int(3)]!;
      const rank = 1 + rng.int(7);
      tiles.push(suit + rank, suit + (rank + 1), suit + (rank + 2));
    }
    const pair = tile();
    tiles.push(pair, pair);
  } else if (kind === 3) {
    for (let i = 0; i < 7; i++) {
      const pair = rng.int(4) === 0 ? HONOURS[rng.int(7)]! : tile();
      tiles.push(pair, pair);
    }
  } else {
    for (let i = 0; i < 14; i++) tiles.push(rng.int(6) === 0 ? HONOURS[rng.int(7)]! : tile());
  }
  return tiles;
}

describe("group readings agree with match", () => {
  it("every hand declared as groups completes its groups exactly when it matches", () => {
    const rng = createRng("groups-agree-with-match");
    const declared = PATTERNS.filter((pattern) => pattern.groups !== undefined);
    assert.ok(declared.length > 0);
    let hands = 0;
    for (let round = 0; round < 6000; round++) {
      const tiles = randomHand(rng);
      const counts = new Map<string, number>();
      for (const key of tiles) counts.set(key, (counts.get(key) ?? 0) + 1);
      if ([...counts.values()].some((count) => count > 4)) continue;
      hands++;
      const hand = createHand({ concealed: tiles.join(" "), selfDrawn: true });
      const shape = normalizeHand(hand);
      const context = { shape, hand, isConcealed: true, isSelfDrawn: true };
      for (const pattern of declared) {
        const grouped = pattern.groups!(ownWindKey(shape)).some((reading) => matchesGroups(shape, reading));
        assert.equal(grouped, pattern.match(context), `${pattern.id}: groups and match disagree on ${tiles.join(" ")}`);
      }
    }
    assert.ok(hands > 4000, "enough legal hands were tried");
  });

  it("does not read seven mixed pairs across three suits as Knitting", () => {
    // The report's hand: b1/o1, c1/o1, b2/c2, b3/o3, b4/o4, b9/o9, c5/o5.
    const hand = createHand({ concealed: "b1 b2 b3 b4 b9 c1 c2 c5 o1 o1 o3 o4 o5 o9", selfDrawn: true });
    const knitting = PATTERNS.find((pattern) => pattern.id === "knitting")!;
    const shape = normalizeHand(hand);
    assert.equal(knitting.match({ shape, hand, isConcealed: true, isSelfDrawn: true }), false);
    assert.equal(knitting.groups!("wE").some((reading) => matchesGroups(shape, reading)), false);
  });
});

describe("Knitting in the closest hands", () => {
  const OTHERS = {
    S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
    W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
    N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
  };
  const WALL: readonly string[] = Array.from({ length: 60 }, (_, i) => ["c6", "o9", "dW", "c3", "o5", "wN"][i % 6]!);

  it("is not 3 away from the report's opening hand, which sits four tiles from two suits' pairs", () => {
    // Issue #191, East's first hand: only b and o hold pairs of one number (1, 3, 4, 9),
    // so Knitting in those suits still wants o2, o4 and a seventh pair: four away.
    const state = fixture({
      hands: { E: "b1 b2 b3 b4 b4 b9 c5 c7 o1 o3 o4 o9 wS", ...OTHERS },
      wall: WALL,
      phase: "draw",
      turn: "E",
    });
    const knitting = closestHands(viewFor(state, "E"), 100).find((hand) => hand.pattern === "knitting");
    assert.ok(knitting, "Knitting is in reach");
    assert.equal(knitting.away, 4);
  });

  it("is not complete on seven mixed pairs spread over three suits", () => {
    const state = fixture({
      hands: { E: "b1 b2 b3 b4 b9 c1 c2 c5 o1 o1 o3 o4 o5 o9", ...OTHERS },
      wall: WALL,
      phase: "discard",
      turn: "E",
    });
    const knitting = closestHands(viewFor(state, "E"), 100).find((hand) => hand.pattern === "knitting");
    assert.ok(knitting === undefined || knitting.away > 0, "not a finished Knitting hand");
    assert.ok(knitting === undefined || knitting.chance < 1);
  });
});
