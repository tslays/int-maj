/**
 * The chance bands and the grouped needed tiles (`app/src/chance.js`): where
 * the cuts fall, and that a tile needed several times shows once with its
 * count against the copies still unseen.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { BANDS, bandOdds, bandRank, chanceBand, chanceWords, needGroups } = await import("../../app/src/chance.js");

describe("chance bands", () => {
  it("cuts at 2, 10, 25 and 50 percent", () => {
    const id = (chance: number): string => chanceBand(chance).id;
    assert.equal(id(0), "remote");
    assert.equal(id(0.007), "remote");
    assert.equal(id(0.019), "remote");
    assert.equal(id(0.02), "long-shot");
    assert.equal(id(0.099), "long-shot");
    assert.equal(id(0.1), "unlikely");
    assert.equal(id(0.25), "possible");
    assert.equal(id(0.499), "possible");
    assert.equal(id(0.5), "likely");
    assert.equal(id(1), "likely");
  });

  it("ranks remote lowest and likely highest", () => {
    assert.equal(bandRank(0), 0);
    assert.equal(bandRank(1), BANDS.length - 1);
  });

  it("words the chance for a screen reader and in plain odds", () => {
    assert.equal(chanceWords(0.007), "remote to build");
    assert.equal(chanceWords(0.05), "a long shot to build");
    assert.equal(chanceWords(0.6), "likely to build");
    assert.equal(bandOdds(0.007), "Remote: less than 1 in 50.");
  });
});

describe("needed tiles", () => {
  it("shows a tile needed several times once, with its count and the unseen copies", () => {
    const groups = needGroups({ need: ["c3", "dG", "dG", "dW", "dW", "dW"], unseen: { c3: 4, dG: 4, dW: 4 } });
    assert.deepEqual(groups, [
      { key: "c3", count: 1, left: 4 },
      { key: "dG", count: 2, left: 4 },
      { key: "dW", count: 3, left: 4 },
    ]);
  });

  it("leaves the unseen count out when it is not known", () => {
    assert.deepEqual(needGroups({ need: ["b1"] }), [{ key: "b1", count: 1, left: undefined }]);
  });
});
