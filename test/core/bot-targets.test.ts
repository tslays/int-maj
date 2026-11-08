/**
 * The bots' special-hand targets are generated data (scripts/bot-targets.ts).
 * Every hand in the file must be a hand the engine accepts as the pattern it
 * is tagged with, so a bot can never chase a hand the table will refuse.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand } from "../../src/core/hand.ts";
import { matchHand } from "../../src/core/match.ts";
import { normalizeHand } from "../../src/core/shape.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";
import { SPECIAL_TARGETS } from "../../src/core/game/bot/targets.ts";

const BY_ID = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

function handOf(text: string, selfDrawn: boolean) {
  const tiles = text.match(/../g) ?? [];
  return createHand({ concealed: tiles.join(" "), selfDrawn });
}

describe("bot special-hand targets", () => {
  it("covers every fixed-tier pattern of fourteen tiles", () => {
    const covered = new Set(SPECIAL_TARGETS.map(([id]) => id));
    for (const pattern of PATTERNS) {
      if (pattern.tier === "calculate" || pattern.id === "all-kong") continue;
      assert.ok(covered.has(pattern.id), `no targets for ${pattern.id}`);
    }
  });

  it("holds only hands their pattern's predicate accepts", () => {
    for (const [id, hands] of SPECIAL_TARGETS) {
      const pattern = BY_ID.get(id);
      assert.ok(pattern !== undefined, `unknown pattern ${id}`);
      for (const text of hands.split(" ")) {
        assert.equal(text.length, 28, `${id}: ${text} is not fourteen tiles`);
        const hand = handOf(text, pattern.requiresSelfDrawn);
        const accepted = pattern.match({
          shape: normalizeHand(hand),
          hand,
          isConcealed: true,
          isSelfDrawn: pattern.requiresSelfDrawn,
        });
        assert.ok(accepted, `${id} rejects ${text}`);
      }
    }
  });

  it("agrees with the full matcher on the first hand of each pattern", () => {
    for (const [id, hands] of SPECIAL_TARGETS) {
      const pattern = BY_ID.get(id)!;
      const hand = handOf(hands.split(" ")[0]!, pattern.requiresSelfDrawn);
      assert.ok(
        matchHand(hand).some((match) => match.pattern.id === id),
        `${id} is not matched by matchHand`,
      );
    }
  });
});
