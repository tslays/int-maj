/**
 * The sample hand each book pictures for a catalogue hand.
 *
 * Every entry was read tile by tile from the page image
 * (`rules/pages/illustrated/pNN.jpg`, `rules/pages/companion/pNN.jpg`): the
 * same tiles, in the printed order and the printed grouping. A bracketed
 * token is a card the book prints instead of a tile ("Any tile paired").
 *
 * A picture only exemplifies its hand; the caption (the pattern's
 * `description` and predicate) defines it. Both books are kept where both
 * picture the hand, the primary book first. A hand a book lists without a
 * picture has no entry for that book, and a hand with an empty list is
 * pictured in neither.
 *
 * Tile keys are the engine's: b bamboo, c characters, o circles, wE wS wW wN
 * winds, dR dG dW dragons.
 */

import { parseTile } from "../tiles.ts";

export type SampleBook = "illustrated" | "companion";

export const BOOK_TITLE: Readonly<Record<SampleBook, string>> = Object.freeze({
  illustrated: "The Game of Mah Jong Illustrated",
  companion: "The Mah Jong Player's Companion",
});

/** One tile of a picture: a tile key, or the words of a printed card. */
export type SampleTile = string | { readonly any: string };

export interface BookSample {
  readonly book: SampleBook;
  /** The printed page the picture is on. */
  readonly page: number;
  /** Printed sub-heading, for a hand pictured in more than one version. */
  readonly label?: string;
  /** The tiles, grouped as the page spaces them. */
  readonly groups: readonly (readonly SampleTile[])[];
  /** Something the picture shows that the tiles alone do not. */
  readonly note?: string;
  /**
   * The catalogue id the picture is an example of, when that is not the
   * entry it is listed under (one printed picture serving two table ids).
   */
  readonly illustrates?: string;
}

interface Extra {
  readonly label?: string;
  readonly note?: string;
  readonly illustrates?: string;
}

function parseGroups(text: string): SampleTile[][] {
  return text.split("|").map((group) => {
    const tiles: SampleTile[] = [];
    for (const token of group.trim().match(/\[[^\]]+\]|\S+/g) ?? []) {
      if (token.startsWith("[")) {
        tiles.push(Object.freeze({ any: token.slice(1, -1) }));
        continue;
      }
      const tile = parseTile(token);
      if (tile.kind === "flower" || tile.kind === "season") {
        throw new Error(`Not a hand tile in a sample: ${token}`);
      }
      tiles.push(token);
    }
    return tiles;
  });
}

function sample(book: SampleBook, page: number, text: string, extra: Extra = {}): BookSample {
  return Object.freeze({ book, page, groups: parseGroups(text), ...extra });
}

/** A picture in the primary book. */
const I = (page: number, text: string, extra?: Extra) => sample("illustrated", page, text, extra);
/** A picture in the Companion. */
const C = (page: number, text: string, extra?: Extra) => sample("companion", page, text, extra);

const WINDS = "wE wS wW wN";
const DRAGONS = "dG dR dW";
const ANY_WIND = "[Any Wind paired]";

const BIG_ROBERT = (extra: Extra) =>
  C(14, "b4 b5 b6 b7 | o1 o2 o3 o4 | c6 c7 c8 c9 | wW wW", extra);

