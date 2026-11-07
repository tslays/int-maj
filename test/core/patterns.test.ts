import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, meld } from "../../src/core/hand.ts";
import { matchHand } from "../../src/core/match.ts";
import { PATTERNS } from "../../src/core/patterns/table.ts";

function ids(...handArgs: Parameters<typeof createHand>): string[] {
  return matchHand(createHand(...handArgs)).map((match) => match.pattern.id);
}

function contains(actual: string[], expected: string): boolean {
  return actual.includes(expected);
}

describe("pattern table schema", () => {
  it("has unique ids and at least one printed page reference each", () => {
    assert.equal(
      new Set(PATTERNS.map((pattern) => pattern.id)).size,
      PATTERNS.length,
    );
    for (const pattern of PATTERNS) assert.ok(pattern.pages.length > 0);
  });

  it("records a reading for every provisional pattern", () => {
    for (const pattern of PATTERNS) {
      if (!pattern.provisional) continue;
      assert.ok(
        pattern.notes && pattern.notes.length > 0,
        `${pattern.id} is provisional but has no notes`,
      );
    }
  });

  it("only uses variantOf to point at an existing canonical id", () => {
    const ids = new Set(PATTERNS.map((pattern) => pattern.id));
    for (const pattern of PATTERNS) {
      if (!pattern.variantOf) continue;
      assert.ok(
        ids.has(pattern.variantOf),
        `${pattern.id} points at missing variant ${pattern.variantOf}`,
      );
      assert.notEqual(pattern.variantOf, pattern.id);
    }
  });

  it("encodes concealed-only as exposedTier null", () => {
    const chowChow = PATTERNS.find((pattern) => pattern.id === "chow-chow");
    assert.ok(chowChow);
    assert.equal(chowChow!.exposedTier, null);
    assert.equal(chowChow!.requiresSelfDrawn, true);
  });

  it("encodes a lower exposed tier where the book allows exposure", () => {
    const tail = PATTERNS.find((pattern) => pattern.id === "dragons-tail");
    assert.ok(tail);
    assert.equal(tail!.tier, "limit");
    assert.equal(tail!.exposedTier, "half");
  });
});

describe("Ordinary Mah Jong", () => {
  it("accepts four pungs plus a pair in one suit with honours", () => {
    const idsFound = ids({
      concealed: "b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1 b1",
    });
    assert.ok(contains(idsFound, "ordinary-mahjong"));
  });

  it("accepts one chow and three pungs", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b4 b4 b6 b6 b6 wS wS wS b9 b9",
    });
    assert.ok(contains(idsFound, "ordinary-mahjong"));
  });

  it("accepts a kong, leaving 15 tiles", () => {
    const idsFound = ids({
      concealed: "b2 b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1 b1",
    });
    assert.ok(contains(idsFound, "ordinary-mahjong"));
  });

  it("rejects two chows", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b7 b7 wE wE wE b9 b9",
    });
    assert.equal(contains(idsFound, "ordinary-mahjong"), false);
  });

  it("rejects two suits", () => {
    const idsFound = ids({
      concealed: "b2 b2 b2 c5 c5 c5 b7 b8 b9 wE wE wE b1 b1",
    });
    assert.equal(contains(idsFound, "ordinary-mahjong"), false);
  });

  it("rejects an all-honour hand", () => {
    const idsFound = ids({
      concealed: "wE wE wE wS wS wS wW wW wW dR dR dR dG dG",
    });
    assert.equal(contains(idsFound, "ordinary-mahjong"), false);
  });
});

describe("Wriggly Snake", () => {
  it("accepts 1-9, ESWN and a duplicated run tile", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
    });
    assert.ok(contains(idsFound, "wriggly-snake"));
  });

  it("accepts a duplicated wind instead of a run tile", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wS wW wN",
    });
    assert.ok(contains(idsFound, "wriggly-snake"));
  });

  it("rejects a missing wind", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wW b5",
    });
    assert.equal(contains(idsFound, "wriggly-snake"), false);
  });

  it("rejects a run split across suits", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 c1 wE wS wW wN",
    });
    assert.equal(contains(idsFound, "wriggly-snake"), false);
  });

  it("is concealed-only: an exposed meld disqualifies it", () => {
    const hand = createHand({
      concealed: "b4 b5 b6 b7 b8 b9 wE wS wW wN b5",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    assert.equal(
      matchHand(hand).some((entry) => entry.pattern.id === "wriggly-snake"),
      false,
    );
  });
});

