import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arrangeConcealed } from "../../src/core/arrange.ts";
import { createHand, isConcealed } from "../../src/core/hand.ts";
import { SAMPLES, type BookSample } from "../../src/core/patterns/samples.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { WINDS } from "../../src/core/tiles.ts";

const PLAY_KEYS = [
  ...["b", "c", "o"].flatMap((suit) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
];

/**
 * Hands where the book's picture is one of several equally right groupings of
 * the same tiles (a chow can start on either of two tiles), so the engine's
 * grouping need only be a valid one: every group a set or a pair.
 */
const ANY_VALID_GROUPING = new Set(["buried-treasure", "three-philosophers", "five-odd-honours"]);

/** Every way to put a real tile on each printed "any tile" card, as groups. */
function fillings(sample: BookSample): string[][][] {
  let hands: string[][][] = [sample.groups.map(() => [])];
  sample.groups.forEach((group, at) => {
    for (const tile of group) {
      const choices = typeof tile === "string" ? [tile] : PLAY_KEYS;
      hands = hands.flatMap((hand) =>
        choices.map((choice) => hand.map((entry, index) => (index === at ? [...entry, choice] : entry))),
      );
    }
  });
  return hands;
}

const asSets = (groups: readonly (readonly string[])[]): string => groups.map((group) => [...group].sort().join(" ")).sort().join(" | ");

function arrangementsOf(id: string, groups: string[][]): { won: boolean; shown: string[][][] } {
  const pattern = PATTERNS.find((entry) => entry.id === id)!;
  const tiles = groups.flat();
  const shown: string[][][] = [];
  for (const variant of ["western", "chinese"] as const) {
    for (const seatWind of WINDS) {
      let hand;
      try {
        hand = createHand({ concealed: tiles.join(" "), selfDrawn: true, seatWind, variant });
      } catch {
        return { won: false, shown }; // a fifth copy of a tile
      }
      const context = { shape: normalizeHand(hand), hand, isConcealed: isConcealed(hand), isSelfDrawn: true };
      if (!pattern.match(context)) continue;
      const arranged = arrangeConcealed(hand, pattern);
      if (arranged !== null) shown.push(arranged);
    }
  }
  return { won: shown.length > 0, shown };
}

describe("a winning hand's groups on the result card", () => {
  it("shows every hand the way its book picture groups it", () => {
    const failures: string[] = [];
    for (const pattern of PATTERNS) {
      if (pattern.id === "big-robert") continue; // its picture is the mixed-numbers version
      for (const sample of SAMPLES[pattern.id] ?? []) {
        let checked = 0;
        for (const groups of fillings(sample)) {
          const { shown } = arrangementsOf(pattern.id, groups);
          if (shown.length === 0) continue; // this filling is not a win, or has no groups
          checked++;
          const want = asSets(groups);
          if (ANY_VALID_GROUPING.has(pattern.id)) {
            assert.equal(shown[0]!.flat().length, 14);
            continue;
          }
          if (!shown.some((arranged) => asSets(arranged) === want)) {
            failures.push(`${pattern.id} ${sample.book} p. ${sample.page}: shown ${asSets(shown[0]!)}, printed ${want}`);
            break;
          }
        }
        if (checked === 0 && !ANY_VALID_GROUPING.has(pattern.id)) {
          failures.push(`${pattern.id} ${sample.book} p. ${sample.page}: no grouping at all`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});
