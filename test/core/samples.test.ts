import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, isConcealed } from "../../src/core/hand.ts";
import { handDetail } from "../../src/core/game/closest.ts";
import { SAMPLES, samplesFor, type BookSample } from "../../src/core/patterns/samples.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { WINDS } from "../../src/core/tiles.ts";

const PATTERN_BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

const PLAY_KEYS = [
  ...["b", "c", "o"].flatMap((suit) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
];

/** Every way to put a real tile on each printed "any tile" card. */
function fillings(sample: BookSample): string[][] {
  let hands: string[][] = [[]];
  for (const tile of sample.groups.flat()) {
    const choices = typeof tile === "string" ? [tile] : PLAY_KEYS;
    hands = hands.flatMap((hand) => choices.map((choice) => [...hand, choice]));
  }
  return hands;
}

function matches(id: string, tiles: string[]): boolean {
  const pattern = PATTERN_BY_ID.get(id)!;
  // "Own Wind" hands depend on the seat, the Chinese hand on the game played.
  for (const variant of ["western", "chinese"] as const) {
    for (const seatWind of WINDS) {
      let hand;
      try {
        hand = createHand({ concealed: tiles.join(" "), selfDrawn: true, seatWind, variant });
      } catch {
        return false; // a fifth copy of a tile
      }
      const context = { shape: normalizeHand(hand), hand, isConcealed: isConcealed(hand), isSelfDrawn: true };
      if (pattern.match(context)) return true;
    }
  }
  return false;
}

describe("book sample hands", () => {
  it("has an entry for every catalogue hand and for nothing else", () => {
    assert.deepEqual(Object.keys(SAMPLES).sort(), PATTERNS.map((pattern) => pattern.id).sort());
  });

  it("pictures fourteen tiles, the primary book first", () => {
    for (const [id, samples] of Object.entries(SAMPLES)) {
      const books = samples.map((sample) => sample.book);
      assert.deepEqual(books, [...books].sort().reverse(), `${id}: Illustrated before Companion`);
      for (const sample of samples) {
        assert.equal(sample.groups.flat().length, 14, `${id} ${sample.book} p. ${sample.page}`);
        assert.ok(sample.groups.every((group) => group.length > 0), `${id}: no empty group`);
      }
    }
  });

  it("is a winning example of the hand it is printed under", () => {
    const failures: string[] = [];
    for (const [id, samples] of Object.entries(SAMPLES)) {
      for (const sample of samples) {
        const target = sample.illustrates ?? id;
        if (!fillings(sample).some((tiles) => matches(target, tiles))) {
          failures.push(`${id} ${sample.book} p. ${sample.page} does not make ${target}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });

  it("says so when one printed picture stands for a different table id", () => {
    const robert = samplesFor("big-robert")[0]!;
    assert.equal(robert.illustrates, "big-robert-mixed");
    assert.ok(!fillings(robert).some((tiles) => matches("big-robert", tiles)));
    assert.ok(robert.note);
  });

  it("rejects a picture that is not the hand", () => {
    const twins = samplesFor("heavenly-twins")[0]!;
    assert.ok(!fillings(twins).some((tiles) => matches("gates-of-heaven", tiles)));
  });

  it("reaches the hand sheet, one picture with every book that prints it", () => {
    const snake = handDetail("wriggly-snake")!;
    assert.equal(snake.samples.length, 1);
    assert.deepEqual(snake.samples[0]!.sources, [
      { book: "The Game of Mah Jong Illustrated", page: 38 },
      { book: "The Mah Jong Player's Companion", page: 10 },
    ]);
    assert.deepEqual(snake.samples[0]!.groups[2], [{ any: "Any tile paired" }]);
    assert.deepEqual(handDetail("robin")!.samples, []);
  });

  it("keeps two pictures apart when the books differ", () => {
    const run = handDetail("run-pung-pair")!;
    assert.equal(run.samples.length, 2);
    assert.ok(run.samples.every((sample) => sample.sources.length === 1));
    const tail = handDetail("dragons-tail")!;
    assert.equal(tail.samples.length, 2, "two versions, each printed in both books");
    assert.ok(tail.samples.every((sample) => sample.sources.length === 2));
  });
});
