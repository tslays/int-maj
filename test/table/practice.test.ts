/**
 * Practice questions: every answer is graded by the engine, so these tests
 * check each question against `checkHand` itself, across many seeds and
 * every hand set.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkHand } from "../../src/core/check.ts";
import type { PatternMatch } from "../../src/core/match.ts";
import { HAND_SET_EXCLUDED, HAND_SETS, PATTERNS } from "../../src/core/patterns/table.ts";
import { parseTile, tileKey } from "../../src/core/tiles.ts";
import { createApiContext, routeApi } from "../../src/table/api.ts";
import { closestHands } from "../../src/core/game/closest.ts";
import { newGame } from "../../src/core/game/deal.ts";
import { viewFor } from "../../src/core/game/view.ts";
import { practicePool, practiceQuestion, swapSuits, type PracticeQuestion } from "../../src/table/practice.ts";
import { GameStore } from "../../src/table/session.ts";

const CARD_OF = new Map(PATTERNS.map((pattern) => [pattern.id, pattern.variantOf ?? pattern.id]));
const cards = (matches: readonly PatternMatch[]) => new Set(matches.map((match) => CARD_OF.get(match.pattern.id)));
const SEEDS = Array.from({ length: 40 }, (_, index) => `s${index}`);

/** The tiles that complete the thirteen, by the engine's wait report (a self-drawn-only win counts). */
function waitsOf(question: PracticeQuestion, excluded: readonly string[]): Set<string> {
  const result = checkHand(question.tiles, excluded);
  assert.equal(result.size, 13);
  return new Set(result.size === 13 ? result.waits.filter((wait) => wait.matches.length > 0).map((wait) => tileKey(wait.tile)) : []);
}

