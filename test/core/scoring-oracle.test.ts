/**
 * An independent check of the calculation. A seeded generator builds ordinary
 * hands whose sets, exposure and winning-tile role are known, and a second,
 * deliberately plain implementation of the score sheet (I pp. 24-25) scores
 * them from that known reading. The engine reads the hand itself, tries every
 * reading and keeps the best, so it must never score below the oracle, and
 * must agree with it exactly whenever the hand can only be read one way.
 *
 * The oracle shares no code with src/core/score.ts: it works on the
 * generator's sets, not on a decomposition of the tiles.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld, type HandInput } from "../../src/core/hand.ts";
import { decomposeStandard } from "../../src/core/decompose.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { scoreHand, type ScoreOptions } from "../../src/core/score.ts";

type Wind = "E" | "S" | "W" | "N";
const WINDS: readonly Wind[] = ["E", "S", "W", "N"];
const HONOURS = ["wE", "wS", "wW", "wN", "dR", "dG", "dW"] as const;

/** A small seeded generator (mulberry32): the same seed always builds the same hands. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Group {
  readonly kind: "chow" | "pung" | "kong";
  /** Pung/kong tile key; for a chow the first rank's key (suit letter + start rank). */
  readonly tile: string;
  readonly keys: readonly string[];
  /** Where the group sits when the hand is shown. */
  readonly state: "exposed" | "declared-concealed" | "in-hand";
}

interface Spec {
  readonly groups: readonly Group[];
  readonly pair: string;
  readonly flowers: readonly number[];
  readonly seasons: readonly number[];
  readonly seat: Wind;
  readonly round: Wind;
  readonly selfDrawn: boolean;
  /** The winning tile and the group (index into groups, or -1 for the pair) it completes. */
  readonly winning: { readonly key: string; readonly role: number | "pair" } | null;
  readonly options: ScoreOptions;
}

const isHonour = (key: string) => key[0] === "w" || key[0] === "d";
const isTerminal = (key: string) => !isHonour(key) && (key[1] === "1" || key[1] === "9");
const isHigh = (key: string) => isHonour(key) || isTerminal(key);

/** Builds a random legal ordinary hand: one suit (plus honours), at most one chow. */
function generate(next: () => number): Spec | null {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const suit = pick(["b", "c", "o"]);
  const honourMode = next() < 0.25; // sets of 1s, 9s and honours only, to reach (k)
  const pool: string[] = [];
  for (const honour of HONOURS) pool.push(honour);
  for (let rank = 1; rank <= 9; rank++) {
    if (honourMode && rank !== 1 && rank !== 9) continue;
    pool.push(`${suit}${rank}`);
  }
  const suitedPool = pool.filter((key) => !isHonour(key));
  const useCount = new Map<string, number>();
  const take = (key: string, n: number): boolean => {
    const total = (useCount.get(key) ?? 0) + n;
    if (total > 4) return false;
    useCount.set(key, total);
    return true;
  };

  const chowAllowed = !honourMode && next() < 0.5;
  let chowUsed = false;
  const groups: Group[] = [];
  for (let i = 0; i < 4; i++) {
    const roll = next();
    if (chowAllowed && !chowUsed && roll < 0.3) {
      const start = 1 + Math.floor(next() * 7);
      const keys = [start, start + 1, start + 2].map((rank) => `${suit}${rank}`);
      if (!keys.every((key) => take(key, 1))) return null;
      chowUsed = true;
      groups.push({ kind: "chow", tile: keys[0]!, keys, state: next() < 0.5 ? "exposed" : "in-hand" });
      continue;
    }
    const tile = pick(pool);
    if (roll < 0.75) {
      if (!take(tile, 3)) return null;
      groups.push({ kind: "pung", tile, keys: [tile, tile, tile], state: next() < 0.45 ? "exposed" : "in-hand" });
    } else {
      if (!take(tile, 4)) return null;
      groups.push({
        kind: "kong",
        tile,
        keys: [tile, tile, tile, tile],
        state: next() < 0.5 ? "exposed" : "declared-concealed",
      });
    }
  }
  const pair = pick(honourMode ? pool : [...pool, ...suitedPool]);
  if (!take(pair, 2)) return null;

  // At least one suited tile, so this is an ordinary suit hand and not an all-honour wind hand.
  const flowers = [1, 2, 3, 4].filter(() => next() < 0.3);
  const seasons = [1, 2, 3, 4].filter(() => next() < 0.3);
  if (next() < 0.05) flowers.splice(0, flowers.length, 1, 2, 3, 4);
  if (next() < 0.05) seasons.splice(0, seasons.length, 1, 2, 3, 4);
  const selfDrawn = next() < 0.5;

  // The winning tile completes one group that is held in the hand, or the pair.
  const inHand: (number | "pair")[] = ["pair"];
  groups.forEach((group, index) => {
    if (group.state === "in-hand") inHand.push(index);
  });
  let winning: Spec["winning"] = null;
  if (next() < 0.85) {
    const role = pick(inHand);
    const keys = role === "pair" ? [pair, pair] : groups[role]!.keys;
    winning = { key: pick(keys), role };
  }

  const options: ScoreOptions = {
    firstDiscardByEast: next() < 0.1,
    wonOnLooseTile: next() < 0.1,
    wonOnLastWallTile: next() < 0.05,
    robbedKong: next() < 0.05,
    withoutMahJongBonus: next() < 0.1,
  };
  return {
    groups,
    pair,
    flowers,
    seasons,
    seat: pick(WINDS),
    round: pick(WINDS),
    selfDrawn,
    winning,
    options,
  };
}

