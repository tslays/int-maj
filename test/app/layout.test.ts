/**
 * The 3D table's discard pinwheel: however long the hand runs, no two
 * discards overlap, every discard stays inside the walls, and none covers the
 * centre console. `app/src/layout.js` is plain numbers, so this needs no
 * browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { breakFor, wallDrawOrder, discardRect, discardSlot, handRects, meldLayout, meldRects, TABLE, wallRects, WALL_INNER, W, H } from "../../app/src/layout.js";

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const EPSILON = 1e-6;
/** Half a tile's thickness: a standing hand reaches this far from its line. */
const D_HALF = 0.39;
// A whole hand rarely gives a seat more than about 23 discards; the corner
// row has room for 29 before it would reach the wall.
const MOST = 29;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.minX < b.maxX - EPSILON &&
    b.minX < a.maxX - EPSILON &&
    a.minZ < b.maxZ - EPSILON &&
    b.minZ < a.maxZ - EPSILON
  );
}

const all: { rel: number; index: number; rect: Rect }[] = [];
for (let rel = 0; rel < 4; rel++) {
  for (let index = 0; index < MOST; index++) all.push({ rel, index, rect: discardRect(rel, index) });
}

describe("3D table discard layout", () => {
  it("never overlaps two discards, within a seat or between seats", () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        assert.equal(
          overlaps(all[i]!.rect, all[j]!.rect),
          false,
          `seat ${all[i]!.rel} discard ${all[i]!.index + 1} overlaps seat ${all[j]!.rel} discard ${all[j]!.index + 1}`,
        );
      }
    }
  });

  it("keeps every discard inside the walls and off the console", () => {
    const console: Rect = {
      minX: -TABLE.CENTER_HALF,
      maxX: TABLE.CENTER_HALF,
      minZ: -TABLE.CENTER_HALF,
      maxZ: TABLE.CENTER_HALF,
    };
    for (const { rel, index, rect } of all) {
      const label = `seat ${rel} discard ${index + 1}`;
      assert.ok(Math.max(Math.abs(rect.minX), Math.abs(rect.maxX)) <= WALL_INNER, `${label} reaches the wall`);
      assert.ok(Math.max(Math.abs(rect.minZ), Math.abs(rect.maxZ)) <= WALL_INNER, `${label} reaches the wall`);
      assert.equal(overlaps(rect, console), false, `${label} covers the console`);
    }
  });

  it("fills three rows of six, then runs the fourth row on to the right", () => {
    const first = discardSlot(0);
    const sixth = discardSlot(5);
    const seventh = discardSlot(6);
    assert.ok(sixth.x > first.x && Math.abs(sixth.z - first.z) < EPSILON, "a row runs left to right");
    assert.ok(seventh.z > first.z && Math.abs(seventh.x - first.x) < EPSILON, "the next row starts below");
    const nineteenth = discardSlot(18);
    const twentyFifth = discardSlot(24);
    assert.ok(Math.abs(twentyFifth.z - nineteenth.z) < EPSILON, "the fourth row stays one row");
    assert.ok(twentyFifth.x > discardSlot(17).x, "and continues past the sixth column");
  });

  it("keeps the walls clear of each other and of the opponents' hands", () => {
    assert.ok(TABLE.WALL_R >= TABLE.WALL_STACKS / 2 + H / 2, "pinwheel walls touch at the corners");
    assert.ok(TABLE.HAND_Z - D_HALF > TABLE.WALL_R + H / 2, "a hand stands on its wall");
    assert.ok(TABLE.HAND_Z + 0.2 + (H / 2) < TABLE.TABLE_HALF, "a meld hangs over the rail");
    assert.ok(W > 0);
  });

  it("lays every seat's melds in its wall's lane, clear of walls, hands, discards and other melds", () => {
    // Groups as the table lays them: [bonus tiles?, melds...], with the hand that is left.
    const hands: { groups: number[]; bonusFirst: boolean; hand: number }[] = [
      { groups: [3], bonusFirst: false, hand: 10 },
      { groups: [2, 3], bonusFirst: true, hand: 10 },
      { groups: [3, 3], bonusFirst: false, hand: 7 },
      { groups: [4, 3, 3, 3], bonusFirst: true, hand: 4 },
      { groups: [8, 4, 4, 4, 4], bonusFirst: true, hand: 1 },
    ];
    for (const walls of [18, 12, 6, 0]) {
      for (const { groups, bonusFirst, hand } of hands) {
        if (walls === 18 && groups.length > 4) continue; // twelve tiles are never laid before any wall is drawn
        const label = `wall ${walls}, groups ${groups.join("+")}`;
        const melds: { rel: number; rect: Rect }[] = [];
        const solid: { what: string; rect: Rect }[] = [];
        for (let rel = 0; rel < 4; rel++) {
          for (const rect of meldRects(rel, groups, walls, hand, { bonusFirst })) melds.push({ rel, rect });
          for (const rect of wallRects(rel, walls)) solid.push({ what: `seat ${rel} wall`, rect });
          for (const rect of handRects(rel, hand)) solid.push({ what: `seat ${rel} hand`, rect });
        }
        for (const discard of all) solid.push({ what: `seat ${discard.rel} discard ${discard.index + 1}`, rect: discard.rect });
        for (const meld of melds) {
          const edge = TABLE.TABLE_HALF - 0.05;
          assert.ok(
            Math.max(Math.abs(meld.rect.minX), Math.abs(meld.rect.maxX), Math.abs(meld.rect.minZ), Math.abs(meld.rect.maxZ)) <= edge,
            `${label}: seat ${meld.rel} melds leave the table`,
          );
          for (const thing of solid) {
            assert.equal(overlaps(meld.rect, thing.rect), false, `${label}: seat ${meld.rel} melds cover ${thing.what}`);
          }
        }
        for (let i = 0; i < melds.length; i++) {
          for (let j = i + 1; j < melds.length; j++) {
            if (melds[i]!.rel === melds[j]!.rel) {
              assert.equal(overlaps(melds[i]!.rect, melds[j]!.rect), false, `${label}: seat ${melds[i]!.rel} melds overlap each other`);
            } else {
              assert.equal(overlaps(melds[i]!.rect, melds[j]!.rect), false, `${label}: seats ${melds[i]!.rel} and ${melds[j]!.rel} melds touch`);
            }
          }
        }
      }
    }
  });

  it("starts in the left-hand corner and grows to the right, bonus tiles first", () => {
    // Once some of the wall in front of the player is used, the lane has room.
    const one = meldLayout([3], 12, 10).tiles;
    const two = meldLayout([3, 3], 12, 7).tiles;
    assert.ok(one[0]!.x < -12, "the first meld lies in the corner on the player's left");
    assert.deepEqual(two.slice(0, 3), one, "an earlier meld never moves when another is made");
    assert.ok(two[3]!.x > two[2]!.x, "the next meld goes to its right");
    const crowded = meldLayout([3, 3, 3], 18, 7).tiles;
    assert.ok(crowded.every((t) => t.z === crowded[0]!.z), "flowers and melds always lie in one single row");
    const all = meldLayout([8, 4, 4, 4, 4], 8, 1, { bonusFirst: true });
    assert.equal(new Set(all.tiles.map((t) => t.z)).size, 1, "even a crowded lane never wraps; the tiles shrink instead");
    const withBonus = meldLayout([2, 3], 6, 10, { bonusFirst: true });
    const plain = meldLayout([2, 3], 6, 10);
    assert.ok(withBonus.tiles[2]!.x - withBonus.tiles[1]!.x > plain.tiles[2]!.x - plain.tiles[1]!.x, "a wider space after the bonus tiles");
    assert.ok(meldLayout([3, 3, 3, 3], 6, 1).scale >= 0.85, "four pungs stay large");
  });

  it("lays a kong as a pung with the fourth tile on top of the middle one", () => {
    const kong = meldLayout([4], 12, 10, { kongs: [0] }).tiles;
    const pung = meldLayout([3], 12, 10).tiles;
    assert.deepEqual(kong.map((t) => t.level), [0, 0, 0, 1]);
    assert.equal(kong[3]!.x, kong[1]!.x, "the fourth tile lies over the middle tile");
    assert.equal(kong[3]!.z, kong[1]!.z);
    assert.deepEqual(kong.slice(0, 3).map(({ x, z }) => ({ x, z })), pung.map(({ x, z }) => ({ x, z })), "it takes the room of a pung");
    const next = meldLayout([4, 3], 12, 7, { kongs: [0] }).tiles;
    const afterPung = meldLayout([3, 3], 12, 7).tiles;
    assert.equal(next[4]!.x, afterPung[3]!.x, "the next meld follows as after a pung");
  });
});

