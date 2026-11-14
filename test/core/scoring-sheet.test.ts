/**
 * The score sheet of The Game of Mah Jong Illustrated, pp. 24-26, checked line
 * by line against hands whose figures were worked out by hand from the page.
 * Every expectation carries its arithmetic, so a failure says which printed
 * line the engine disagrees with.
 *
 * Seat wind is South and the round is East unless a case says otherwise, so
 * the player's own Flower/Season is number 2.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld, type HandInput } from "../../src/core/hand.ts";
import { scoreHand, type ScoreOptions } from "../../src/core/score.ts";

interface Expect {
  readonly ground: number;
  readonly doubles: number;
}

/**
 * Scores a hand and checks the sheet's figures: ground, doubles, ground × 2^doubles,
 * and that the hand pays the lower of that and the limit (the default 1000).
 */
function check(
  input: HandInput,
  expected: Expect,
  options: ScoreOptions = {},
  seats: Pick<HandInput, "seatWind" | "prevailingWind"> = { seatWind: "S", prevailingWind: "E" },
): void {
  const result = scoreHand(createHand({ ...input, ...seats }), options);
  assert.equal(result.tier, "calculate", `matched ${result.winning?.pattern.id}`);
  assert.equal(result.ground, expected.ground, "ground score");
  assert.equal(result.doubles, expected.doubles, "doubles");
  assert.equal(result.raw, expected.ground * 2 ** expected.doubles, "ground × 2^doubles");
  assert.equal(result.points, Math.min(result.raw!, result.limit), "capped at the limit");
}

const exposed = (kind: "pung" | "kong", tiles: string) => meld({ kind, tiles, exposed: true });
const hidden = (kind: "pung" | "kong", tiles: string) => meld({ kind, tiles, exposed: false });

/** chow 234 + pung 666 + pung 888 + pair 55, and one more pung to declare or hold. */
const REST = "b2 b3 b4 b6 b6 b6 b8 b8 b8 b5 b5";

describe("ground score: groups (I p. 24)", () => {
  // Each hand is one suit: chow (0) + pung 6s (4 concealed) + pung 8s (4) +
  // pair (0) + the pung under test + 20 for Mah Jong. One suit, no honours is
  // Purity: three doubles, so raw = ground × 8.
  it("pung of 2-8: exposed 2, concealed 4", () => {
    check({ concealed: REST, melds: [exposed("pung", "b7 b7 b7")] }, { ground: 2 + 4 + 4 + 20, doubles: 3 });
    check({ concealed: `${REST} b7 b7 b7` }, { ground: 4 + 4 + 4 + 20, doubles: 3 });
  });

  it("pung of 1s and 9s: exposed 4, concealed 8", () => {
    check({ concealed: REST, melds: [exposed("pung", "b1 b1 b1")] }, { ground: 4 + 4 + 4 + 20, doubles: 3 });
    check({ concealed: `${REST} b9 b9 b9` }, { ground: 8 + 4 + 4 + 20, doubles: 3 });
  });

  it("kong of 2-8: exposed 8, concealed 16", () => {
    check({ concealed: REST, melds: [exposed("kong", "b7 b7 b7 b7")] }, { ground: 8 + 4 + 4 + 20, doubles: 3 });
    check({ concealed: REST, melds: [hidden("kong", "b7 b7 b7 b7")] }, { ground: 16 + 4 + 4 + 20, doubles: 3 });
  });

  it("kong of 1s and 9s: exposed 16, concealed 32", () => {
    check({ concealed: REST, melds: [exposed("kong", "b9 b9 b9 b9")] }, { ground: 16 + 4 + 4 + 20, doubles: 3 });
    check({ concealed: REST, melds: [hidden("kong", "b1 b1 b1 b1")] }, { ground: 32 + 4 + 4 + 20, doubles: 3 });
  });

  it("a chow scores nothing, exposed or concealed", () => {
    check(
      { concealed: "b6 b6 b6 b8 b8 b8 b5 b5 b4 b4 b4", melds: [exposed("pung", "b7 b7 b7")] },
      { ground: 2 + 4 + 4 + 4 + 20, doubles: 3 + 1 }, // no chows at all: +1 (g)
    );
  });

  it("honours score as 1s and 9s do: a Dragon or Wind pung is 4 exposed, 8 concealed", () => {
    // Exposed Dragon pung 4 + 6s 4 + 8s 4 + 20; (a) one double, (f) one double.
    check({ concealed: REST, melds: [exposed("pung", "dR dR dR")] }, { ground: 4 + 4 + 4 + 20, doubles: 2 });
    // Concealed Wind pung (a wind that is neither own nor round) 8; (f) only.
    check({ concealed: `${REST} wW wW wW` }, { ground: 8 + 4 + 4 + 20, doubles: 1 });
  });
});