function toInput(spec: Spec): HandInput {
  const melds = spec.groups
    .filter((group) => group.state !== "in-hand")
    .map((group) =>
      meld({ kind: group.kind, tiles: group.keys.join(" "), exposed: group.state === "exposed" }),
    );
  const concealed = [
    ...spec.groups.filter((group) => group.state === "in-hand").flatMap((group) => group.keys),
    spec.pair,
    spec.pair,
  ];
  return {
    concealed: concealed.join(" "),
    melds,
    flowers: spec.flowers.map((n) => `f${n}`).join(" "),
    seasons: spec.seasons.map((n) => `s${n}`).join(" "),
    winningTile: spec.winning?.key ?? null,
    selfDrawn: spec.selfDrawn,
    seatWind: spec.seat,
    prevailingWind: spec.round,
  };
}

/** The score sheet, read straight off pp. 24-25 for one known reading. */
function oracle(spec: Spec): { ground: number; doubles: number } {
  const completedByDiscard = spec.winning !== null && !spec.selfDrawn;
  let ground = 4 * (spec.flowers.length + spec.seasons.length);

  spec.groups.forEach((group, index) => {
    if (group.kind === "chow") return;
    const high = isHigh(group.tile);
    const concealedSet =
      group.state === "declared-concealed" ||
      (group.state === "in-hand" && !(completedByDiscard && spec.winning!.role === index));
    const table = group.kind === "pung" ? { low: [2, 4], high: [4, 8] } : { low: [8, 16], high: [16, 32] };
    ground += (high ? table.high : table.low)[concealedSet ? 1 : 0]!;
  });

  if (spec.pair[0] === "d") ground += 2;
  if (spec.pair === `w${spec.seat}`) ground += 2;
  if (spec.pair === `w${spec.round}`) ground += 2;
  if (spec.options.firstDiscardByEast) ground += 2;
  if (spec.winning !== null && spec.winning.role !== "pair") {
    const group = spec.groups[spec.winning.role]!;
    if (group.kind === "chow") {
      const start = Number(group.keys[0]![1]);
      const rank = Number(spec.winning.key[1]);
      const middle = rank === start + 1;
      const farEnd = (start === 1 && rank === 3) || (start === 7 && rank === 7);
      if (middle || farEnd) ground += 2;
    }
  }
  if (spec.selfDrawn) ground += 2;
  if (spec.winning?.role === "pair") ground += 2;
  if (!spec.options.withoutMahJongBonus) ground += 20;

  const features: Record<string, number> = {};
  const add = (name: string, n: number) => {
    features[name] = (features[name] ?? 0) + n;
  };
  const pungsAndKongs = spec.groups.filter((group) => group.kind !== "chow");
  for (const group of pungsAndKongs) {
    if (group.tile[0] === "d") add("dragon pung", 1); // (a)
    if (group.tile === `w${spec.seat}`) add("own wind", 1); // (b)
    if (group.tile === `w${spec.round}`) add("round wind", 1); // (c)
  }
  const ownIndex = WINDS.indexOf(spec.seat) + 1;
  const bouquetSeasons = spec.seasons.length === 4;
  const bouquetFlowers = spec.flowers.length === 4;
  if (spec.seasons.includes(ownIndex) && !bouquetSeasons) add("own season", 1); // (d)
  if (spec.flowers.includes(ownIndex) && !bouquetFlowers) add("own flower", 1); // (e)

  const allKeys = [...spec.groups.flatMap((group) => group.keys), spec.pair, spec.pair];
  const hasHonour = allKeys.some(isHonour);
  const hasSuited = allKeys.some((key) => !isHonour(key));
  const allHigh = allKeys.every(isHigh);
  const noChows = spec.groups.every((group) => group.kind !== "chow");
  if (hasHonour && hasSuited) add("one suit with honours", 1); // (f) / (k)'s cleared suit
  if (noChows && !allHigh) add("no chows", 1); // (g); (k) already includes it
  if (spec.options.wonOnLooseTile || spec.options.wonOnLastWallTile || spec.options.robbedKong) {
    add("going mah jong", 1); // (h)
  }
  const concealedHand = spec.groups.every((group) => group.state !== "exposed");
  if (concealedHand && spec.selfDrawn) add("concealed mah jong", 2);
  if (hasSuited && !hasHonour) add("purity", 3); // (j)
  if (allHigh) add("honours only", 3); // (k)
  if (bouquetSeasons) add("bouquet of seasons", 3);
  if (bouquetFlowers) add("bouquet of flowers", 3);

  return { ground, doubles: Object.values(features).reduce((sum, n) => sum + n, 0) };
}