describe("wall draw order (I p. 18-19)", () => {
  interface Entry {
    readonly rel: number;
    readonly slot: number;
    readonly level: number;
  }
  const order = (rel: number, count: number): Entry[] => wallDrawOrder(rel, count);

  it("covers all 144 tiles exactly once", () => {
    const keys = new Set(order(2, 7).map((t) => `${t.rel}:${t.slot}:${t.level}`));
    assert.equal(keys.size, 144);
  });

  it("opens just left of the break, taking the top tile before the one beneath", () => {
    // Ten stacks counted from the right: stacks 0-9 lie right of the break,
    // so the first draw is stack 10 (the next one to its left), top first.
    const first = order(0, 10).slice(0, 4);
    assert.deepEqual(first, [
      { rel: 0, slot: 10, level: 1 },
      { rel: 0, slot: 10, level: 0 },
      { rel: 0, slot: 11, level: 1 },
      { rel: 0, slot: 11, level: 0 },
    ]);
  });

  it("runs left to the wall's end, then into the wall on the builder's left", () => {
    const list = order(0, 10);
    // 8 stacks remain left of the break: 16 tiles, then the next wall at its right end.
    assert.deepEqual(list[15], { rel: 0, slot: 17, level: 0 });
    assert.deepEqual(list[16], { rel: 3, slot: 0, level: 1 });
    // The left-hand neighbour of rel 1 is rel 0; of rel 0 it is rel 3 (play runs E,S,W,N anticlockwise).
    assert.equal(order(1, 5)[26].rel, 0);
  });

  it("ends beside the break on its right, where replacements are taken", () => {
    const list = order(0, 10);
    assert.deepEqual(list.at(-1), { rel: 0, slot: 9, level: 0 });
    assert.deepEqual(list.at(-2), { rel: 0, slot: 9, level: 1 });
  });

  it("breaks the wall the book's table names", () => {
    const seats = new Map<number, number>();
    for (let n = 0; n < 400; n++) {
      const b = breakFor(`k${n}`);
      assert.ok(b.total >= 2 && b.total <= 12 && b.count === b.total);
      const named = [0, 1, 2, 3].map((w) => [[5, 9], [2, 6, 10], [3, 7, 11], [4, 8, 12]][w]!.includes(b.total));
      assert.ok(named[b.wallSeat], `${b.total} -> ${b.wallSeat}`);
      seats.set(b.wallSeat, (seats.get(b.wallSeat) ?? 0) + 1);
    }
    assert.equal(seats.size, 4);
  });
});