describe("ground score: flowers, seasons and pairs (I p. 24)", () => {
  const BASE = { concealed: REST, melds: [exposed("pung", "b7 b7 b7")] };

  it("a Flower or a Season is 4 each, and a double only when it is the player's own", () => {
    check({ ...BASE, flowers: "f1", seasons: "s3" }, { ground: 10 + 20 + 8, doubles: 3 });
    check({ ...BASE, flowers: "f2" }, { ground: 10 + 20 + 4, doubles: 3 + 1 }); // (e)
    check({ ...BASE, seasons: "s2" }, { ground: 10 + 20 + 4, doubles: 3 + 1 }); // (d)
    check({ ...BASE, flowers: "f2", seasons: "s2" }, { ground: 10 + 20 + 8, doubles: 3 + 2 });
  });

  it("a pair of Dragons, of the player's own Wind, of the Wind of the Round: 2 each", () => {
    const withPair = (pair: string) => ({
      concealed: "b2 b3 b4 b6 b6 b6 b8 b8 b8 " + pair,
      melds: [exposed("pung", "b7 b7 b7")],
    });
    // Honours join the suit, so (f) one suit with Winds or Dragons: one double.
    check(withPair("dR dR"), { ground: 10 + 2 + 20, doubles: 1 });
    check(withPair("wS wS"), { ground: 10 + 2 + 20, doubles: 1 });
    check(withPair("wE wE"), { ground: 10 + 2 + 20, doubles: 1 });
    check(withPair("wW wW"), { ground: 10 + 20, doubles: 1 });
  });

  it("a pair of the Wind that is both own and round gets both bonuses: 4", () => {
    check(
      { concealed: "b2 b3 b4 b6 b6 b6 b8 b8 b8 wE wE", melds: [exposed("pung", "b7 b7 b7")] },
      { ground: 10 + 4 + 20, doubles: 1 },
      {},
      { seatWind: "E", prevailingWind: "E" },
    );
  });
});

describe("ground score: the winning hand's extras (I p. 24 (d)-(h))", () => {
  const BASE = { concealed: REST, melds: [exposed("pung", "b7 b7 b7")] };

  it("(h) going Mah Jong is 20, and a fishing hand scores without it", () => {
    check(BASE, { ground: 10 + 20, doubles: 3 });
    check(BASE, { ground: 10, doubles: 3 }, { withoutMahJongBonus: true });
  });

  it("(d) claiming East's first discard is 2", () => {
    check(BASE, { ground: 10 + 20 + 2, doubles: 3 }, { firstDiscardByEast: true });
  });

  it("(f) drawing the winning tile from the wall is 2", () => {
    // Tile is the pung's third 6 (concealed pung stays 4); the hand is exposed
    // so there is no concealed Mah Jong double.
    check({ ...BASE, winningTile: "b6", selfDrawn: true }, { ground: 10 + 20 + 2, doubles: 3 });
  });

  it("(g) completing the pair with the winning tile is 2", () => {
    check({ ...BASE, winningTile: "b5", selfDrawn: false }, { ground: 10 + 20 + 2, doubles: 3 });
  });

  it("(e) completing a chow in the middle, or at the far end of 1-2-3 / 7-8-9, is 2", () => {
    // Middle of 2-3-4 by the 3.
    check({ ...BASE, winningTile: "b3" }, { ground: 10 + 20 + 2, doubles: 3 });
    // The 3 of 1-2-3, and the 7 of 7-8-9.
    check(
      { concealed: "b1 b2 b3 b6 b6 b6 b8 b8 b8 b5 b5", melds: [exposed("pung", "b7 b7 b7")], winningTile: "b3" },
      { ground: 10 + 20 + 2, doubles: 3 },
    );
    check(
      { concealed: "b7 b8 b9 b2 b2 b2 b4 b4 b4 b5 b5", melds: [exposed("pung", "b6 b6 b6")], winningTile: "b7" },
      { ground: 2 + 4 + 4 + 20 + 2, doubles: 3 },
    );
  });

  it("(e) is not paid for a two-sided chow wait", () => {
    // 2-3-4 completed by the 4 (waiting 1 or 4), the 1 of 1-2-3, the 9 of 7-8-9.
    check({ ...BASE, winningTile: "b4" }, { ground: 10 + 20, doubles: 3 });
    check(
      { concealed: "b1 b2 b3 b6 b6 b6 b8 b8 b8 b5 b5", melds: [exposed("pung", "b7 b7 b7")], winningTile: "b1" },
      { ground: 10 + 20, doubles: 3 },
    );
    check(
      { concealed: "b7 b8 b9 b2 b2 b2 b4 b4 b4 b5 b5", melds: [exposed("pung", "b6 b6 b6")], winningTile: "b9" },
      { ground: 2 + 4 + 4 + 20, doubles: 3 },
    );
  });
});