export const SAMPLES: Readonly<Record<string, readonly BookSample[]>> = Object.freeze({
  "ordinary-mahjong": [
    I(34, "o4 o4 o4 | o7 o7 o7 | o1 o2 o3 | dR dR dR | o8 o8"),
    C(42, "dW dW dW | o4 o4 o4 | o7 o7 o7 | o1 o2 o3 | o8 o8"),
  ],
  "wriggly-snake": [
    I(38, `c1 c2 c3 c4 c5 c6 c7 c8 c9 | ${WINDS} | [Any tile paired]`),
    C(10, `c1 c2 c3 c4 c5 c6 c7 c8 c9 | ${WINDS} | [Any tile paired]`),
  ],
  "all-pair": [
    I(35, "o1 o1 | o2 o2 | o8 o8 | o9 o9 | wE wE | wS wS | dG dG"),
    C(22, "o1 o1 | o2 o2 | o8 o8 | o9 o9 | wE wE | wS wS | dG dG"),
  ],
  "three-great-scholars": [
    I(49, "dG dG dG | dR dR dR | dW dW dW | c8 c8 c8 | c5 c5"),
    C(33, "dG dG dG | dR dR dR | dW dW dW | c8 c8 c8 | c5 c5"),
  ],
  "chow-chow": [C(15, "c2 c3 c4 | c3 c4 c5 | c7 c8 c9 | c4 c5 c6 | c1 c1")],
  "run-pung-pair": [
    I(36, "o1 o2 o3 o4 o5 o6 o7 o8 o9 | o4 o4 o4 | o7 o7"),
    C(9, "o1 o2 o3 o4 o5 o6 o7 o8 o9 | o8 o8 o8 | o9 o9"),
  ],
  "gates-of-heaven": [
    I(36, "b1 b1 b1 | b9 b9 b9 | b2 b3 b4 b5 b6 b7 b8 | [Any tile 2-8 paired]"),
    C(9, "c2 c3 c4 c5 c6 c7 c8 | [Any tile 2-8 paired] | c1 c1 c1 | c9 c9 c9"),
  ],
  "confused-gates": [
    I(57, "c1 c1 c1 | b9 b9 b9 | o2 o3 o4 o5 o6 o7 o8 | [Any tile 2-8 paired]"),
    C(9, "o2 o3 o4 o5 o6 o7 o8 | [Any tile 2-8 paired] | c1 c1 c1 | b9 b9 b9"),
  ],
  "hachi-ban": [
    I(57, "b1 b2 b3 b4 b5 b6 b7 b8 | wE wE | wS wS | wW wW"),
    C(10, "b1 b2 b3 b4 b5 b6 b7 b8 | wE wE | wS wS | wW wW", { label: "With three pairs of Winds" }),
    C(32, "dG dG | dR dR | dW dW | c1 c2 c3 c4 c5 c6 c7 c8", { label: "With three pairs of Dragons" }),
  ],
  "guardian-winds": [C(10, "c1 c2 c3 c4 c5 c6 c7 c8 c9 | wS wS wS | wN wN")],
  "wriggly-dragon": [C(11, `o1 o2 o3 o4 o5 o6 o7 o8 o9 | ${DRAGONS} | dR dR`)],
  "five-odd-honours": [
    I(57, "dG dR | wS wW wN | c1 c2 c3 c4 c5 c6 c7 c8 c9"),
    C(11, "c1 c2 c3 c4 c5 c6 c7 c8 c9 | dG dR wS wW wN"),
  ],
  "guardian-dragons": [C(39, "dG dG dG | dW dW | b1 b2 b3 b4 b5 b6 b7 b8 b9")],
  "grand-sequence": [
    C(40, "wN wN wN | c1 c2 c3 c4 c5 c6 c7 c8 c9 | [Any tile 1-9 paired] [Any tile 1-9 paired]", {
      label: "First version",
    }),
    C(40, "dG dG dG | b1 b2 b3 b4 b5 b6 b7 b8 b9 | [Any tile 1-9 paired] [Any tile 1-9 paired]", {
      label: "Second version",
    }),
  ],
  "dragons-tail": [
    I(52, "dR dR dR | wW wW | c1 c2 c3 c4 c5 c6 c7 c8 c9", { label: "1st version" }),
    I(52, "dW dW | wS wS wS | o1 o2 o3 o4 o5 o6 o7 o8 o9", { label: "2nd version" }),
    C(41, "dR dR dR | wW wW | c1 c2 c3 c4 c5 c6 c7 c8 c9", { label: "First version" }),
    C(41, "dW dW | wS wS wS | o1 o2 o3 o4 o5 o6 o7 o8 o9", { label: "Second version" }),
  ],
  "dragons-gates": [
    C(12, "b2 b3 b4 b5 b6 b7 b8 | [Any tile 2-8 paired] | b9 b9 b9 | dG dG dG"),
  ],
  "dragons-teeth": [
    C(12, "c1 c2 c3 c4 c5 c6 c7 | [Any tile 1-7 or 2-8 paired] | dW dW dW | dR dR dR"),
  ],
  "gretas-garden": [
    I(43, `b1 b2 b3 b4 b5 b6 b7 | ${WINDS} | ${DRAGONS}`),
    C(13, `b1 b2 b3 b4 b5 b6 b7 | ${WINDS} | ${DRAGONS}`),
  ],
  "gretas-dragon": [
    I(43, `c1 c2 c3 c4 c5 c6 c7 | ${WINDS} | dG dG dG`),
    C(13, `c1 c2 c3 c4 c5 c6 c7 | ${WINDS} | dG dG dG`),
  ],
  "red-lantern": [
    I(48, "dR dR dR | wE wE wE | o1 o2 o3 o4 o5 o6 o7 | [Any tile 1-7 paired]", {
      note: "The Wind pung is your own Wind; the picture shows East's hand.",
    }),
    C(13, "o1 o2 o3 o4 o5 o6 o7 | [Any tile 1-7 paired] | dR dR dR | wS wS wS", {
      note: "The Wind pung is your own Wind; the picture shows South's hand.",
    }),
  ],
  "gerties-garter": [
    I(37, "b1 b2 b3 b4 b5 b6 b7 | o1 o2 o3 o4 o5 o6 o7"),
    C(14, "b1 b2 b3 b4 b5 b6 b7 | o1 o2 o3 o4 o5 o6 o7"),
  ],
  "yin-yang": [C(14, "b1 b1 | b2 b3 b4 | b5 b5 | o5 o5 | o6 o7 o8 | o9 o9")],
  "big-robert": [
    BIG_ROBERT({
      illustrates: "big-robert-mixed",
      note:
        "The book prints one picture for both scores, and it shows runs of different numbers. " +
        "This hand needs the same four numbers in all three suits.",
    }),
  ],
  "big-robert-mixed": [BIG_ROBERT({})],
  "moon-at-bottom-of-well": [C(15, "o1 o2 o3 | o4 o5 o6 | o7 o8 o9 | o1 o2 o3 | o4 o4")],
  "three-philosophers": [C(15, "c2 c3 c4 | o6 o7 o8 | b5 b6 b7 | b4 o5 c6 | b2 b2")],
  "crazy-chows": [C(16, "o4 b5 c6 | o2 b3 c4 | o6 b7 c8 | o1 b2 c3 | b6 o6")],
  "little-robert": [C(16, "c5 c6 c7 | o4 o5 o6 | b2 b3 b4 | o3 o3 o3 | b2 b2")],
  "windy-chow": [
    I(41, `${WINDS} | ${ANY_WIND} | b7 b8 b9 | o2 o3 o4 | c5 c6 c7`),
    C(18, `b7 b8 b9 | o2 o3 o4 | c5 c6 c7 | ${WINDS} | ${ANY_WIND}`),
  ],
  "chop-suey": [
    I(58, `b1 b2 b3 | o1 o2 o3 | c1 c2 c3 | ${WINDS} | ${ANY_WIND}`),
    C(18, `b1 b2 b3 | o1 o2 o3 | c1 c2 c3 | ${WINDS} | ${ANY_WIND}`),
  ],
  "chow-mein": [
    I(58, `b7 b8 b9 | o7 o8 o9 | c7 c8 c9 | ${WINDS} | ${ANY_WIND}`),
    C(18, `b7 b8 b9 | o7 o8 o9 | c7 c8 c9 | ${WINDS} | ${ANY_WIND}`),
  ],
  "hovering-angel": [
    C(17, "b4 b5 b6 | o2 o3 o4 | c1 c2 c3 | wN wN wN | dR dR", {
      note: "The Wind pung is your own Wind; the picture shows North's hand.",
    }),
  ],
  "little-brother": [C(17, "b4 b5 b6 | o2 o3 o4 | c6 c7 c8 | b5 b6 b7 | [Own Wind] [Own Wind]")],
  "apple-blossom": [C(19, "o2 b3 c4 | c6 o7 b8 | b3 o4 c5 | dW dW dW | dG dG")],
  professors: [
    C(19, `o6 b7 c8 | o4 b5 c6 | o2 b3 c4 | ${DRAGONS} | wS wS`, {
      note: "The pair is your own Wind; the picture shows South's hand.",
    }),
  ],
  knitting: [
    I(37, "b1 o1 | b2 o2 | b2 o2 | b4 o4 | b5 o5 | b7 o7 | b8 o8"),
    C(20, "b1 o1 | b2 o2 | b2 o2 | b4 o4 | b5 o5 | b7 o7 | b8 o8"),
  ],
  "triple-knitting": [
    I(37, "b1 o1 c1 | b4 o4 c4 | b7 o7 c7 | b9 o9 c9 | b1 c1"),
    C(20, "b1 o1 c1 | b4 o4 c4 | b7 o7 c7 | b9 o9 c9 | b1 c1"),
  ],
  "all-pair-honours": [
    I(39, "b1 b1 | b9 b9 | o9 o9 | c1 c1 | c9 c9 | wW wW | dG dG"),
    C(22, "b1 b1 | b9 b9 | o9 o9 | c1 c1 | c9 c9 | wW wW | dW dW"),
  ],
  "seven-twins": [C(22, "b3 b3 | b5 b5 | o4 o4 | o9 o9 | c1 c1 | c7 c7 | wS wS")],
  "dragons-breath": [
    I(52, `${DRAGONS} | [Any Dragon paired] | b1 b1 | b3 b3 | b5 b5 | b6 b6 | b8 b8`),
    C(24, `b1 b1 | b3 b3 | b5 b5 | b6 b6 | b8 b8 | ${DRAGONS} | [Any Dragon paired]`),
  ],
  windfall: [
    I(53, `${WINDS} | b2 b2 | b3 b3 | b4 b4 | b6 b6 | b8 b8`),
    C(24, `b2 b2 | b3 b3 | b4 b4 | b6 b6 | b8 b8 | ${WINDS}`),
  ],
  dragonette: [
    C(24, `c4 c4 | c6 c6 | c8 c8 | ${WINDS} | ${DRAGONS} | [Any Wind or Dragon paired]`),
  ],
  "windy-ones": [
    I(42, `${WINDS} | ${ANY_WIND} | b1 b1 b1 | o1 o1 o1 | c1 c1 c1`),
    C(28, `${WINDS} | ${ANY_WIND} | b1 b1 b1 | o1 o1 o1 | c1 c1 c1`),
  ],
  "windy-nines": [
    I(42, `${WINDS} | ${ANY_WIND} | b9 b9 b9 | o9 o9 o9 | c9 c9 c9`),
    C(28, `${WINDS} | ${ANY_WIND} | b9 b9 b9 | o9 o9 o9 | c9 c9 c9`),
  ],
  windvane: [C(28, `${WINDS} | ${ANY_WIND} | b1 b1 b1 | o6 o6 o6 | c9 c9 c9`)],
  "civil-war": [
    I(53, "wN wN wN | wS wS wS | c1 c8 c6 c1 | o1 o8 o6 o5"),
    C(30, "wN wN wN | wS wS wS | c1 c8 c6 c1 | o1 o8 o6 o5"),
  ],
  "four-blessings": [
    I(49, "wE wE wE | wS wS wS | wW wW wW | wN wN wN | o9 o9"),
    C(30, "wE wE wE | wS wS wS | wW wW wW | wN wN wN | o9 o9"),
  ],
  "all-pair-jade": [
    I(44, "b2 b2 | b3 b3 | b4 b4 | b4 b4 | b6 b6 | b8 b8 | dG dG"),
    C(23, "b2 b2 | b3 b3 | b4 b4 | b4 b4 | b6 b6 | b8 b8 | dG dG"),
  ],
  "all-pair-ruby-jade": [
    I(46, "dR dR | dG dG | b3 b3 | b5 b5 | b7 b7 | b8 b8 | b9 b9"),
    C(23, "dR dR | dG dG | b3 b3 | b5 b5 | b7 b7 | b8 b8 | b9 b9"),
  ],
  "golden-gates": [C(25, "c2 c2 | c4 c4 | c6 c6 | c8 c8 | c9 c9 c9 | dR dR dR")],
  "red-waratah": [
    I(54, "dR dR dR | dG dG | b5 b5 b5 | o6 o6 o6 | c9 c9 c9"),
    C(34, "dR dR dR | dG dG | b5 b5 b5 | o6 o6 o6 | c9 c9 c9"),
  ],
  "green-jade": [
    I(56, "dG dG dG | b1 b1 b1 | b4 b4 b4 | b7 b7 b7 | b8 b8"),
    C(35, "dG dG dG | b1 b1 b1 | b4 b4 b4 | b7 b7 b7 | b8 b8"),
  ],
  "red-coral": [
    I(56, "dR dR dR | c3 c3 c3 | c5 c5 c5 | c8 c8 c8 | c9 c9"),
    C(35, "dR dR dR | c3 c3 c3 | c5 c5 c5 | c8 c8 c8 | c9 c9"),
  ],
  "white-opal": [
    I(56, "dW dW dW | o4 o4 o4 | o6 o6 o6 | o7 o7 o7 | o9 o9"),
    C(35, "dW dW dW | o4 o4 o4 | o6 o6 o6 | o7 o7 o7 | o9 o9"),
  ],
  "imperial-jade": [
    I(45, "dG dG dG | b2 b2 b2 | b3 b3 b3 | b4 b4 b4 | b6 b6"),
    C(36, "dG dG dG | b2 b2 b2 | b3 b3 b3 | b4 b4 b4 | b6 b6"),
  ],
  "lily-of-the-valley": [
    I(45, "dG dG dG | dW dW dW | b2 b2 b2 | b4 b4 b4 | b8 b8"),
    C(36, "dG dG dG | dW dW dW | b2 b2 b2 | b4 b4 b4 | b8 b8"),
  ],
  lillypilly: [
    I(54, "dG dG dG | dW dW | o4 o4 o4 | o8 o8 o8 | o9 o9 o9"),
    C(36, "dG dG dG | dW dW | o4 o4 o4 | o8 o8 o8 | o9 o9 o9"),
  ],
  sunrise: [C(42, "wE wE wE | dW dW | b5 b5 b5 | o2 o2 o2 | c4 c4 c4")],
  sunset: [C(42, "wW wW wW | dR dR | b5 b5 b5 | o6 o6 o6 | c8 c8 c8")],
  "unique-wonder": [
    I(39, `b1 o1 c1 | b9 o9 c9 | ${WINDS} | ${DRAGONS} | [Any tile paired]`),
    C(44, `b1 o1 c1 | b9 o9 c9 | ${WINDS} | ${DRAGONS} | [Any tile paired]`),
  ],
  "all-honour-hand": [
    I(39, "o1 o1 o1 | o9 o9 o9 | c1 c1 c1 | wN wN wN | dR dR"),
    C(44, "o1 o1 o1 | o9 o9 o9 | c1 c1 c1 | wN wN wN | dR dR"),
  ],
  "windy-dragons": [
    I(48, "wE wE | wS wS | wW wW | wN wN | dG dG dG | dR dR dR"),
    C(25, "wE wE | wS wS | wW wW | wN wN | dG dG dG | dR dR dR"),
  ],
  "all-winds-and-dragons": [
    I(48, "wS wS wS | wW wW wW | dG dG dG | dR dR dR | dW dW"),
    C(46, "wS wS wS | wW wW wW | dG dG dG | dR dR dR | dW dW"),
  ],
  "heads-and-tails": [
    I(40, "b1 b1 b1 | o9 o9 o9 | c1 c1 c1 | c9 c9 c9 | b9 b9"),
    C(45, "b1 b1 b1 | o9 o9 o9 | c1 c1 c1 | c9 c9 c9 | o1 o1"),
  ],
  "heavenly-twins": [
    I(35, "c1 c1 | c3 c3 | c4 c4 | c5 c5 | c6 c6 | c8 c8 | c9 c9"),
    C(21, "c1 c1 | c3 c3 | c4 c4 | c5 c5 | c6 c6 | c8 c8 | c9 c9"),
  ],
  "purity-hand": [
    I(34, "c1 c1 c1 | c2 c2 c2 | c7 c7 c7 | c9 c9 c9 | c4 c4"),
    C(48, "c1 c1 c1 | c2 c2 c2 | c7 c7 c7 | c9 c9 c9 | c4 c4"),
  ],
  "ods-evens": [],
  robin: [],
  "sparrows-sanctuary": [
    I(44, "b1 b1 | b1 b1 | b2 b2 | b3 b3 | b4 b4 | b6 b6 | b8 b8"),
    C(21, "b1 b1 | b1 b1 | b2 b2 | b3 b3 | b4 b4 | b6 b6 | b8 b8"),
  ],
  "ruby-jade": [
    I(46, "dR dR dR | dG dG dG | b9 b9 b9 | b2 b2 b2 | b7 b7"),
    C(37, "dR dR dR | dG dG dG | b9 b9 b9 | b2 b2 b2 | b6 b6"),
  ],
  "red-lily": [
    I(47, "dR dR dR | dW dW dW | b5 b5 b5 | b9 b9 b9 | b7 b7"),
    C(37, "dR dR dR | dW dW dW | b5 b5 b5 | b9 b9 b9 | b7 b7"),
  ],
  "royal-ruby": [
    I(47, "dR dR dR | b1 b1 b1 | b5 b5 b5 | b7 b7 b7 | b9 b9"),
    C(37, "dR dR dR | b1 b1 b1 | b5 b5 b5 | b7 b7 b7 | b9 b9"),
  ],
  "blue-mountains": [],
  "white-elephant": [],
  "driven-snow": [],
  "dragons-scales": [],
  dragonfly: [
    I(41, `${DRAGONS} | b2 b2 b2 | o6 o6 o6 | c8 c8 c8 | o5 o5`),
    C(31, `${DRAGONS} | b2 b2 b2 | o6 o6 o6 | c8 c8 c8 | o5 o5`),
  ],
  "three-sisters": [
    I(55, `b3 b3 b3 | o3 o3 o3 | c3 c3 c3 | ${WINDS} | ${ANY_WIND}`),
    C(29, `${WINDS} | ${ANY_WIND} | b3 b3 b3 | o3 o3 o3 | c3 c3 c3`),
  ],
  "seven-brothers": [
    I(55, `b7 b7 b7 | o7 o7 o7 | c7 c7 c7 | ${WINDS} | ${ANY_WIND}`),
    C(29, `${WINDS} | ${ANY_WIND} | b7 b7 b7 | o7 o7 o7 | c7 c7 c7`),
  ],
  "up-you-go": [],
  "down-you-go": [],
  "numbers-in-parallel": [C(43, "dG dG dG | dR dR | o8 o8 o8 | c8 c8 c8 | b8 b8 b8")],
  "numbers-doubled": [C(43, "wE wE | o6 o6 o6 | c6 c6 c6 | o7 o7 o7 | c7 c7 c7")],
  "chinese-odds": [
    I(40, "c1 c1 c1 | c3 c3 c3 | c5 c5 c5 | c7 c7 c7 | c9 c9"),
    C(49, "c1 c1 c1 | c3 c3 c3 | c5 c5 c5 | c7 c7 c7 | c9 c9"),
  ],
  "dragons-run": [],
  "buried-treasure": [I(38, "c2 c3 c4 | c3 c4 c5 | c6 c7 c8 | c6 c7 c8 | c9 c9")],
  "all-kong": [],
  "mixed-pung": [],
  "chinese-ordinary": [
    I(29, "dG dG dG | b2 b2 b2 | o2 o3 o4 | c6 c7 c8 | wN wN", {
      note:
        "The book's example of a completed hand held by North: the Green Dragon pung is exposed, " +
        "and the middle 2 Bamboo is printed face down to mark a concealed pung.",
    }),
  ],
});

/** The pictures of one hand, primary book first; empty when neither book pictures it. */
export function samplesFor(id: string): readonly BookSample[] {
  return SAMPLES[id] ?? [];
}
