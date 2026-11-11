/**
 * The hand index: the book headings, pages and examples in
 * src/core/patterns/reference.ts line up with the pattern table.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handDetail, handIndex } from "../../src/core/game/index.ts";
import { EDITORIAL_ROWS, EXAMPLES, SYNOPSIS } from "../../src/core/patterns/reference.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { FIXTURES } from "./catalogue.test.ts";

const IDS = new Set(PATTERNS.map((pattern) => pattern.id));

describe("hand index", () => {
  it("files only catalogue hands, each once per heading", () => {
    for (const heading of SYNOPSIS) {
      const ids = [...heading.rows.map(([, id]) => id), ...(EDITORIAL_ROWS[heading.id] ?? [])];
      for (const id of ids) assert.ok(IDS.has(id), `${heading.name}: unknown hand ${id}`);
      assert.equal(new Set(ids).size, ids.length, `${heading.name} repeats a hand`);
    }
    for (const key of Object.keys(EDITORIAL_ROWS)) assert.ok(SYNOPSIS.some((heading) => heading.id === key));
  });

  it("gives every hand a heading; only the two unfiled ordinary hands fall under Other", () => {
    const { groups, hands } = handIndex();
    assert.equal(hands.length, PATTERNS.length);
    for (const hand of hands) assert.ok(hand.groups.length > 0, `${hand.pattern} has no heading`);
    assert.deepEqual(groups.at(-1), { id: "other", name: "Other", hands: ["buried-treasure", "chinese-ordinary"] });
    assert.deepEqual(
      groups.map((group) => group.name).slice(0, 4),
      ["Runs", "Chows", "Pairs", "Pungs & Kongs"],
    );
    const bamboo = groups.find((group) => group.id === "bamboo")!;
    assert.equal(bamboo.hands[0], "sparrows-sanctuary", "book order within a heading");
  });

  it("splits the catalogue between the books as the framework counts it: 54 and 35", () => {
    const { hands } = handIndex();
    assert.equal(hands.filter((hand) => hand.pages.illustrated.length > 0).length, 54);
    assert.equal(hands.filter((hand) => hand.pages.illustrated.length === 0).length, 35);
    for (const hand of hands) {
      const printed = hand.pages.illustrated.length > 0 || hand.pages.companion.length > 0;
      assert.ok(printed, `${hand.pattern} has no page in either book`);
    }
  });

  it("reads pages per book", () => {
    const snake = handDetail("wriggly-snake")!;
    assert.deepEqual(snake.pages.illustrated, [38]);
    assert.deepEqual(snake.pages.companion, [10, 27]);
    assert.deepEqual(snake.groups, ["runs", "winds"]);
    const robin = handDetail("robin")!;
    assert.deepEqual(robin.pages.illustrated, []);
    assert.deepEqual(robin.pages.companion, [60], "not illustrated, but the synopsis page is cited");
    assert.deepEqual(handDetail("all-kong")!.groups, ["pungs"]);
  });

  it("shows each hand with the example the catalogue test proves", () => {
    for (const pattern of PATTERNS) {
      assert.equal(EXAMPLES[pattern.id], FIXTURES[pattern.id]!.positive.concealed, pattern.id);
      assert.ok(handDetail(pattern.id)!.example.length >= 14);
    }
  });
});