describe("a pung completed by a discard is an exposed pung (I p. 24)", () => {
  const HAND = "b2 b3 b4 b6 b6 b6 b7 b7 b7 b8 b8 b8 b5 b5";

  it("a pung finished off a discard scores exposed, off the wall scores concealed", () => {
    // Pungs of 6, 7 and 8, chow 234, pair 55; the winning tile is the third 7.
    check({ concealed: HAND, winningTile: "b7", selfDrawn: false }, { ground: 4 + 2 + 4 + 20, doubles: 3 });
    check(
      { concealed: HAND, winningTile: "b7", selfDrawn: true },
      { ground: 4 + 4 + 4 + 20 + 2, doubles: 3 + 2 }, // (f) and a concealed Mah Jong
    );
  });

  it("a high pung finished off a discard is 4 and not 8", () => {
    check(
      { concealed: "b2 b3 b4 b6 b6 b6 b8 b8 b8 b9 b9 b9 b5 b5", winningTile: "b9", selfDrawn: false },
      { ground: 4 + 4 + 4 + 20, doubles: 3 },
    );
  });

  it("scores the winning tile the way that pays the player best", () => {
    // 4 4 4 + 4 5 6: the last 4 finishes the pung (exposed 2, concealed 4
    // otherwise) or the chow's end. As a chow tile it is no bonus, so the
    // pung is read as completed by the 4's place in the chow: concealed.
    check(
      { concealed: "b4 b4 b4 b4 b5 b6 b8 b8 b8 b2 b2 b2 b9 b9", winningTile: "b4", selfDrawn: false },
      { ground: 4 + 4 + 4 + 20, doubles: 3 },
    );
  });
});

describe("doubles (I p. 25)", () => {
  const CHOW_HAND = "b2 b3 b4 b6 b6 b6 b5 b5";

  it("(a) one double for each pung or kong of Dragons", () => {
    check(
      { concealed: CHOW_HAND, melds: [exposed("pung", "dR dR dR"), exposed("pung", "dG dG dG")] },
      { ground: 4 + 4 + 4 + 20, doubles: 2 + 1 }, // two dragons, (f)
    );
  });

  it("(b) own Wind and (c) Wind of the Round, one double each", () => {
    check(
      { concealed: CHOW_HAND, melds: [exposed("pung", "wS wS wS"), exposed("pung", "wE wE wE")] },
      { ground: 4 + 4 + 4 + 20, doubles: 1 + 1 + 1 },
    );
    // Another player's Wind scores the ground but no double.
    check(
      { concealed: CHOW_HAND, melds: [exposed("pung", "wW wW wW"), exposed("pung", "wN wN wN")] },
      { ground: 4 + 4 + 4 + 20, doubles: 1 },
    );
    // Seat East in an East round: the one Wind is both, two doubles.
    check(
      { concealed: CHOW_HAND, melds: [exposed("pung", "wE wE wE"), exposed("pung", "dR dR dR")] },
      { ground: 4 + 4 + 4 + 20, doubles: 1 + 1 + 1 + 1 },
      {},
      { seatWind: "E", prevailingWind: "E" },
    );
  });

  it("(g) no Chows is one double", () => {
    check(
      { concealed: "b6 b6 b6 b8 b8 b8 b4 b4 b4 b5 b5", melds: [exposed("pung", "b2 b2 b2")] },
      { ground: 2 + 4 + 4 + 4 + 20, doubles: 3 + 1 },
    );
  });

  it("(h) a loose tile, the last tile of the wall or robbing the kong is one double, not one each", () => {
    const base = { concealed: REST, melds: [exposed("pung", "b7 b7 b7")] };
    check(base, { ground: 30, doubles: 3 + 1 }, { wonOnLooseTile: true });
    check(base, { ground: 30, doubles: 3 + 1 }, { wonOnLastWallTile: true });
    check(base, { ground: 30, doubles: 3 + 1 }, { robbedKong: true });
    check(base, { ground: 30, doubles: 3 + 1 }, { wonOnLooseTile: true, wonOnLastWallTile: true });
  });

  it("a concealed Mah Jong, every tile from the wall, is two doubles", () => {
    check(
      { concealed: `${REST} b7 b7 b7`, winningTile: "b7", selfDrawn: true },
      { ground: 4 + 4 + 4 + 20 + 2, doubles: 3 + 2 },
    );
    // An exposed meld, or a win on a discard, is not concealed.
    check(
      { concealed: REST, melds: [exposed("pung", "b7 b7 b7")], winningTile: "b7", selfDrawn: true },
      { ground: 2 + 4 + 4 + 20 + 2, doubles: 3 },
    );
  });

  it("a concealed kong keeps the hand concealed", () => {
    check(
      { concealed: REST, melds: [hidden("kong", "b7 b7 b7 b7")], winningTile: "b5", selfDrawn: true },
      { ground: 16 + 4 + 4 + 20 + 2 + 2, doubles: 3 + 2 },
    );
  });

  it("(f) one suit with Winds or Dragons is one double; (j) one suit and no honours is three", () => {
    check({ concealed: `${REST} wW wW wW` }, { ground: 8 + 4 + 4 + 20, doubles: 1 });
    check({ concealed: `${REST} b7 b7 b7` }, { ground: 12 + 20, doubles: 3 });
  });

  it("(j) own Season, own Flower and no Chows add one double each, once", () => {
    const pungs = { concealed: "b6 b6 b6 b8 b8 b8 b4 b4 b4 b5 b5", melds: [exposed("pung", "b2 b2 b2")] };
    // Purity 3 + no chows 1.
    check(pungs, { ground: 2 + 12 + 20, doubles: 4 });
    check({ ...pungs, flowers: "f2", seasons: "s2" }, { ground: 2 + 12 + 20 + 8, doubles: 4 + 2 });
  });

  it("a Bouquet of Seasons or of Flowers is three doubles and includes the own tile's double", () => {
    const base = { concealed: REST, melds: [exposed("pung", "b7 b7 b7")] };
    check({ ...base, seasons: "s1 s2 s3 s4" }, { ground: 10 + 20 + 16, doubles: 3 + 3 });
    check({ ...base, flowers: "f1 f2 f3 f4" }, { ground: 10 + 20 + 16, doubles: 3 + 3 });
    check({ ...base, seasons: "s1 s2 s3 s4", flowers: "f1 f2 f3 f4" }, { ground: 10 + 20 + 32, doubles: 3 + 6 });
  });
});