/** How many places in the spec the winning tile could sit, to tell a unique reading. */
function placesOfWinningTile(spec: Spec): number {
  if (spec.winning === null) return 0;
  const key = spec.winning.key;
  let places = spec.pair === key ? 1 : 0;
  for (const group of spec.groups) {
    if (group.keys.includes(key)) places += 1;
  }
  return places;
}

describe("the engine against an independent score sheet", () => {
  it("never scores below the sheet, and agrees exactly when the hand reads one way", () => {
    const next = rng(20261114);
    let accepted = 0;
    let exact = 0;
    const seen = { calculated: 0, special: 0, honours: 0, purity: 0, bouquet: 0, kong: 0 };
    for (let attempt = 0; attempt < 12000 && accepted < 3000; attempt++) {
      const spec = generate(next);
      if (spec === null) continue;
      const input = toInput(spec);
      const hand = createHand(input);
      const result = scoreHand(hand, { limit: 1000, ...spec.options });
      const expected = oracle(spec);
      const capped = Math.min(expected.ground * 2 ** expected.doubles, 1000);
      const label = JSON.stringify({ input: { ...input, melds: spec.groups.map((g) => `${g.kind}:${g.keys.join("")}:${g.state}`) }, options: spec.options });

      // Every generated hand is a legal ordinary hand, so it must score at least this.
      assert.ok(result.winning !== null, `unmatched ${label}`);
      accepted += 1;
      assert.ok(
        (result.points ?? -1) >= capped,
        `engine ${result.points} (${result.winning?.pattern.id}) below sheet ${capped} ${label}`,
      );
      if (result.tier === "calculate") seen.calculated += 1;
      else {
        seen.special += 1;
        continue; // a printed special hand scores its tier; nothing more to compare
      }

      const decompositions = decomposeStandard(
        normalizeHand(createHand({ concealed: hand.concealed })),
        { setCount: 4 - hand.melds.length, allowKongs: false },
      );
      const unique = decompositions.length === 1 && placesOfWinningTile(spec) <= 1;
      if (unique) {
        exact += 1;
        assert.equal(result.ground, expected.ground, `ground ${label}`);
        assert.equal(result.doubles, expected.doubles, `doubles ${label}`);
        assert.equal(result.raw, expected.ground * 2 ** expected.doubles, `raw ${label}`);
        assert.equal(result.points, capped, `points ${label}`);
      }
      if (spec.groups.every((g) => g.keys.every(isHigh)) && isHigh(spec.pair)) seen.honours += 1;
      if (spec.groups.some((g) => g.kind === "kong")) seen.kong += 1;
      if (spec.flowers.length === 4 || spec.seasons.length === 4) seen.bouquet += 1;
      if ((result.doubles ?? 0) >= 3 && !spec.groups.some((g) => isHonour(g.tile)) && !isHonour(spec.pair)) seen.purity += 1;
    }
    // The run has to have reached the interesting corners, not just easy hands.
    assert.ok(accepted >= 2000, `only ${accepted} hands generated`);
    assert.ok(exact >= 500, `only ${exact} hands compared exactly`);
    assert.ok(seen.calculated >= 500, "calculated hands");
    assert.ok(seen.honours >= 20, "all-honour hands");
    assert.ok(seen.kong >= 200, "hands with kongs");
    assert.ok(seen.bouquet >= 20, "bouquets");
    assert.ok(seen.purity >= 100, "purity hands");
  });
});