describe("practice questions", () => {
  it("the same seed gives the same question; another seed can differ", () => {
    assert.deepEqual(practiceQuestion("a", "name"), practiceQuestion("a", "name"));
    const shown = new Set(SEEDS.map((seed) => practiceQuestion(seed, "name").hand.id));
    assert.ok(shown.size > 10, `${shown.size} hands over ${SEEDS.length} seeds`);
  });

  it("every hand set has hands to ask, and only hands in play", () => {
    for (const set of HAND_SETS) {
      const excluded = HAND_SET_EXCLUDED[set];
      const pool = practicePool(excluded);
      assert.ok(pool.length >= 20, `${set}: ${pool.length} hands`);
      for (const entry of pool) assert.ok(!excluded.includes(entry.detail.pattern), `${set} asks ${entry.detail.pattern}`);
    }
  });

  it("name: the answer is a hand the tiles make, and no other choice is", () => {
    for (const set of HAND_SETS) {
      const excluded = HAND_SET_EXCLUDED[set];
      for (const seed of SEEDS) {
        const question = practiceQuestion(seed, "name", excluded);
        assert.equal(question.tiles.length, 14);
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map((option) => option.id)).size, 4, "four different choices");
        assert.deepEqual(question.correct, [question.hand.id]);
        const result = checkHand(question.tiles, excluded);
        assert.equal(result.size, 14);
        const made = cards(result.size === 14 ? result.matches : []);
        assert.ok(made.has(question.hand.id), `${seed}: the tiles make ${question.hand.id}`);
        for (const option of question.options) {
          if (option.id === question.hand.id) continue;
          assert.ok(!made.has(option.id), `${set}/${seed}: ${option.id} is a decoy the tiles also make`);
          assert.ok(!excluded.includes(option.id), `${set}/${seed}: ${option.id} is not in play`);
        }
      }
    }
  });

  it("wait: exactly one choice completes the thirteen, and it is in the list of wins", () => {
    for (const set of HAND_SETS) {
      const excluded = HAND_SET_EXCLUDED[set];
      for (const seed of SEEDS) {
        const question = practiceQuestion(seed, "wait", excluded);
        assert.equal(question.tiles.length, 13);
        assert.equal(question.options.length, 4);
        const waits = waitsOf(question, excluded);
        const winning = question.options.filter((option) => waits.has(option.id));
        assert.deepEqual(winning.map((option) => option.id), question.correct, `${set}/${seed}`);
        // The answer gives back the hand's own fourteen, which check as the hand.
        const whole = checkHand([...question.tiles, question.correct[0]!], excluded);
        assert.ok(whole.size === 14 && cards(whole.matches).has(question.hand.id), `${set}/${seed}: the answer makes the hand`);
        assert.deepEqual(new Set(question.wins.map((win) => win.tile)), waits, `${seed}: every win listed`);
        for (const option of question.options) {
          assert.equal(option.id, tileKey(parseTile(option.id)), "a tile key");
          assert.ok(question.tiles.filter((tile) => tile === option.id).length < 4, "a decoy you could still draw");
        }
      }
    }
  });

  it("suits are swapped only where the hand stays itself, and the grouping holds the same tiles", () => {
    let swapped = 0;
    for (const seed of SEEDS) {
      const question = practiceQuestion(seed, "name");
      const example = practicePool().find((entry) => entry.detail.pattern === question.hand.id)!.detail.example;
      const sorted = (tiles: readonly string[]) => [...tiles].sort().join(" ");
      if (sorted(question.tiles) !== sorted(example)) swapped += 1;
      if (question.groups !== null) assert.equal(sorted(question.groups.flat()), sorted(question.tiles), `${seed}: groups`);
    }
    assert.ok(swapped > 5, `${swapped} of ${SEEDS.length} questions swapped their suits`);
    assert.deepEqual(swapSuits(["b1", "c2", "o3", "wE", "dR"], "obc"), ["o1", "b2", "c3", "wE", "dR"]);
  });

  it("a missed hand comes back about half the time", () => {
    const pool = practicePool();
    const missed = pool[3]!.detail.pattern;
    const asked = SEEDS.filter((seed) => practiceQuestion(seed, "name", [], [missed]).hand.id === missed).length;
    assert.ok(asked >= SEEDS.length / 4, `${asked} of ${SEEDS.length}`);
    assert.ok(SEEDS.filter((seed) => practiceQuestion(seed, "name").hand.id === missed).length < asked);
  });

  it("aim: the answer is the hint panel's first hand; every other choice is rated at most half as likely", () => {
    for (const set of ["all", "rare"] as const) {
      const excluded = HAND_SET_EXCLUDED[set];
      for (const seed of SEEDS.slice(0, 6)) {
        const question = practiceQuestion(seed, "aim", excluded);
        assert.equal(question.tiles.length, 13);
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map((option) => option.id)).size, 4);
        assert.deepEqual(question.correct, [question.hand.id]);
        const top = question.aims.find((aim) => aim.id === question.hand.id)!;
        assert.ok(top.away !== null && top.chance >= 0.02);
        for (const aim of question.aims) {
          assert.ok(!excluded.includes(aim.id), `${set}/${seed}: ${aim.id} is not in play`);
          if (aim.id !== top.id) assert.ok(aim.chance <= top.chance / 2, `${set}/${seed}: ${aim.id} ${aim.chance} vs ${top.chance}`);
        }
        assert.deepEqual(practiceQuestion(seed, "aim", excluded), question, "the same seed, the same deal");
      }
    }
    // The ranking is the panel's own, for the same thirteen tiles.
    const question = practiceQuestion("s0", "aim");
    let found = false;
    for (let attempt = 0; attempt < 20 && !found; attempt += 1) {
      const { state } = newGame(`practice-aim/s0/${attempt}`);
      const seat = state.players.find((player) => player.seat !== state.dealer)!.seat;
      const view = viewFor(state, seat);
      if (view.player.hand.join() !== question.tiles.join()) continue;
      found = true;
      assert.equal(closestHands(view, 12)[0]!.pattern, question.hand.id);
    }
    assert.ok(found, "the deal behind the question");
  });

  it("the route answers a question and refuses a bad kind, set or seed", () => {
    const context = createApiContext(new GameStore({ defaultSeed: "practice" }));
    const get = (path: string) => {
      const url = new URL(path, "http://local.invalid");
      return routeApi(context, { method: "GET", path: url.pathname, query: url.searchParams, body: undefined })!;
    };
    const answer = get("/api/practice?seed=x&kind=wait&set=rare");
    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body, practiceQuestion("x", "wait", HAND_SET_EXCLUDED.rare));
    assert.equal(get("/api/practice?seed=x&kind=guess").status, 400);
    assert.equal(get("/api/practice?seed=x&set=none").status, 400);
    assert.equal(get("/api/practice?kind=name").status, 400);
  });
});