describe("(k) honour tiles only (I p. 25)", () => {
  // 1s, 9s, Winds and Dragons. Three doubles, which "includes one double for
  // all Pungs", so the no-chows double is not added again.
  it("three doubles, plus a, b, c, d, e once each, plus the cleared suit", () => {
    // Characters 1s and 9s, East pung, Red pung, pair of own Wind South.
    // Ground: 8 + 8 + 8 + 8 concealed + 2 (own Wind pair) + 20.
    // Doubles: Dragon 1 + round Wind 1 + cleared suit 1 + three = 6.
    check(
      { concealed: "c1 c1 c1 c9 c9 c9 wE wE wE dR dR dR wS wS" },
      { ground: 32 + 2 + 20, doubles: 6 },
    );
  });

  it("no cleared-suit double when the terminals are in different suits", () => {
    check(
      { concealed: "c1 c1 c1 b9 b9 b9 wE wE wE dR dR dR o1 o1" },
      { ground: 32 + 20, doubles: 1 + 1 + 3 },
    );
  });

  it("own Season and own Flower add one double each to an honour hand", () => {
    check(
      {
        concealed: "c1 c1 c1 b9 b9 b9 wW wW wW dR dR dR o1 o1",
        flowers: "f2",
        seasons: "s2",
      },
      { ground: 32 + 20 + 8, doubles: 1 + 1 + 1 + 3 }, // Dragon, own Season, own Flower, three
    );
  });
});

describe("the limit and the readings", () => {
  it("caps ground × 2^doubles at the agreed limit", () => {
    const hand = createHand({
      concealed: "b6 b6 b6 b8 b8 b8 b4 b4 b4 b5 b5",
      melds: [exposed("pung", "b2 b2 b2")],
      seatWind: "S",
      prevailingWind: "E",
    });
    // ground 2 + 12 + 20 = 34, four doubles: 544.
    assert.equal(scoreHand(hand, { limit: 1000 }).points, 544);
    assert.equal(scoreHand(hand, { limit: 500 }).points, 500);
    assert.equal(scoreHand(hand, { limit: 300 }).points, 300);
    assert.equal(scoreHand(hand, { limit: 300 }).raw, 544);
  });

  it("reads 111 222 333 as the sets that pay best and are allowed", () => {
    // 2 2 2 3 3 3 4 4 4 can be three pungs or three chows; with two more sets
    // only the pungs make an ordinary hand (one chow at most). Pungs of 2, 3
    // and 4 are 4 each concealed.
    check(
      { concealed: "b2 b2 b2 b3 b3 b3 b4 b4 b4 b6 b7 b8 b9 b9" },
      // Pungs 2, 3, 4 (12), chow 678, pair 99. Purity 3.
      { ground: 12 + 20, doubles: 3 },
    );
  });
});
