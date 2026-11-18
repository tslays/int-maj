/**
 * The hand sheet's words for which version of a hand its tiles are for, and
 * for a nearer version the player cannot play (#209, #211).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { nearerNote, versionNote, listWords } = await import("../../app/src/nearer.js");

const name = (key: string): string => ({ c2: "2 character", o6: "6 circle", o1: "1 circle" })[key] ?? key;

describe("the nearer-version note", () => {
  it("says a nearer version is barred in a Goulash, and why (#209, C p. 55)", () => {
    const words = nearerNote(
      {
        nearer: {
          away: 1,
          need: ["c2"],
          dead: [],
          barred: "half",
          scoringWhen: "when the three runs do not all use the same numbers",
        },
      },
      name,
    );
    assert.match(words, /lacks only the 2 character: the half-limit version, when the three runs do not all use the same numbers/);
    assert.match(words, /Half-limit hands are barred in this Goulash \(Companion p\. 55\)/);
    assert.match(words, /neither a win nor a fishing hand/);
  });

  it("says a nearer version is out of tiles when every copy is in sight (#211)", () => {
    const words = nearerNote({ nearer: { away: 1, need: ["o6"], dead: ["o6"], barred: null, scoringWhen: null } }, name);
    assert.match(words, /lacks only the 6 circle, but every copy of the 6 circle is already in sight/);
    assert.match(words, /can no longer be built/);
  });

  it("names a tile needed twice once", () => {
    const words = nearerNote({ nearer: { away: 2, need: ["o1", "o1"], dead: ["o1"], barred: null, scoringWhen: null } }, name);
    assert.match(words, /lacks only the 1 circle twice,/);
  });

  it("says nothing when the hand shown is the nearest", () => {
    assert.equal(nearerNote({ nearer: null }, name), null);
    assert.equal(nearerNote(null, name), null);
  });
});

describe("the version note", () => {
  it("names the scoring of a hand with more than one", () => {
    assert.equal(
      versionNote({ tier: "limit", scoringWhen: "when the three runs use the same numbers" }),
      "For the limit scoring: when the three runs use the same numbers.",
    );
  });

  it("is absent for a hand with one scoring", () => {
    assert.equal(versionNote({ tier: "half", scoringWhen: null }), null);
    assert.equal(versionNote(null), null);
  });

  it("joins words as a sentence does", () => {
    assert.equal(listWords(["a"]), "a");
    assert.equal(listWords(["a", "b", "c"]), "a, b and c");
  });
});