describe("All Pair", () => {
  it("accepts seven pairs in one suit with honours", () => {
    const idsFound = ids({
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 wE wE dG dG",
    });
    assert.ok(contains(idsFound, "all-pair"));
  });

  it("counts a kong as two pairs", () => {
    const idsFound = ids({
      concealed: "b1 b1 b1 b1 b2 b2 b3 b3 b4 b4 wE wE wS wS",
    });
    assert.ok(contains(idsFound, "all-pair"));
  });

  it("rejects pairs split across two suits", () => {
    const idsFound = ids({
      concealed: "b1 b1 b2 b2 c1 c1 c2 c2 wE wE wS wS dG dG",
    });
    assert.equal(contains(idsFound, "all-pair"), false);
  });

  it("rejects six pairs plus two singles", () => {
    const idsFound = ids({
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 b7 b8",
    });
    assert.equal(contains(idsFound, "all-pair"), false);
  });
});

describe("Three Great Scholars", () => {
  it("accepts three dragon pungs, one numeric set and a pair", () => {
    const idsFound = ids({
      concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
    });
    assert.ok(contains(idsFound, "three-great-scholars"));
  });

  it("accepts a dragon kong, leaving 15 tiles", () => {
    const idsFound = ids({
      concealed: "dG dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5",
    });
    assert.ok(contains(idsFound, "three-great-scholars"));
  });

  it("rejects two dragons only", () => {
    const idsFound = ids({
      concealed: "dG dG dG dR dR dR dW dW b2 b2 b2 b5 b5 b5",
    });
    assert.equal(contains(idsFound, "three-great-scholars"), false);
  });

  it("accepts the printed wind-pair variant", () => {
    const idsFound = ids({
      concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 wE wE",
    });
    assert.ok(contains(idsFound, "three-great-scholars"));
  });

  it("rejects a numeric set split across suits", () => {
    const idsFound = ids({
      concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 c5 c5",
    });
    assert.equal(contains(idsFound, "three-great-scholars"), false);
  });
});

describe("Up You Go concealed kong", () => {
  it("accepts an exposed non-kong meld", () => {
    const hand = createHand({
      concealed: "wE wS wW wN b2 b4 b4 b8 b8 b8 b8",
      melds: [meld({ kind: "pung", tiles: "b6 b6 b6", exposed: true })],
      selfDrawn: true,
    });
    const match = matchHand(hand).find(
      (entry) => entry.pattern.id === "up-you-go",
    );
    assert.ok(match);
    assert.equal(match!.tier, "double");
  });

  it("rejects an exposed kong of the required tile", () => {
    const hand = createHand({
      concealed: "wE wS wW wN b2 b4 b4 b6 b6 b6",
      melds: [meld({ kind: "kong", tiles: "b8 b8 b8 b8", exposed: true })],
      selfDrawn: true,
    });
    assert.equal(
      matchHand(hand).some((entry) => entry.pattern.id === "up-you-go"),
      false,
    );
  });

  it("accepts a concealed kong meld", () => {
    const hand = createHand({
      concealed: "wE wS wW wN b2 b4 b4 b6 b6 b6",
      melds: [meld({ kind: "kong", tiles: "b8 b8 b8 b8", exposed: false })],
      selfDrawn: true,
    });
    assert.ok(
      matchHand(hand).some((entry) => entry.pattern.id === "up-you-go"),
    );
  });
});

describe("Chow Chow", () => {
  const tiles = "b1 b2 b3 b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5";

  it("accepts four chows and a pair in one suit, fully self-drawn", () => {
    const idsFound = ids({ concealed: tiles, selfDrawn: true });
    assert.ok(contains(idsFound, "chow-chow"));
  });

  it("rejects a hand that was not self-drawn", () => {
    const idsFound = ids({ concealed: tiles, selfDrawn: false });
    assert.equal(contains(idsFound, "chow-chow"), false);
  });

  it("rejects an exposed meld", () => {
    const idsFound = ids({
      concealed: "b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5",
      melds: [meld({ kind: "chow", tiles: "b1 b2 b3", exposed: true })],
      selfDrawn: true,
    });
    assert.equal(contains(idsFound, "chow-chow"), false);
  });

  it("rejects chows in two suits", () => {
    const idsFound = ids({
      concealed: "b1 b2 b3 b2 b3 b4 b4 b5 b6 c7 c8 c9 b5 b5",
      selfDrawn: true,
    });
    assert.equal(contains(idsFound, "chow-chow"), false);
  });
});
