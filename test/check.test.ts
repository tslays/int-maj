import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkHand,
  completeHand,
  parseTiles,
  waitingTiles,
  type CheckResult,
} from "../src/core/check.ts";
import { tileKey } from "../src/core/tiles.ts";

function win(input: string | readonly string[]): Extract<CheckResult, { size: 14 }> {
  const result = checkHand(input);
  assert.equal(result.size, 14, JSON.stringify(result));
  if (result.size !== 14) throw new Error("expected a 14-tile result");
  return result;
}

function wait(input: string | readonly string[]): Extract<CheckResult, { size: 13 }> {
  const result = checkHand(input);
  assert.equal(result.size, 13, JSON.stringify(result));
  if (result.size !== 13) throw new Error("expected a 13-tile result");
  return result;
}

function invalid(input: string | readonly string[]): Extract<CheckResult, { size: null }> {
  const result = checkHand(input);
  assert.equal(result.size, null, JSON.stringify(result));
  if (result.size !== null) throw new Error("expected an error result");
  return result;
}

const WIN = "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5 b5";
const SINGLE_WAIT = "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5";
const WRIGGLY_WAIT = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN";
const WINDY_ONES = "b1 b1 b1 c1 c1 c1 o1 o1 o1 wE wE wS wW wN";

describe("parseTiles", () => {
  it("reads canonical keys case-insensitively", () => {
    const parsed = parseTiles("B1 c2 O9 WE ws Wn DR dg DW F1 S2");
    assert.deepEqual(parsed.tiles.map(tileKey), [
      "b1", "c2", "o9", "wE", "wS", "wN", "dR", "dG", "dW",
    ]);
    assert.deepEqual(parsed.bonuses.map(tileKey), ["f1", "s2"]);
    assert.deepEqual(parsed.errors, []);
  });

  it("reads single-letter and word aliases", () => {
    const parsed = parseTiles("E S W N r g w red green white");
    assert.deepEqual(parsed.tiles.map(tileKey), [
      "wE", "wS", "wW", "wN", "dR", "dG", "dW", "dR", "dG", "dW",
    ]);
  });

  it("separates on whitespace, commas and pipes", () => {
    const parsed = parseTiles("b1,b2|b3  b4");
    assert.deepEqual(parsed.tiles.map(tileKey), ["b1", "b2", "b3", "b4"]);
    assert.deepEqual(parsed.errors, []);
  });

  it("records each exposed group and its start offset", () => {
    const parsed = parseTiles("(b1 b2 b3) b4 c5 (wE wE wE)");
    assert.deepEqual(parsed.tiles.map(tileKey), [
      "b1", "b2", "b3", "b4", "c5", "wE", "wE", "wE",
    ]);
    assert.deepEqual(
      parsed.meldGroups.map((group) => group.map(tileKey)),
      [["b1", "b2", "b3"], ["wE", "wE", "wE"]],
    );
    assert.deepEqual(parsed.exposedMelds, [0, 5]);
    assert.deepEqual(parsed.errors, []);
  });

  it("strips flowers and seasons into bonuses", () => {
    const parsed = parseTiles("b1 f1 s2 b2");
    assert.deepEqual(parsed.tiles.map(tileKey), ["b1", "b2"]);
    assert.deepEqual(parsed.bonuses.map(tileKey), ["f1", "s2"]);
  });

  it("reports an unknown token by name", () => {
    const parsed = parseTiles("b1 z9");
    assert.ok(parsed.errors.some((error) => /Unknown tile "z9"/.test(error)));
  });

  it("reports more than four copies", () => {
    const parsed = parseTiles("b1 b1 b1 b1 b1");
    assert.ok(parsed.errors.some((error) => /More than four copies of b1/.test(error)));
  });

  it("reports an illegal exposed meld with the offending group", () => {
    const parsed = parseTiles("(b1 b2 b4)");
    assert.ok(
      parsed.errors.some(
        (error) => /Illegal exposed meld/.test(error) && /b1 b2 b4/.test(error),
      ),
    );
  });

  it("reports more than four exposed melds", () => {
    const parsed = parseTiles(
      "(b1 b1 b1) (b2 b2 b2) (b3 b3 b3) (b4 b4 b4) (b5 b5 b5) b6",
    );
    assert.ok(
      parsed.errors.some((error) => /More than four exposed melds/.test(error)),
    );
  });
});

describe("checkHand on 14 tiles", () => {
  it("ranks matches by tier and marks the best", () => {
    const result = win(WIN);
    assert.deepEqual(
      result.matches.map((match) => match.pattern.id),
      ["three-great-scholars", "ordinary-mahjong"],
    );
    assert.equal(result.matches[0]!.points, 1500);
    assert.equal(result.matches[1]!.points, null);
    assert.equal(result.best, result.matches[0]);
    assert.equal(result.concealed, true);
  });

  it("passes an exposed kong through as one set, not one missing tile", () => {
    const result = win(
      "(b1 b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN",
    );
    assert.equal(result.matches[0]!.pattern.id, "windy-ones");
    assert.equal(result.matches[0]!.tier, "half");
    assert.equal(result.matches[0]!.points, 500);
    assert.equal(result.concealed, false);
  });

  it("strips bonuses before the size check", () => {
    const input = `${WIN} f1 f3 s2`;
    const result = win(input);
    assert.equal(result.matches[0]!.pattern.id, "three-great-scholars");
    const parsed = parseTiles(input);
    assert.equal(parsed.bonuses.length, 3);
    assert.equal(parsed.tiles.length, 14);
  });

  it("drops a concealed-only pattern when a meld is exposed, keeping the exposure-valued one", () => {
    const concealed = win(WINDY_ONES);
    assert.deepEqual(
      concealed.matches.map((match) => match.pattern.id),
      ["windy-ones", "windvane"],
    );

    const exposed = win(
      "(b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN",
    );
    assert.deepEqual(
      exposed.matches.map((match) => match.pattern.id),
      ["windy-ones"],
    );
    assert.equal(exposed.matches[0]!.tier, "half");
    assert.equal(exposed.concealed, false);
  });
});

