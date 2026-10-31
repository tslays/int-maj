import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHand, type HandInput } from "../src/core/hand.ts";
import { matchHand } from "../src/core/match.ts";
import { PATTERNS } from "../src/core/patterns/table.ts";

interface Fixture {
  readonly positive: HandInput;
  readonly negative: HandInput;
}

/**
 * One hand-written positive and one near-miss negative per pattern. The
 * negative is a valid hand that fails the pattern for a stated reason, not a
 * copy of the positive with a random tile removed.
 */
export const FIXTURES: Readonly<Record<string, Fixture>> = {
  "ordinary-mahjong": {
    positive: { concealed: "b2 b2 b2 b5 b5 b5 b7 b8 b9 wE wE wE b1 b1" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b7 b7 wE wE wE b9 b9" },
  },
  "wriggly-snake": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN b5" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wW b5" },
  },
  "all-pair": {
    positive: { concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 wE wE dG dG" },
    negative: { concealed: "b1 b1 b2 b2 c1 c1 c2 c2 wE wE wS wS dG dG" },
  },
  "three-great-scholars": {
    positive: { concealed: "dG dG dG dR dR dR dW dW dW b2 b2 b2 b5 b5" },
    negative: { concealed: "dG dG dG dR dR dR dW dW b2 b2 b2 b5 b5 b5" },
  },
  "chow-chow": {
    positive: {
      concealed: "b1 b2 b3 b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5",
      selfDrawn: true,
    },
    negative: {
      concealed: "b1 b2 b3 b2 b3 b4 b4 b5 b6 b7 b8 b9 b5 b5",
      selfDrawn: false,
    },
  },
  "run-pung-pair": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b2 b2 b5 b5" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b2 b2 c5 c5" },
  },
  "gates-of-heaven": {
    positive: { concealed: "b1 b1 b1 b2 b3 b4 b5 b5 b6 b7 b8 b9 b9 b9" },
    negative: { concealed: "b1 b1 b1 b2 b3 b4 b5 b5 b6 b7 b8 c9 c9 c9" },
  },
  "confused-gates": {
    positive: { concealed: "b2 b3 b4 b5 b5 b6 b7 b8 c1 c1 c1 o9 o9 o9" },
    negative: { concealed: "b2 b3 b4 b5 b5 b6 b7 b8 b1 b1 b1 b9 b9 b9" },
  },
  "hachi-ban": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 wE wE wS wS wW wW" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 wE wE wS wS dR dR" },
  },
  "guardian-winds": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wE wS wS" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dG dG wS wS" },
  },
  "wriggly-dragon": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dG dG dR dW" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dG dR dW b5" },
  },
  "five-odd-honours": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW wN dR" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wS wW wN" },
  },
  "guardian-dragons": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dG dG dG dR dR" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wE dR dR" },
  },
  "grand-sequence": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wE c5 c5" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 b2 b2 b2 wE wE" },
  },
  "dragons-tail": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE wE dR dR" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wE dR dR b5" },
  },
  "dragons-gates": {
    positive: { concealed: "b1 b1 b1 b2 b3 b4 b5 b5 b6 b7 b8 dG dG dG" },
    negative: { concealed: "b1 b1 b1 b2 b3 b4 b5 b5 b6 b7 b8 dR dR dR" },
  },
  "dragons-teeth": {
    positive: { concealed: "c1 c2 c3 c4 c4 c5 c6 c7 dR dR dR dW dW dW" },
    negative: { concealed: "b1 b2 b3 b4 b4 b5 b6 b7 dR dR dR dW dW dW" },
  },
  "gretas-garden": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 wE wS wW wN dR dG dW" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 wE wS wW wN dR dG dG" },
  },
  "gretas-dragon": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 wE wS wW wN dG dG dG" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 wE wS wW wN dG dG dR" },
  },
  "red-lantern": {
    positive: {
      concealed: "b1 b2 b3 b4 b4 b5 b6 b7 wE wE wE dR dR dR",
    },
    negative: {
      concealed: "b1 b2 b3 b4 b4 b5 b6 b7 wS wS wS dR dR dR",
    },
  },
  "gerties-garter": {
    positive: { concealed: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 c4 c5 c6 c7" },
    negative: { concealed: "b1 b2 b3 b4 b5 b6 b7 c1 c2 c3 c4 c5 c6 dR" },
  },
  "yin-yang": {
    positive: {
      concealed: "b1 b1 b2 b3 b4 b5 b5 c5 c5 c6 c7 c8 c9 c9",
    },
    negative: {
      concealed: "b1 b1 b2 b3 b4 b5 b5 c5 c6 c7 c8 c9 c9 c9",
    },
  },
  "big-robert": {
    positive: {
      concealed: "b1 b2 b3 b4 c1 c2 c3 c4 o1 o2 o3 o4 wE wE",
    },
    negative: {
      concealed: "b1 b2 b3 b4 c2 c3 c4 c5 o1 o2 o3 o4 wE wE",
    },
  },
  "big-robert-mixed": {
    positive: {
      concealed: "b1 b2 b3 b4 c2 c3 c4 c5 o1 o2 o3 o4 wE wE",
    },
    negative: {
      concealed: "b1 b2 b3 b4 c1 c2 c3 c4 o1 o2 o3 o4 wE wE",
    },
  },
  "moon-at-bottom-of-well": {
    positive: {
      concealed: "o1 o2 o2 o3 o3 o4 o4 o5 o5 o5 o6 o7 o8 o9",
    },
    negative: {
      concealed: "o1 o2 o2 o3 o3 o4 o4 o5 o5 o5 o6 c7 o8 o9",
    },
  },
  "three-philosophers": {
    positive: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 b2 c3 o4 b5 b5",
    },
    negative: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 b2 c4 o4 b5 b5",
    },
  },
  "crazy-chows": {
    positive: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 b5 c6 o7 b8 c8",
    },
    negative: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 b5 c6 o7 b8 b8",
    },
  },
  "little-robert": {
    positive: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 dG dG dG wE wE",
    },
    negative: {
      concealed: "b1 b2 b3 b4 b5 b6 o7 o8 o9 dG dG dG wE wE",
    },
  },
  "windy-chow": {
    positive: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 wE wE wS wW wN",
    },
    negative: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 wE wE wS wW dR",
    },
  },
  "chop-suey": {
    positive: {
      concealed: "b1 b2 b3 c1 c2 c3 o1 o2 o3 wE wE wS wW wN",
    },
    negative: {
      concealed: "b1 b2 b3 c1 c2 c3 o4 o5 o6 wE wE wS wW wN",
    },
  },
  "chow-mein": {
    positive: {
      concealed: "b7 b8 b9 c7 c8 c9 o7 o8 o9 wE wE wS wW wN",
    },
    negative: {
      concealed: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wE wS wW wN",
    },
  },
  "hovering-angel": {
    positive: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 wE wE wE dG dG",
    },
    negative: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 wS wS wS dG dG",
    },
  },
  "little-brother": {
    positive: {
      concealed: "b1 b2 b3 c4 c5 c6 o7 o8 o9 b4 b5 b6 wE wE",
    },
    negative: {
      concealed: "b1 b2 b3 b4 b5 b6 c1 c2 c3 b7 b8 b9 wE wE",
    },
  },
  "apple-blossom": {
    positive: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 dW dW dW dG dG",
    },
    negative: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 dR dR dR dG dG",
    },
  },
  "professors": {
    positive: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 dR dG dW wE wE",
    },
    negative: {
      concealed: "b2 c3 o4 b3 c4 o5 b4 c5 o6 dR dG dW wS wS",
    },
  },
  "knitting": {
    positive: {
      concealed: "b1 c1 b2 c2 b3 c3 b4 c4 b5 c5 b6 c6 b7 c7",
    },
    negative: {
      concealed: "b1 c1 b2 c2 b3 c3 b4 c4 b5 c5 b6 c6 b7 b7",
    },
  },
  "triple-knitting": {
    positive: {
      concealed: "b1 c1 o1 b2 c2 o2 b3 c3 o3 b4 c4 o4 b7 c7",
    },
    negative: {
      concealed: "b1 c1 o1 b2 c2 o2 b3 c3 o3 b4 c4 o4 b7 b7",
    },
  },
  "all-pair-honours": {
    positive: {
      concealed: "b1 b1 b9 b9 c1 c1 dR dR wE wE wS wS dG dG",
    },
    negative: {
      concealed: "b1 b1 b2 b2 b9 b9 c1 c1 dR dR wE wE wS wS",
    },
  },
  "seven-twins": {
    positive: {
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 b7 b7",
      selfDrawn: true,
    },
    negative: {
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 b7 b7",
      selfDrawn: false,
    },
  },
  "dragons-breath": {
    positive: {
      concealed: "b2 b2 b3 b3 b4 b4 b6 b6 b8 b8 dR dG dG dW",
    },
    negative: {
      concealed: "b2 b2 b3 b3 b4 b4 b6 b6 b8 b8 dR dG dW b9",
    },
  },
  "windfall": {
    positive: {
      concealed: "b2 b2 b3 b3 b4 b4 b6 b6 b8 b8 wE wS wW wN",
    },
    negative: {
      concealed: "b2 b2 b3 b3 b4 b4 b6 b6 b8 b8 wE wS wW b9",
    },
  },
  "dragonette": {
    positive: {
      concealed: "c4 c4 c6 c6 c8 c8 wE wS wW wN dR dG dG dW",
    },
    negative: {
      concealed: "c4 c4 c6 c6 c8 c8 wE wE wS wW wN dR dG dW",
    },
  },
  "windy-ones": {
    positive: {
      concealed: "b1 b1 b1 c1 c1 c1 o1 o1 o1 wE wE wS wW wN",
    },
    negative: {
      concealed: "b1 b1 b1 c1 c1 c1 o2 o2 o2 wE wE wS wW wN",
    },
  },
  "windy-nines": {
    positive: {
      concealed: "b9 b9 b9 c9 c9 c9 o9 o9 o9 wE wE wS wW wN",
    },
    negative: {
      concealed: "b9 b9 b9 c9 c9 c9 o8 o8 o8 wE wE wS wW wN",
    },
  },
  "windvane": {
    positive: {
      concealed: "b2 b2 b2 c5 c5 c5 o7 o7 o7 wE wE wS wW wN",
    },
    negative: {
      concealed: "b2 b2 b2 c5 c5 c5 o7 o7 o9 wE wE wS wW wN",
    },
  },
  "civil-war": {
    positive: {
      concealed: "wN wN wN wS wS wS c1 c1 c6 c8 o1 o5 o6 o8",
    },
    negative: {
      concealed: "wN wN wN wS wS wS c1 c1 c6 c8 o1 o1 o6 o8",
    },
  },
  "four-blessings": {
    positive: {
      concealed: "wE wE wE wS wS wS wW wW wW wN wN wN dR dR",
    },
    negative: {
      concealed: "wE wE wE wS wS wS wW wW wW wN wN wN dR dG",
    },
  },
  "all-pair-jade": {
    positive: {
      concealed: "dG dG b2 b2 b3 b3 b4 b4 b6 b6 b8 b8 b8 b8",
    },
    negative: {
      concealed: "dG dG b2 b2 b3 b3 b4 b4 c6 c6 b8 b8 b8 b8",
    },
  },
  "all-pair-ruby-jade": {
    positive: {
      concealed: "dR dR dG dG b1 b1 b5 b5 b7 b7 b9 b9 b2 b2",
    },
    negative: {
      concealed: "dR dR dW dW b1 b1 b5 b5 b7 b7 b9 b9 b2 b2",
    },
  },
  "golden-gates": {
    positive: {
      concealed: "dG dG dG b1 b1 b1 b2 b2 b4 b4 b6 b6 b8 b8",
    },
    negative: {
      concealed: "dR dR dR b1 b1 b1 b2 b2 b4 b4 b6 b6 b8 b8",
    },
  },
  "red-waratah": {
    positive: {
      concealed: "dR dR dR dG dG b5 b5 b5 c3 c3 c3 o7 o7 o7",
    },
    negative: {
      concealed: "dR dR dR dG dG b2 b2 b2 c3 c3 c3 o7 o7 o7",
    },
  },
  "green-jade": {
    positive: {
      concealed: "dG dG dG b2 b2 b2 b4 b4 b4 b6 b6 b6 b8 b8",
    },
    negative: {
      concealed: "dG dG dG b2 b2 b2 b4 b4 b4 b6 b6 b6 c8 c8",
    },
  },
  "red-coral": {
    positive: {
      concealed: "dR dR dR c1 c1 c1 c4 c4 c4 c7 c7 c7 c9 c9",
    },
    negative: {
      concealed: "dR dR dR c1 c1 c1 c4 c4 c4 c7 c7 c7 o9 o9",
    },
  },
  "white-opal": {
    positive: {
      concealed: "dW dW dW o1 o1 o1 o3 o3 o3 o5 o5 o5 o7 o7",
    },
    negative: {
      concealed: "dW dW dW o1 o1 o1 o3 o3 o3 o5 o5 o5 c7 c7",
    },
  },
  "imperial-jade": {
    positive: {
      concealed: "dG dG dG b2 b2 b2 b3 b3 b3 b2 b3 b4 b6 b6",
    },
    negative: {
      concealed: "dG dG dG b1 b2 b3 b3 b3 b3 b4 b4 b4 b6 b6",
    },
  },
  "lily-of-the-valley": {
    positive: {
      concealed: "dG dG dG dW dW dW b2 b2 b2 b4 b4 b4 b6 b6",
    },
    negative: {
      concealed: "dG dG dG dW dW dW b2 b2 b2 b4 b4 b4 c6 c6",
    },
  },
  "lillypilly": {
    positive: {
      concealed: "dG dG dG dW dW o2 o2 o2 o4 o4 o4 o6 o6 o6",
    },
    negative: {
      concealed: "dG dG dG dW dR o2 o2 o2 o4 o4 o4 o6 o6 o6",
    },
  },
  "sunrise": {
    positive: {
      concealed: "wE wE wE b5 b5 b5 c2 c2 c2 o8 o8 o8 dW dW",
    },
    negative: {
      concealed: "wE wE wE b5 b5 b5 c2 c2 c2 o9 o9 o9 dW dW",
    },
  },
  "sunset": {
    positive: {
      concealed: "wW wW wW b5 b5 b5 c2 c2 c2 o8 o8 o8 dR dR",
    },
    negative: {
      concealed: "wW wW wW b5 b5 b5 c2 c2 c2 o8 o8 o8 dW dW",
    },
  },
  "unique-wonder": {
    positive: {
      concealed: "wE wE wS wW wN dR dG dW b1 b9 c1 c9 o1 o9",
    },
    negative: {
      concealed: "wE wE wE wS wW dR dG dW b1 b9 c1 c9 o1 o9",
    },
  },
  "all-honour-hand": {
    positive: {
      concealed: "b1 b1 b1 c9 c9 c9 wE wE wE dR dR dR wS wS",
    },
    negative: {
      concealed: "b2 b2 b2 c9 c9 c9 wE wE wE dR dR dR wS wS",
    },
  },
  "windy-dragons": {
    positive: {
      concealed: "wE wE wS wS wW wW wN wN dR dR dR dG dG dG",
    },
    negative: {
      concealed: "wE wE wS wS wW wW wN wN dR dR dR dG dG dW",
    },
  },
  "all-winds-and-dragons": {
    positive: {
      concealed: "wE wE wE wS wS wS dR dR dR dG dG dG wN wN",
    },
    negative: {
      concealed: "wE wE wE wS wS wS b9 b9 b9 dG dG dG wN wN",
    },
  },
  "heads-and-tails": {
    positive: {
      concealed: "b1 b1 b1 b9 b9 b9 c1 c1 c1 c9 c9 c9 o1 o1",
    },
    negative: {
      concealed: "b1 b1 b1 b9 b9 b9 c5 c5 c5 c9 c9 c9 o1 o1",
    },
  },
  "heavenly-twins": {
    positive: {
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 b7 b7",
    },
    negative: {
      concealed: "b1 b1 b2 b2 b3 b3 b4 b4 b5 b5 b6 b6 c7 c7",
    },
  },
  "purity-hand": {
    positive: {
      concealed: "b1 b1 b1 b2 b2 b2 b5 b5 b5 b7 b7 b7 b9 b9",
    },
    negative: {
      concealed: "b1 b1 b1 b2 b2 b2 b5 b5 b5 wE wE wE b9 b9",
    },
  },
  "ods-evens": {
    positive: {
      concealed: "b1 b3 b5 b7 b9 c1 c3 c5 c7 c9 o2 o4 o6 o8",
    },
    negative: {
      concealed: "b1 b3 b5 b7 b9 c1 c3 c5 c7 o1 o2 o4 o6 o8",
    },
  },
  "robin": {
    positive: {
      concealed: "b1 b2 b3 c1 c2 c3 c4 c5 c6 o5 o5 o7 o8 o9",
    },
    negative: {
      concealed: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 o5 o5",
    },
  },
  "sparrows-sanctuary": {
    positive: {
      concealed: "b1 b1 b1 b1 b2 b2 b3 b3 b4 b4 b6 b6 b8 b8",
    },
    negative: {
      concealed: "b1 b1 b1 b1 b2 b2 b3 b3 b4 b4 b6 b6 b7 b7",
    },
  },
  "ruby-jade": {
    positive: {
      concealed: "dR dR dR dG dG dG b5 b5 b5 b2 b2 b2 b9 b9",
    },
    negative: {
      concealed: "dR dR dR dG dG dG b5 b5 b5 b7 b7 b7 b9 b9",
    },
  },
  "red-lily": {
    positive: {
      concealed: "dR dR dR dW dW dW b5 b5 b5 b9 b9 b9 b1 b1",
    },
    negative: {
      concealed: "dR dR dR dW dW dW b2 b2 b2 b9 b9 b9 b1 b1",
    },
  },
  "royal-ruby": {
    positive: {
      concealed: "dR dR dR b1 b1 b1 b5 b5 b5 b9 b9 b9 b7 b7",
    },
    negative: {
      concealed: "dR dR dR b2 b2 b2 b5 b5 b5 b9 b9 b9 b7 b7",
    },
  },
  "blue-mountains": {
    positive: {
      concealed: "dG dG dG o1 o1 o1 o5 o5 o5 o7 o7 o7 o2 o2",
    },
    negative: {
      concealed: "dG dG dG o1 o1 o1 o5 o5 o5 o7 o7 o7 o6 o6",
    },
  },
  "white-elephant": {
    positive: {
      concealed: "dW dW dW o1 o1 o1 o3 o3 o3 o5 o5 o5 o2 o2",
    },
    negative: {
      concealed: "dW dW dW o1 o1 o1 o3 o3 o3 o5 o5 o5 o7 o7",
    },
  },
  "driven-snow": {
    positive: {
      concealed: "dW dW dW c1 c1 c1 c3 c3 c3 c5 c5 c5 c7 c7",
    },
    negative: {
      concealed: "dW dW dW c1 c1 c1 c3 c3 c3 c5 c5 c5 c2 c2",
    },
  },
  "dragons-scales": {
    positive: {
      concealed: "dR dR dR c1 c1 c1 c3 c3 c3 c5 c5 c5 c2 c2",
    },
    negative: {
      concealed: "dR dR dR c1 c1 c1 c3 c3 c3 c5 c5 c5 c7 c7",
    },
  },
  "dragonfly": {
    positive: {
      concealed: "dR dG dW b2 b2 b2 c5 c5 c5 o7 o7 o7 b9 b9",
    },
    negative: {
      concealed: "dR dG dW b2 b2 b2 c5 c5 c5 o7 o7 o7 dR dR",
    },
  },
  "three-sisters": {
    positive: {
      concealed: "b3 b3 b3 c3 c3 c3 o3 o3 o3 wE wE wS wW wN",
    },
    negative: {
      concealed: "b3 b3 b3 c3 c3 c3 o4 o4 o4 wE wE wS wW wN",
    },
  },
  "seven-brothers": {
    positive: {
      concealed: "b7 b7 b7 c7 c7 c7 o7 o7 o7 wE wE wS wW wN",
    },
    negative: {
      concealed: "b7 b7 b7 c7 c7 c7 o6 o6 o6 wE wE wS wW wN",
    },
  },
  "up-you-go": {
    positive: {
      concealed: "wE wS wW wN b2 b4 b4 b6 b6 b6 b8 b8 b8 b8",
    },
    negative: {
      concealed: "wE wS wW wN b3 b4 b4 b6 b6 b6 b8 b8 b8 b8",
    },
  },
  "down-you-go": {
    positive: {
      concealed: "wE wS wW wN b2 b2 b2 b2 b4 b4 b4 b6 b6 b8",
    },
    negative: {
      concealed: "wE wS wW wN b2 b2 b2 b2 b4 b4 b4 b6 b6 b7",
    },
  },
  "numbers-in-parallel": {
    positive: {
      concealed: "b5 b5 b5 c5 c5 c5 o5 o5 o5 wE wE wE wS wS",
    },
    negative: {
      concealed: "b5 b5 b5 c5 c5 c5 o4 o4 o4 wE wE wE wS wS",
    },
  },
  "numbers-doubled": {
    positive: {
      concealed: "b2 b2 b2 b5 b5 b5 c2 c2 c2 c5 c5 c5 dR dR",
    },
    negative: {
      concealed: "b2 b2 b2 b5 b5 b5 c2 c2 c2 c4 c4 c4 dR dR",
    },
  },
  "chinese-odds": {
    positive: {
      concealed: "b1 b1 b1 b3 b3 b3 b5 b5 b5 b7 b7 b7 b9 b9",
    },
    negative: {
      concealed: "b1 b1 b1 b3 b3 b3 b5 b5 b5 b7 b7 b7 b2 b2",
    },
  },
  "dragons-run": {
    positive: {
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dR dG dW wE wE",
    },
    negative: {
      concealed: "b1 b2 b3 b4 b5 b6 b7 b8 b9 dR dG dW dR dR",
    },
  },
};

function matches(input: HandInput, id: string): boolean {
  return matchHand(createHand(input)).some((match) => match.pattern.id === id);
}

describe("catalogue fixtures", () => {
  it("has a fixture for every pattern and no stale fixtures", () => {
    assert.deepEqual(
      Object.keys(FIXTURES).sort(),
      PATTERNS.map((pattern) => pattern.id).sort(),
    );
  });

  for (const pattern of PATTERNS) {
    it(`${pattern.id}: positive matches, negative does not`, () => {
      const fixture = FIXTURES[pattern.id];
      assert.ok(fixture, `missing fixture for ${pattern.id}`);
      assert.equal(
        matches(fixture.positive, pattern.id),
        true,
        `${pattern.id} should match its positive fixture`,
      );
      assert.equal(
        matches(fixture.negative, pattern.id),
        false,
        `${pattern.id} should not match its negative fixture`,
      );
    });
  }
});
