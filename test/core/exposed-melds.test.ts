/**
 * Exposed melds are fixed sets (R-060, R-061, R-063, R-065): a hand may not
 * borrow a tile from an exposed pung to complete its concealed part. The
 * engine once accepted such hands as Ordinary Mah Jong and then could not
 * score them.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld } from "../../src/core/hand.ts";
import { matchHand } from "../../src/core/match.ts";
import { scoreHand } from "../../src/core/score.ts";
import { isApplyError } from "../../src/core/game/draft.ts";
import { newGame } from "../../src/core/game/deal.ts";
import { apply } from "../../src/core/game/reduce.ts";
import { chooseAction } from "../../src/core/game/bot.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { SEATS } from "../../src/core/game/state.ts";

const pungs = () => [
  meld({ kind: "pung", tiles: "b9 b9 b9", exposed: true }),
  meld({ kind: "pung", tiles: "wE wE wE", exposed: true }),
  meld({ kind: "pung", tiles: "b6 b6 b6", exposed: true }),
];

describe("exposed melds stay as they were claimed", () => {
  it("does not regroup an exposed pung to finish the hand", () => {
    // b4b4b4 + b5b6b7 + b6b6 only works by breaking the exposed b6 pung.
    const hand = createHand({ concealed: "b4 b4 b4 b5 b7", melds: pungs(), winningTile: "b4" });
    assert.equal(matchHand(hand).some((match) => match.pattern.id === "ordinary-mahjong"), false);
    assert.equal(scoreHand(hand).winning, null);
  });

  it("still wins and scores the same melds with a complete concealed part", () => {
    const hand = createHand({ concealed: "b4 b4 b5 b6 b7", melds: pungs(), winningTile: "b4" });
    const score = scoreHand(hand);
    assert.equal(score.winning?.pattern.id, "ordinary-mahjong");
    assert.notEqual(score.points, null);
  });

  it("does not score Dragon's Run with a claimed chow (C p. 59: no red dot)", () => {
    const rest = "b4 b5 b6 b7 b8 b9 dR dG dW wE wE";
    const concealed = createHand({ concealed: `b1 b2 b3 ${rest}` });
    assert.equal(matchHand(concealed).some((match) => match.pattern.id === "dragons-run"), true);
    const claimed = createHand({
      concealed: rest,
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
    });
    assert.equal(matchHand(claimed).some((match) => match.pattern.id === "dragons-run"), false);
  });

  it("scores every win in the bot games that used to end unscored", () => {
    for (const seed of ["u-17", "u-63"]) {
      let { state } = newGame(seed);
      for (let guard = 0; guard < 3000 && state.phase !== "finished"; guard++) {
        let moved = false;
        for (const seat of SEATS) {
          const action = chooseAction(viewFor(state, seat), seat);
          if (action === null) continue;
          const result = apply(state, action);
          if (isApplyError(result)) continue;
          state = result.state;
          moved = true;
          break;
        }
        if (!moved) break;
      }
      if (state.result?.kind === "win") assert.notEqual(state.result.points, null, `${seed} win unscored`);
    }
  });
});
