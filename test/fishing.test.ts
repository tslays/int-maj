import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  declareFishing,
  fishingTotal,
  settleFishing,
} from "../src/core/fishing.ts";
import { TIER_FISHING } from "../src/core/patterns/types.ts";

describe("fishing declaration", () => {
  it("fixes and dedupes the wait", () => {
    const declaration = declareFishing({
      player: "south",
      wait: ["o5", "o5", "b2"],
      tier: "limit",
    });
    assert.deepEqual(declaration.wait, ["o5", "b2"]);
    assert.equal(declaration.tier, "limit");
    assert.ok(Object.isFrozen(declaration));
  });

  it("accepts a tile-spec wait", () => {
    const declaration = declareFishing({
      player: "east",
      wait: "c3 c6",
      tier: "half",
    });
    assert.deepEqual(declaration.wait, ["c3", "c6"]);
  });

  it("accepts a dead wait: the printed pages set no dead-wait restriction", () => {
    const declaration = declareFishing({
      player: "west",
      wait: "o5",
      tier: "double",
    });
    assert.deepEqual(declaration.wait, ["o5"]);
  });

  it("rejects an empty wait", () => {
    assert.throws(
      () => declareFishing({ player: "north", wait: [], tier: "half" }),
      /wait/,
    );
  });
});

describe("fishing settlement", () => {
  const declarations = [
    declareFishing({ player: "east", wait: "o5", tier: "limit" }),
    declareFishing({ player: "south", wait: "b2", tier: "half" }),
    declareFishing({ player: "west", wait: "c7", tier: "double" }),
  ];

  it("pays every fishing player except the winner", () => {
    const awards = settleFishing(declarations, "east", {
      half: 200,
      limit: 400,
      middle: 600,
      double: 800,
    });
    assert.deepEqual(
      awards.map((award) => [award.player, award.points]),
      [
        ["south", 200],
        ["west", 800],
      ],
    );
  });

  it("uses the printed per-tier fishing values", () => {
    assert.deepEqual(TIER_FISHING, {
      half: 200,
      limit: 400,
      middle: 600,
      double: 500,
      calculate: null,
    });
    const awards = settleFishing(declarations, "east");
    assert.deepEqual(
      awards.map((award) => award.points),
      [200, 500],
    );
    assert.deepEqual(fishingTotal(awards), { points: 700, unknown: 0 });
  });

  it("uses a declaration's printed figure when it has one", () => {
    const special = declareFishing({
      player: "west",
      wait: "b3",
      tier: "double",
      value: 800,
    });
    const awards = settleFishing([special], "east");
    assert.deepEqual(awards.map((award) => award.points), [800]);
  });

  it("sums known awards and counts unknown ones", () => {
    const awards = settleFishing(declarations, "east", {
      half: 200,
      limit: 400,
      middle: 600,
      double: null,
    });
    assert.deepEqual(fishingTotal(awards), { points: 200, unknown: 1 });
  });
});
