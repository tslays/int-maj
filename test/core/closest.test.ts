/**
 * The "closest hands" helper: the catalogue hands a seat's own tiles are
 * nearest to, from its view alone.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { closestHands, closestWithPins, MAX_PINS, viewFor } from "../../src/core/game/index.ts";
import { fixture } from "../helpers/game-fixture.ts";

const OTHERS = {
  S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 dR dR dG dG",
  W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
  N: "c1 c2 c3 c4 c5 c6 o4 o5 o6 o7 o8 o9 dW",
};

/** A wall long enough that the seat still expects to draw for a while. */
const LONG_WALL: readonly string[] = Array.from(
  { length: 60 },
  (_, index) => ["c6", "o9", "dW", "c3", "o5", "wN"][index % 6]!,
);

// Wriggly Snake (I pp. 10, 27): one to nine in a suit and one of each wind, one tile paired.
const SNAKE_LESS_NORTH = "b1 b2 b3 b4 b5 b6 b7 b8 b9 wE wS wW b5";

describe("closest hands", () => {
  it("names the hand one tile away and the tile it needs", () => {
    const state = fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
    const hands = closestHands(viewFor(state, "E"));
    assert.ok(hands.length > 0 && hands.length <= 3);
    const snake = hands.find((hand) => hand.pattern === "wriggly-snake");
    assert.ok(snake, `expected Wriggly Snake among ${hands.map((hand) => hand.pattern).join(", ")}`);
    assert.equal(snake.away, 1);
    assert.deepEqual(snake.need, ["wN"]);
    assert.equal(snake.tier, "limit");
    assert.equal(snake.concealedOnly, true, "Wriggly Snake exists only concealed");
    assert.equal(snake.points, 1000);
    assert.ok(snake.chance > 0 && snake.chance <= 1);
    assert.equal(hands[0]!.away, 1, "nothing is nearer than one tile");
    for (let index = 1; index < hands.length; index++) {
      assert.ok(hands[index - 1]!.away <= hands[index]!.away, "sorted nearest first");
    }
  });

  describe("a hand with more than one way to finish", () => {
    // Tester report #147: 1-9 in characters, a spare 1 and a spare 4, two White Dragons.
    // Grand Sequence (C p. 40) is the run, a dragon pung and two more tiles each pairing
    // with a run tile: this hand is one White Dragon away.
    const grand = (hand: string): ReturnType<typeof closestHands>[number] => {
      const state = fixture({ hands: { E: hand, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const found = closestHands(viewFor(state, "E"), 100).find((entry) => entry.pattern === "grand-sequence");
      assert.ok(found, "Grand Sequence is in reach");
      return found;
    };

    it("is one White Dragon away, and says it is one more of the two held", () => {
      const hand = grand("c1 c1 c2 c3 c4 c4 c5 c6 c7 c8 c9 dW dW");
      assert.equal(hand.away, 1);
      assert.deepEqual(hand.need, ["dW"]);
      assert.deepEqual(hand.another, ["dW"]);
      assert.deepEqual(hand.instead, []);
    });

    it("names the tiles that would do instead when several complete it", () => {
      // One spare 1: any run tile (the 1 too) as the second extra finishes the hand.
      const hand = grand("c1 c2 c3 c4 c5 c6 c7 c8 c9 c1 dW dW dW");
      assert.equal(hand.away, 1);
      assert.equal(hand.need.length, 1);
      const shown = hand.need[0]!;
      const stand = hand.instead.find((entry) => entry.need === shown)?.or ?? [];
      assert.equal(stand.length, 8, `${stand.length} stand-ins for ${shown}`);
      assert.ok(!stand.includes(shown));
      assert.ok(stand.every((key) => key.startsWith("c")), "only run tiles pair with the run");
    });

    it("names no stand-in when only one tile will do", () => {
      const state = fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const snake = closestHands(viewFor(state, "E")).find((hand) => hand.pattern === "wriggly-snake");
      assert.deepEqual(snake?.instead, []);
      assert.deepEqual(snake?.another, []);
    });
  });

  it("drops a hand whose missing tile is all in sight", () => {
    const state = fixture({
      hands: { E: SNAKE_LESS_NORTH, ...OTHERS },
      discards: { S: ["wN", "wN"], N: ["wN", "wN"] },
      wall: LONG_WALL.filter((key) => key !== "wN"),
      phase: "draw",
      turn: "E",
    });
    const hands = closestHands(viewFor(state, "E"), 50);
    assert.ok(!hands.some((hand) => hand.pattern === "wriggly-snake"));
    assert.ok(hands.every((hand) => !hand.need.includes("wN")));
  });

  it("reports a complete hand as no tiles away", () => {
    const state = fixture({
      hands: { E: `${SNAKE_LESS_NORTH} wN`, ...OTHERS },
      wall: LONG_WALL,
      phase: "discard",
      turn: "E",
    });
    const [first] = closestHands(viewFor(state, "E"));
    assert.equal(first?.pattern, "wriggly-snake");
    assert.equal(first?.away, 0);
    assert.deepEqual(first?.need, []);
  });

  it("reads only the seat's own view", () => {
    const a = fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
    const b = fixture({
      hands: { E: SNAKE_LESS_NORTH, S: OTHERS.N, W: OTHERS.S, N: OTHERS.W },
      wall: LONG_WALL,
      phase: "draw",
      turn: "E",
    });
    assert.deepEqual(closestHands(viewFor(a, "E")), closestHands(viewFor(b, "E")));
  });

  // Reported by a player: holding Crazy Chows one tile from complete, the panel said "4 to go"
  // (and "3 to go" with the drawn tile in hand). The hand has far more versions than the
  // sample the panel then used, and the player's own version was not in it.
  describe("a hand with many versions (Crazy Chows)", () => {
    // Chows 3o4b5c, 3c4o5b, 4c5b6o, 7b8o9c and the mixed pair 7o + 7c: only 7 characters is missing
    // (7 bamboo completes it too, as the pair 7b + 7o).
    const THIRTEEN = "c3 o4 b5 c4 b5 o6 o3 b4 c5 b7 o8 c9 o7";
    // Other hands from tiles that cannot disturb it.
    const QUIET = {
      S: "wE wE wE wS wS wS wW wW wW wN wN wN dR",
      W: "dG dG dG dW dW dW dR dR dR b1 b1 b1 b9",
      N: "b9 b9 b9 c1 c1 c1 c9 c9 c9 o1 o1 o1 o9",
    };
    const crazy = (hands: ReturnType<typeof closestHands>) => hands.find((hand) => hand.pattern === "crazy-chows");

    it("is one to go with thirteen tiles, as the Fishing announcement says", () => {
      const state = fixture({ hands: { E: THIRTEEN, ...QUIET }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const hand = crazy(closestHands(viewFor(state, "E"), 100));
      assert.ok(hand, "Crazy Chows is listed");
      assert.equal(hand.away, 1);
      assert.equal(hand.need.length, 1);
      assert.ok(["b7", "c7"].includes(hand.need[0]!), `needs ${hand.need.join()}`);
    });

    it("is still one to go once the next tile is drawn and one must be thrown", () => {
      const state = fixture({
        hands: { E: `${THIRTEEN} b8`, ...QUIET },
        wall: LONG_WALL,
        phase: "discard",
        turn: "E",
      });
      assert.equal(crazy(closestHands(viewFor(state, "E"), 100))?.away, 1);
    });

    it("is complete with the winning tile", () => {
      const state = fixture({ hands: { E: `${THIRTEEN} c7`, ...QUIET }, wall: LONG_WALL, phase: "discard", turn: "E" });
      const hand = crazy(closestHands(viewFor(state, "E"), 100));
      assert.equal(hand?.away, 0);
      assert.deepEqual(hand?.need, []);
    });

    it("counts only tiles that can still arrive", () => {
      // Every 7 of characters and every other 7 of bamboo is already discarded: no way is left at one tile.
      const state = fixture({
        hands: { E: THIRTEEN, ...QUIET },
        discards: { S: ["c7", "c7", "c7", "c7"], N: ["b7", "b7", "b7"] },
        wall: LONG_WALL.filter((key) => key !== "c7" && key !== "b7"),
        phase: "draw",
        turn: "E",
      });
      const hand = crazy(closestHands(viewFor(state, "E"), 100));
      assert.ok(hand === undefined || hand.away > 1, `Crazy Chows reads ${hand?.away} to go`);
      assert.ok(hand === undefined || !hand.need.some((key) => key === "c7" || key === "b7"));
    });

    it("shows the nearest hands first when it is one of several", () => {
      const state = fixture({ hands: { E: THIRTEEN, ...QUIET }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const hands = closestHands(viewFor(state, "E"));
      assert.equal(hands[0]!.away, 1, "something is one tile away");
      for (let index = 1; index < hands.length; index++) assert.ok(hands[index - 1]!.away <= hands[index]!.away);
    });
  });

  describe("a hand with an exposed meld", () => {
    // Ruby Jade (I p. 46): dragon pungs, a red and a green Bamboo pung, a Bamboo pair. Red Dragon pung exposed.
    const OTHERS_HERE = {
      S: "c1 c2 c3 c4 c5 c6 c7 c8 c9 o1 o2 o3 o4",
      W: "o5 o6 o7 o8 o9 o1 o2 o3 o4 o5 o6 o7 o8",
      N: "wE wS wW wN wE wS wW wN c1 c2 c3 c4 c5",
    };
    const held = fixture({
      hands: { E: "dG dG dG b1 b1 b1 b2 b2 b2 b9", ...OTHERS_HERE },
      melds: { E: [{ kind: "pung", tiles: ["dR", "dR", "dR"], exposed: true }] },
      wall: LONG_WALL,
      phase: "draw",
      turn: "E",
    });

    it("keeps the meld as a fixed set and counts only the concealed tiles still needed", () => {
      const hands = closestHands(viewFor(held, "E"), 100);
      const ruby = hands.find((hand) => hand.pattern === "ruby-jade");
      assert.ok(ruby, `expected Ruby Jade among ${hands.map((hand) => hand.pattern).join(", ")}`);
      assert.equal(ruby.away, 1);
      assert.deepEqual(ruby.need, ["b9"]);
      assert.equal(ruby.tier, "limit");
    });

    it("leaves out the hands that exist only concealed", () => {
      const hands = closestHands(viewFor(held, "E"), 100);
      for (const hand of hands) assert.equal(hand.concealedOnly, false, `${hand.name} needs a concealed hand`);
      assert.ok(!hands.some((hand) => hand.pattern === "crazy-chows"));
    });
  });

  it("leaves out a hand the table has excluded by house rule, however near it is", () => {
    const THIRTEEN = "c3 o4 b5 c4 b5 o6 o3 b4 c5 b7 o8 c9 o7";
    const others = {
      S: "wE wE wE wS wS wS wW wW wW wN wN wN dR",
      W: "dG dG dG dW dW dW dR dR dR b1 b1 b1 b9",
      N: "b9 b9 b9 c1 c1 c1 c9 c9 c9 o1 o1 o1 o9",
    };
    const base = { hands: { E: THIRTEEN, ...others }, wall: LONG_WALL, phase: "draw", turn: "E" } as const;
    const shown = (excluded?: readonly string[]) =>
      closestHands(viewFor(fixture({ ...base, excludedHands: excluded }), "E"), 100).map((hand) => hand.pattern);
    assert.ok(shown().includes("crazy-chows"));
    assert.ok(!shown(["crazy-chows"]).includes("crazy-chows"));
  });

  describe("pinned hands", () => {
    const state = () => fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });

    it("with no pins is the plain closest hands", () => {
      const view = viewFor(state(), "E");
      const { hands, pinned } = closestWithPins(view, []);
      assert.deepEqual(pinned, []);
      assert.deepEqual(hands, closestHands(view));
    });

    it("reports a pinned hand however far it is, and keeps it out of the suggestions", () => {
      const view = viewFor(state(), "E");
      const near = closestHands(view);
      assert.ok(near.some((hand) => hand.pattern === "wriggly-snake"), "the snake is among the three nearest");
      // A hand that is not among the nearest three now.
      const far = closestHands(view, 100).find((hand) => !near.some((n) => n.pattern === hand.pattern) && hand.away > 2)!;
      assert.ok(far, "a farther hand exists");

      const { hands, pinned } = closestWithPins(view, [far.pattern, "wriggly-snake"]);
      assert.deepEqual(
        pinned.map((entry) => entry.pattern),
        [far.pattern, "wriggly-snake"],
        "in the order pinned",
      );
      assert.deepEqual(pinned[0]!.hand, far);
      assert.equal(pinned[1]!.hand?.away, 1);
      assert.ok(!hands.some((hand) => hand.pattern === far.pattern || hand.pattern === "wriggly-snake"));
      assert.deepEqual(
        hands,
        near.filter((hand) => hand.pattern !== "wriggly-snake").concat(
          closestHands(view, 100).filter(
            (hand) =>
              hand.pattern !== far.pattern &&
              hand.pattern !== "wriggly-snake" &&
              !near.some((n) => n.pattern === hand.pattern),
          ),
        ).slice(0, 3),
        "the nearest unpinned hands fill the rest",
      );
    });

    it("says null for a pinned hand that cannot be finished, and names it", () => {
      const view = viewFor(
        fixture({
          hands: { E: SNAKE_LESS_NORTH, ...OTHERS },
          discards: { S: ["wN", "wN"], N: ["wN", "wN"] },
          wall: LONG_WALL.filter((key) => key !== "wN"),
          phase: "draw",
          turn: "E",
        }),
        "E",
      );
      const { pinned } = closestWithPins(view, ["wriggly-snake"]);
      assert.equal(pinned.length, 1);
      assert.equal(pinned[0]!.name, "Wriggly Snake");
      assert.equal(pinned[0]!.hand, null, "every north is in sight");
    });

    it("ignores unknown ids, repeats and pins past the limit", () => {
      const view = viewFor(state(), "E");
      assert.deepEqual(closestWithPins(view, ["no-such-hand"]).pinned, []);
      const ids = closestHands(view, 100).map((hand) => hand.pattern);
      const { pinned } = closestWithPins(view, [ids[0]!, ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
      assert.deepEqual(
        pinned.map((entry) => entry.pattern),
        ids.slice(0, MAX_PINS),
      );
    });

    it("leaves out a pinned hand the table plays without", () => {
      const view = viewFor(fixture({ hands: { E: SNAKE_LESS_NORTH, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E", excludedHands: ["wriggly-snake"] }), "E");
      assert.deepEqual(closestWithPins(view, ["wriggly-snake"]).pinned, []);
    });
  });

  describe("scoring variants", () => {
    // Big Robert, same numbers, one tile short (a second wind to pair the S): limit.
    const SAME_NUMBERS_ONE_SHORT = "b1 b2 b3 b4 c1 c2 c3 c4 o1 o2 o3 o4 wS";
    // Big Robert, mixed numbers, one tile short (a second wind to pair the S): half limit.
    const MIXED_NUMBERS_ONE_SHORT = "b1 b2 b3 b4 c2 c3 c4 c5 o1 o2 o3 o4 wS";

    it("lists Big Robert once, at the reading the seat is nearest to", () => {
      const state = fixture({ hands: { E: SAME_NUMBERS_ONE_SHORT, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const robert = closestHands(viewFor(state, "E"), 100).filter((hand) => hand.pattern.startsWith("big-robert"));
      assert.equal(robert.length, 1, "one card for both scorings");
      assert.equal(robert[0]!.pattern, "big-robert");
      assert.equal(robert[0]!.name, "Big Robert");
      assert.equal(robert[0]!.tier, "limit");
      assert.equal(robert[0]!.points, 1000);
    });

    it("scores the card at the mixed-numbers reading when that is the nearer one", () => {
      const state = fixture({ hands: { E: MIXED_NUMBERS_ONE_SHORT, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const robert = closestHands(viewFor(state, "E"), 100).filter((hand) => hand.pattern.startsWith("big-robert"));
      assert.equal(robert.length, 1);
      assert.equal(robert[0]!.pattern, "big-robert");
      assert.equal(robert[0]!.tier, "half");
      assert.equal(robert[0]!.points, 500);
    });

    it("maps a pin on the mixed-numbers reading to its card", () => {
      const state = fixture({ hands: { E: MIXED_NUMBERS_ONE_SHORT, ...OTHERS }, wall: LONG_WALL, phase: "draw", turn: "E" });
      const { pinned, hands } = closestWithPins(viewFor(state, "E"), ["big-robert-mixed"]);
      assert.deepEqual(pinned.map((entry) => entry.pattern), ["big-robert"]);
      assert.equal(pinned[0]!.hand?.tier, "half");
      assert.ok(!hands.some((hand) => hand.pattern.startsWith("big-robert")), "the pinned card is not listed twice");
    });
  });
});
