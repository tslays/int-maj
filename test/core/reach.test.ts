/**
 * How near a player's tiles are to a hand declared as groups (reach.ts), and
 * the declarations themselves: the hints panel must never say a hand is
 * further away than it is, because it once did (Crazy Chows read "4 to go"
 * with one tile missing: it was measured against a sample of the hand's
 * versions, and the player's own version was not in the sample).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPECIAL_TARGETS } from "../../src/core/game/bot/targets.ts";
import { createHand } from "../../src/core/hand.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { mixedChowGroup, mixedPairGroup, pairGroup, pungOnlyGroup } from "../../src/core/patterns/predicates.ts";
import { nearest } from "../../src/core/patterns/reach.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { PLAY_TILE_KEYS } from "../../src/core/tiles.ts";

const KEYS = PLAY_TILE_KEYS;
const BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

/** Held tiles by index, and the copies still out there (all the rest). */
function tilesOf(text: string): { held: Int8Array; spare: Int8Array } {
  const held = new Int8Array(KEYS.length);
  for (const key of text.split(" ").filter((key) => key.length > 0)) held[KEYS.indexOf(key)]! += 1;
  const spare = new Int8Array(KEYS.length);
  for (let index = 0; index < KEYS.length; index++) spare[index] = 4 - held[index]!;
  return { held, spare };
}

function crazyChows() {
  return BY_ID.get("crazy-chows")!.groups!("wE");
}

describe("nearest partition into groups", () => {
  // The hand a player reported: 13 tiles, one from Crazy Chows.
  // Chows 3o4b5c, 3c4o5b, 4c5b6o, 7b8o9c; pair 7o + 7c (a mixed pair).
  const REPORTED = "c3 o4 b5 c4 b5 o6 o3 b4 c5 b7 o8 c9 o7";

  it("finds the one tile missing from the reported Crazy Chows hand", () => {
    const { held, spare } = tilesOf(REPORTED);
    const reach = nearest({ alternatives: crazyChows(), held, spare, melds: [], budget: 6, keep: 8 });
    assert.ok(reach);
    assert.equal(reach.missing, 1);
    // Either 7 characters (pairing 7 circles) or 7 bamboo (the 7 in the chow 7b8o9c pairs with 7 circles).
    const wanted = reach.wants.map((wants) =>
      KEYS.filter((key, index) => wants[index]! > held[index]!).join(),
    );
    assert.ok(wanted.every((key) => key === "b7" || key === "c7"), wanted.join(" | "));
  });

  it("reads the same 13 tiles plus a spare tile as still one away", () => {
    const { held, spare } = tilesOf(`${REPORTED} b8`);
    const reach = nearest({ alternatives: crazyChows(), held, spare, melds: [], budget: 6, keep: 8 });
    assert.equal(reach?.missing, 1, "the extra tile is simply not used");
  });

  it("says nothing within the budget when every way needs a tile that is out of play", () => {
    const { held, spare } = tilesOf(REPORTED);
    spare[KEYS.indexOf("c7")] = 0;
    spare[KEYS.indexOf("b7")] = 0;
    const reach = nearest({ alternatives: crazyChows(), held, spare, melds: [], budget: 1, keep: 8 });
    assert.equal(reach, null);
    const wider = nearest({ alternatives: crazyChows(), held, spare, melds: [], budget: 6, keep: 8 });
    assert.ok(wider === null || wider.missing >= 2);
  });

  it("reports a complete hand as no tiles missing", () => {
    const { held, spare } = tilesOf(`${REPORTED} c7`);
    assert.equal(nearest({ alternatives: crazyChows(), held, spare, melds: [], budget: 0, keep: 1 })?.missing, 0);
  });

  it("is deterministic and keeps distinct versions only", () => {
    const { held, spare } = tilesOf(REPORTED);
    const input = { alternatives: crazyChows(), held, spare, melds: [], budget: 3, keep: 50 };
    const first = nearest(input)!;
    const again = nearest(input)!;
    assert.deepEqual(first.wants.map((wants) => [...wants]), again.wants.map((wants) => [...wants]));
    assert.equal(new Set(first.wants.map((wants) => wants.join())).size, first.wants.length);
  });

  it("holds a declared meld as one fixed group", () => {
    // Four pungs and a pair: a pung of 5 circles is declared, so only ten tiles are concealed.
    const groups = [[...Array.from({ length: 4 }, () => pungOnlyGroup(() => true)), pairGroup(() => true)]];
    const { held, spare } = tilesOf("c2 c2 c2 b9 b9 b9 wE wE wE dR dR");
    spare[KEYS.indexOf("o5")] = 1; // three copies are in the meld
    const meld = ["o5", "o5", "o5"];
    assert.equal(nearest({ alternatives: groups, held, spare, melds: [meld], budget: 0, keep: 1 })?.missing, 0);
    // A chow cannot be seated in a pung group, so a declared chow rules this reading out.
    assert.equal(
      nearest({ alternatives: groups, held, spare, melds: [["o1", "o2", "o3"]], budget: 6, keep: 1 }),
      null,
    );
  });

  it("counts four of a kind as two pairs, and leaves the kong out of pung groups", () => {
    const windfall = BY_ID.get("windfall")!.groups!("wE");
    const hand = "b2 b2 b4 b4 b6 b6 b8 b8 b8 b8 wE wS wW wN";
    const { held, spare } = tilesOf(hand);
    assert.equal(nearest({ alternatives: windfall, held, spare, melds: [], budget: 0, keep: 1 })?.missing, 0);
    // Four pungs and a pair take fourteen tiles; a fifth copy is no use to them.
    const groups = [[...Array.from({ length: 4 }, () => pungOnlyGroup(() => true)), pairGroup(() => true)]];
    const four = tilesOf("b5 b5 b5 b5 c1 c1 c1 o1 o1 o1 wE wE wE dR");
    assert.equal(nearest({ alternatives: groups, held: four.held, spare: four.spare, melds: [], budget: 6, keep: 1 })?.missing, 1);
  });

  it("uses a mixed pair, which no pair of identical tiles can stand for", () => {
    const groups = [[mixedChowGroup(), mixedPairGroup()]];
    const { held, spare } = tilesOf("b1 c2 o3 b7 c7");
    assert.equal(nearest({ alternatives: groups, held, spare, melds: [], budget: 0, keep: 1 })?.missing, 0);
  });
});

