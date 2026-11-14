/**
 * What the turn engine hands to the score sheet: how the winning tile was
 * won, whether a kong was robbed, whether East's first discard was claimed,
 * and what is paid for it. Figures are worked out by hand from I pp. 24-26.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ledgerTotals } from "../../src/core/game/index.ts";
import { createHand } from "../../src/core/hand.ts";
import { scoreHand } from "../../src/core/score.ts";
import { fixture, play } from "../helpers/game-fixture.ts";

const FILLER = {
  W: "c1 c1 c1 c2 c2 c2 c3 c3 c3 c4 c4 c4 c5",
  N: "o1 o1 o1 o2 o2 o2 o3 o3 o3 o4 o4 o4 o5",
};
const paid = (state: ReturnType<typeof fixture>) =>
  state.ledger.map((entry) => [entry.from, entry.to, entry.points]);

describe("robbing the kong (I p. 25 (h)(iii))", () => {
  it("scores the robbed kong as a double", () => {
    const state = fixture({
      hands: {
        E: "b1 b5 b5 b5 b6 b7 b8 c1 c2 c3 c4",
        S: "b1 b1 b2 b3 b4 b5 b5 b5 b7 b7 b7 b9 b9",
        ...FILLER,
      },
      melds: { E: [{ kind: "pung", tiles: ["b1", "b1", "b1"], exposed: true }] },
      wall: ["o1", "o2", "o3", "o9"],
      phase: "discard",
      turn: "E",
      lastDraw: { seat: "E", tile: "b1", end: "front" },
    });
    const opened = play(state, { type: "AddedKong", seat: "E", tile: "b1" });
    const won = play(opened.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b1"] }).state;
    // Pung of 1s taken off the kong is exposed 4, pung of 5s 4, pung of 7s 4,
    // pair of 9s nothing, chow nothing, 20 for Mah Jong: ground 32.
    // One suit, no honours: three doubles; robbing the kong: one more.
    assert.equal(won.result?.ground, 32);
    assert.equal(won.result?.doubles, 4);
    assert.equal(won.result?.raw, 512);
    assert.equal(won.result?.points, 512);
    // East, the dealer, pays double: 1024 to the nearest 100.
    assert.deepEqual(paid(won), [
      ["E", "S", 1000],
      ["W", "S", 500],
      ["N", "S", 500],
    ]);
  });
});

describe("claiming East's first discard (I p. 24 (d))", () => {
  const SOUTH = "b1 b2 b3 b6 b6 b6 b7 b7 b7 b9 b9 b9 b5";
  const EAST = "c1 c3 c4 c6 c8 o2 o4 o6 o8 wE wN dR b5 dG";

  it("adds two to the ground score of the player who goes out on it", () => {
    const state = fixture({
      hands: { E: EAST, S: SOUTH, ...FILLER },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const won = play(discarded.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b5"] }).state;
    assert.equal(won.firstDiscardClaimedBy, "S");
    // Pungs of 6 and 7 concealed 4 + 4, pung of 9s concealed 8, the pair
    // finished by the winning tile 2, first discard 2, Mah Jong 20: ground
    // 40. Purity three doubles: 320.
    assert.equal(won.result?.ground, 40);
    assert.equal(won.result?.doubles, 3);
    assert.equal(won.result?.points, 320);
    assert.deepEqual(paid(won), [
      ["E", "S", 600],
      ["W", "S", 300],
      ["N", "S", 300],
    ]);
  });

  it("is not owed for a later discard", () => {
    const state = fixture({
      hands: { E: EAST, S: SOUTH, ...FILLER },
      discards: { N: ["o9"] },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "b5" });
    const won = play(discarded.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b5"] }).state;
    assert.equal(won.firstDiscardClaimedBy, undefined);
    assert.equal(won.result?.ground, 38);
    assert.equal(won.result?.points, 304);
  });

  it("is not owed when nobody claims it", () => {
    const state = fixture({
      hands: { E: EAST, S: SOUTH, ...FILLER },
      wall: ["o6", "o7", "o8"],
      phase: "discard",
      turn: "E",
    });
    const discarded = play(state, { type: "Discard", seat: "E", tile: "dR" });
    assert.equal(discarded.state.firstDiscardClaimedBy, undefined);
  });
});

describe("a pung finished by a discard is exposed (I p. 24)", () => {
  it("pays the exposed figure when a discard completes the pung, and the concealed one when drawn", () => {
    const hands = {
      E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW b7 o9",
      S: "b2 b3 b4 b6 b6 b6 b7 b7 b8 b8 b8 b5 b5",
      ...FILLER,
    };
    const discarded = play(
      fixture({ hands, discards: { N: ["o9"] }, wall: ["o6", "o7", "o8"], phase: "discard", turn: "E" }),
      { type: "Discard", seat: "E", tile: "b7" },
    );
    const won = play(discarded.state, { type: "Claim", seat: "S", kind: "mahjong", tiles: ["b7"] }).state;
    // The 7s were finished off a discard: exposed 2. The 6s and 8s are 4
    // each. Pair 55 and chow nothing. Mah Jong 20: ground 30. Purity: 240.
    assert.equal(won.result?.ground, 30);
    assert.equal(won.result?.doubles, 3);
    assert.equal(won.result?.points, 240);
    // 240 to the nearest 100 is 200; East pays 480, which is 500.
    assert.deepEqual(paid(won), [
      ["E", "S", 500],
      ["W", "S", 200],
      ["N", "S", 200],
    ]);

    // The same fourteen tiles with the third 7 drawn from the wall: the pung
    // is concealed 4, plus 2 for drawing it, and a concealed Mah Jong (two
    // doubles): ground 34 × 2^5 = 1088, the limit.
    const drawn = play(
      fixture({
        hands: { E: "b2 b3 b4 b6 b6 b6 b7 b7 b7 b8 b8 b8 b5 b5", ...FILLER },
        wall: ["o6", "o7", "o8"],
        phase: "discard",
        turn: "E",
        lastDraw: { seat: "E", tile: "b7", end: "front" },
      }),
      { type: "Win", seat: "E", kind: "self-drawn" },
    ).state;
    assert.equal(drawn.result?.ground, 34);
    assert.equal(drawn.result?.doubles, 5);
    assert.equal(drawn.result?.raw, 1088);
    assert.equal(drawn.result?.points, 1000);
    const { totals } = ledgerTotals(drawn);
    assert.equal(totals.E, 6000);
  });
});

describe("the hand the player would claim", () => {
  it("pays an ordinary hand that scores more than a half-limit hand the same tiles make", () => {
    // Three consecutive pungs read as chows too, so these tiles are also
    // Chow Chow (half limit, 500). As an ordinary concealed Mah Jong they
    // score 1088 and the limit: the player takes that.
    const hand = createHand({
      concealed: "b2 b3 b4 b6 b6 b6 b7 b7 b7 b8 b8 b8 b5 b5",
      winningTile: "b7",
      selfDrawn: true,
      seatWind: "S",
    });
    const result = scoreHand(hand);
    assert.ok(result.matches.some((match) => match.pattern.id === "chow-chow"));
    assert.equal(result.winning?.pattern.id, "ordinary-mahjong");
    assert.equal(result.points, 1000);
  });

  it("is not paid as a non-scoring hand when a reading has a pung", () => {
    // 6 6 6 7 7 7 8 8 8 can be three pungs or three chows. Read as pungs the
    // hand scores; it is not the 10-point consolation for a hand of chows.
    const hand = createHand({
      concealed: "b2 b3 b4 b6 b6 b6 b7 b7 b7 b8 b8 b8 b5 b5",
      selfDrawn: true,
    });
    assert.notEqual(scoreHand(hand, { excluded: ["chow-chow"] }).points, 10);
    assert.equal(scoreHand(hand, { excluded: ["chow-chow"] }).tier, "calculate");
    assert.ok((scoreHand(hand, { excluded: ["chow-chow"] }).ground ?? 0) > 0);
  });

  it("still pays 10 for four chows and a worthless pair that read no other way", () => {
    const hand = createHand({
      concealed: "b2 b3 b4 b3 b4 b5 b6 b7 b8 b6 b7 b8 b9 b9",
      selfDrawn: true,
    });
    assert.equal(scoreHand(hand, { excluded: ["chow-chow"] }).points, 10);
  });
});

describe("a suited pair with honour sets is a hand (I p. 34)", () => {
  it("scores four honour sets and a pair of 2 Bamboos", () => {
    // One suit with Winds and Dragons: the suit may be held in the pair.
    // Pungs of Dragons and Winds concealed 8 each: 32, the pair nothing,
    // Mah Jong 20: ground 52. Doubles: two Dragon pungs 2, own Wind (South)
    // 1, one suit with honours 1, no chows 1: 5. 52 × 32 = 1664, the limit.
    const hand = createHand({
      concealed: "dW dW dW wN wN wN dR dR dR wS wS wS b2 b2",
      seatWind: "S",
      prevailingWind: "E",
    });
    const result = scoreHand(hand);
    assert.equal(result.tier, "calculate");
    assert.equal(result.ground, 52);
    assert.equal(result.doubles, 5);
    assert.equal(result.raw, 1664);
    assert.equal(result.points, 1000);
  });

  it("still needs a suited tile somewhere: honour sets and an honour pair are another hand", () => {
    const hand = createHand({ concealed: "dW dW dW wN wN wN dR dR dR wS wS wS wW wW" });
    assert.notEqual(scoreHand(hand).winning?.pattern.id, "ordinary-mahjong");
  });
});