describe("checkHand on 13 tiles", () => {
  it("finds the single completing tile", () => {
    const result = wait(SINGLE_WAIT);
    assert.equal(result.waits.length, 1);
    const only = result.waits[0]!;
    assert.equal(tileKey(only.tile), "b5");
    assert.equal(only.remaining, 3);
    assert.equal(only.dead, false);
    assert.deepEqual(
      only.matches.map((match) => match.pattern.id),
      ["three-great-scholars", "ordinary-mahjong"],
    );
  });

  it("lists every tile that completes a Wriggly Snake, best tier first", () => {
    const result = wait(WRIGGLY_WAIT);
    assert.equal(result.waits.length, 16);
    assert.deepEqual(
      result.waits.slice(0, 13).map((report) => tileKey(report.tile)),
      [
        "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9",
        "wE", "wS", "wW", "wN",
      ],
    );
    assert.deepEqual(
      result.waits.slice(13).map((report) => tileKey(report.tile)),
      ["dR", "dG", "dW"],
    );
    assert.ok(
      result.waits
        .slice(0, 13)
        .every((report) => report.matches[0]!.pattern.id === "wriggly-snake"),
    );
    assert.ok(
      result.waits
        .slice(13)
        .every((report) => report.matches[0]!.pattern.id === "five-odd-honours"),
    );
    assert.ok(result.waits.every((report) => !report.dead));
  });

  it("marks a wait on a tile whose four copies are already visible as dead", () => {
    const result = wait("b1 b1 b1 b2 b2 b2 b3 b3 b3 b5 b5 b5 b5");
    const dead = result.waits.find((report) => tileKey(report.tile) === "b5");
    assert.ok(dead);
    assert.equal(dead!.remaining, 0);
    assert.equal(dead!.dead, true);
    assert.ok(
      dead!.matches.some((match) => match.pattern.id === "ordinary-mahjong"),
    );

    const live = result.waits.find((report) => tileKey(report.tile) === "b4");
    assert.ok(live);
    assert.equal(live!.dead, false);
  });

  it("lists a wait that only a self-drawn tile completes", () => {
    // Seven Twins needs every tile from the wall, so this wait can never be
    // claimed off a discard, but it is still the tile that finishes the hand
    // and the wait a fishing declaration fixes.
    const result = wait("b2 b2 b9 b9 o1 o1 o2 o3 o3 o4 o4 o8 o8");
    assert.equal(result.waits.length, 1);
    const drawn = result.waits[0]!;
    assert.equal(tileKey(drawn.tile), "o2");
    assert.equal(drawn.selfDrawnOnly, true);
    assert.equal(drawn.matches[0]!.pattern.id, "seven-twins");
  });

  it("accepts aliases through the whole checker", () => {
    const result = win("R R R g g g white white white b1 b2 b3 b5 b5");
    assert.equal(result.matches[0]!.pattern.id, "three-great-scholars");
  });
});

describe("checkHand errors", () => {
  it("reports a hand size other than 13 or 14 after bonuses", () => {
    const result = invalid("b1 b2 b3");
    assert.ok(result.errors.some((error) => /expected 13 or 14/.test(error)));
  });

  it("reports an unknown token through the checker", () => {
    const result = invalid("b1 b2 z9");
    assert.ok(result.errors.some((error) => /z9/.test(error)));
  });

  it("reports more than four copies through the checker", () => {
    const result = invalid("b1 b1 b1 b1 b1");
    assert.ok(result.errors.some((error) => /More than four copies/.test(error)));
  });

  it("reports an illegal exposed meld through the checker", () => {
    const result = invalid("(b1 b2 b4)");
    assert.ok(result.errors.some((error) => /Illegal exposed meld/.test(error)));
  });

  it("reports more than four melds through the checker", () => {
    const result = invalid(
      "(b1 b1 b1) (b2 b2 b2) (b3 b3 b3) (b4 b4 b4) (b5 b5 b5) b6",
    );
    assert.ok(result.errors.some((error) => /More than four melds|More than four exposed melds/.test(error)));
  });
});

describe("checkHand robustness and wrappers", () => {
  it("never throws on malformed input", () => {
    for (const input of ["", "(((", "b1 b1 b1 b1 b1", "(b1 b2", "b1 b2 )", "???"]) {
      assert.doesNotThrow(() => checkHand(input));
      assert.equal(checkHand(input).size, null);
    }
  });

  it("waitingTiles returns waits for a 13-tile hand and rejects a complete hand", () => {
    const result = waitingTiles(SINGLE_WAIT);
    assert.equal(result.size, 13);
    if (result.size !== 13) return;
    assert.equal(result.waits.length, 1);

    const rejected = waitingTiles(WIN);
    assert.equal(rejected.size, null);
    if (rejected.size !== null) return;
    assert.ok(rejected.errors.some((error) => /already complete/.test(error)));
  });

  it("completeHand returns matches for a 14-tile hand and rejects a wait", () => {
    const result = completeHand(WIN);
    assert.equal(result.size, 14);
    if (result.size !== 14) return;
    assert.equal(result.best?.pattern.id, "three-great-scholars");

    const rejected = completeHand(SINGLE_WAIT);
    assert.equal(rejected.size, null);
    if (rejected.size !== null) return;
    assert.ok(rejected.errors.some((error) => /one tile short/.test(error)));
  });
});