// ---------------------------------------------------------------------------

/** Small seeded generator, so a failure replays. */
function generator(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function accepts(pattern: (typeof PATTERNS)[number], tiles: readonly string[]): boolean {
  const hand = createHand({ concealed: tiles.join(" "), selfDrawn: pattern.requiresSelfDrawn });
  return pattern.match({
    shape: normalizeHand(hand),
    hand,
    isConcealed: true,
    isSelfDrawn: pattern.requiresSelfDrawn,
  });
}

const withinFour = (tiles: readonly string[]): boolean =>
  KEYS.every((key) => tiles.filter((tile) => tile === key).length <= 4);

/**
 * The truth, by brute force through the pattern's own predicate: the fewest
 * tiles (0 to 2) a hand lacks of any accepted fourteen. 99 means more than two.
 */
function nearestByMatch(pattern: (typeof PATTERNS)[number], tiles: readonly string[]): number {
  const distinct = [...new Set(tiles)];
  const completes = (rest: readonly string[], adds: number): boolean => {
    const add = (from: number, left: number, current: readonly string[]): boolean => {
      if (left === 0) return withinFour(current) && accepts(pattern, current);
      for (let index = from; index < KEYS.length; index++) {
        if (add(index, left - 1, [...current, KEYS[index]!])) return true;
      }
      return false;
    };
    return add(0, adds, rest);
  };
  for (let missing = 0; missing <= 2; missing++) {
    const removals = tiles.length + missing - 14;
    if (removals < 0) continue;
    if (removals === 0) {
      if (completes(tiles, missing)) return missing;
      continue;
    }
    for (const first of distinct) {
      const rest = [...tiles];
      rest.splice(rest.indexOf(first), 1);
      if (removals === 1) {
        if (completes(rest, missing)) return missing;
        continue;
      }
      for (const second of distinct) {
        const fewer = [...rest];
        const at = fewer.indexOf(second);
        if (at < 0) continue;
        fewer.splice(at, 1);
        if (completes(fewer, missing)) return missing;
      }
    }
  }
  return 99;
}

describe("declared groups agree with each pattern's own matcher", () => {
  const declared = PATTERNS.filter((pattern) => pattern.groups !== undefined && pattern.tier !== "calculate");

  it("measures the same distance as brute force through the matcher, for every declared hand", () => {
    const targets = new Map(SPECIAL_TARGETS);
    const random = generator(2024);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    let checked = 0;
    for (const pattern of declared) {
      const versions = (targets.get(pattern.id) ?? "").split(" ").filter((text) => text.length > 0);
      assert.ok(versions.length > 0, `no sample hands for ${pattern.id}`);
      for (let trial = 0; trial < 3; trial++) {
        // A version of the hand with up to two tiles changed, as thirteen or fourteen tiles.
        let tiles = [...(pick(versions).match(/../g) as string[])];
        for (let change = Math.floor(random() * 3); change > 0; change--) tiles[Math.floor(random() * 14)] = pick(KEYS);
        if (!withinFour(tiles)) continue;
        if (random() < 0.5) tiles = tiles.filter((_, index) => index !== Math.floor(random() * tiles.length));
        const { held, spare } = tilesOf(tiles.join(" "));
        const reach = nearest({ alternatives: pattern.groups!("wE"), held, spare, melds: [], budget: 2, keep: 4 });
        assert.equal(
          reach === null ? 99 : reach.missing,
          nearestByMatch(pattern, tiles),
          `${pattern.id}: ${tiles.join(" ")}`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > declared.length, `only ${checked} hands checked`);
  });

  it("covers every hand whose sample list may have been cut short", () => {
    // scripts/bot-targets.ts stops at 160 hands per pattern, and the bots read that sample.
    // A hand with more versions than that cannot be measured from it, so it must be declared.
    const CAP = 160;
    for (const [id, hands] of SPECIAL_TARGETS) {
      if (hands.split(" ").length < CAP) continue;
      assert.ok(BY_ID.get(id)!.groups !== undefined, `${id} has ${CAP}+ sample hands but declares no groups`);
    }
  });
});