describe("scoring invariants", () => {
  const specs: Spec[] = [];
  const next = rng(77);
  while (specs.length < 400) {
    const spec = generate(next);
    if (spec !== null) specs.push(spec);
  }

  it("scores a hand the same however many times it is scored", () => {
    for (const spec of specs.slice(0, 100)) {
      const hand = createHand(toInput(spec));
      assert.deepEqual(scoreHand(hand, spec.options), scoreHand(hand, spec.options));
    }
  });

  it("never pays more than the limit, and a calculated hand pays the lower of its total and the limit", () => {
    for (const spec of specs) {
      const hand = createHand(toInput(spec));
      for (const limit of [300, 500, 1000]) {
        const result = scoreHand(hand, { ...spec.options, limit });
        if (result.winning === null) continue;
        if (result.tier === "calculate" && result.raw !== null) {
          assert.equal(result.points, Math.min(result.raw, limit));
        }
        assert.ok((result.points ?? 0) <= limit * 2, "no hand pays over a double limit");
      }
    }
  });

  it("raising the limit never lowers what a hand pays", () => {
    for (const spec of specs) {
      const hand = createHand(toInput(spec));
      const low = scoreHand(hand, { ...spec.options, limit: 500 });
      const high = scoreHand(hand, { ...spec.options, limit: 1000 });
      assert.ok((high.points ?? 0) >= (low.points ?? 0));
    }
  });

  it("each Flower or Season is exactly four ground points", () => {
    for (const spec of specs.slice(0, 200)) {
      if (spec.flowers.length + spec.seasons.length > 2) continue;
      const bare = scoreHand(createHand({ ...toInput(spec), flowers: "", seasons: "" }), spec.options);
      const full = scoreHand(createHand(toInput(spec)), spec.options);
      if (bare.tier !== "calculate" || full.tier !== "calculate") continue;
      // A Flower or Season may also be a double; the ground difference is the four points alone.
      assert.equal(full.ground! - bare.ground!, 4 * (spec.flowers.length + spec.seasons.length));
    }
  });

  it("going Mah Jong is exactly 20, and a fishing hand scores without it", () => {
    for (const spec of specs.slice(0, 200)) {
      const hand = createHand(toInput(spec));
      const win = scoreHand(hand, { ...spec.options, withoutMahJongBonus: false });
      const fish = scoreHand(hand, { ...spec.options, withoutMahJongBonus: true });
      if (win.tier !== "calculate" || fish.tier !== "calculate") continue;
      assert.equal(win.ground! - fish.ground!, 20);
      assert.equal(win.doubles, fish.doubles);
    }
  });

  it("a win drawn from the wall is worth more than the same win on a discard", () => {
    for (const spec of specs.slice(0, 200)) {
      if (spec.winning === null) continue;
      const drawn = scoreHand(createHand({ ...toInput(spec), selfDrawn: true }), spec.options);
      const discard = scoreHand(createHand({ ...toInput(spec), selfDrawn: false }), spec.options);
      if (drawn.tier !== "calculate" || discard.tier !== "calculate") continue;
      assert.ok((drawn.points ?? 0) >= (discard.points ?? 0));
    }
  });
});
