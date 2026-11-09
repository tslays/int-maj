/**
 * The 3D table's discard pinwheel: however long the hand runs, no two
 * discards overlap, every discard stays inside the walls, and none covers the
 * centre console. `app/src/layout.js` is plain numbers, so this needs no
 * browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { breakFor, wallLook, wallPlan, discardRect, discardSlot, frameRect, handRects, latestPlate, pondPad, meldLayout, meldRects, TABLE, wallRects, WALL_INNER, W, H } from "../../app/src/layout.js";

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
    // The wall never slides: stacks vanish where they stand, so what is left
    // can be the right end, a run in the middle or the left end alone. The
    // lane is bounded by the highest slot still standing (`wallExtent`).
    const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
    const standing: { name: string; slots: number[] }[] = [
      { name: "all 18", slots: range(0, 18) },
      { name: "right 12", slots: range(0, 12) },
      { name: "right 6", slots: range(0, 6) },
      { name: "middle 3-9", slots: range(3, 9) },
      { name: "left 12-18", slots: range(12, 18) },
      { name: "gapped 0-2 and 8-10", slots: [0, 1, 2, 8, 9, 10] },
      { name: "none", slots: [] },
    ];
    for (const { name, slots } of standing) {
      const walls = slots.length === 0 ? 0 : Math.max(...slots) + 1;
      for (const { groups, bonusFirst, hand } of hands) {
        if (walls === 18 && groups.length > 4) continue; // twelve tiles are never laid before any wall is drawn
        const label = `wall ${name}, groups ${groups.join("+")}`;
        const melds: { rel: number; rect: Rect }[] = [];
        const solid: { what: string; rect: Rect }[] = [];
        for (let rel = 0; rel < 4; rel++) {
          for (const rect of meldRects(rel, groups, walls, hand, { bonusFirst })) melds.push({ rel, rect });
          for (const rect of wallRects(rel, slots)) solid.push({ what: `seat ${rel} wall`, rect });
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

  it("keeps the pond pads apart, inside the walls and under the first three rows' tiles only", () => {
    const pads = [0, 1, 2, 3].map((rel) => ({ rel, rect: frameRect(rel, pondPad()) }));
    for (const pad of pads) {
      assert.ok(Math.max(Math.abs(pad.rect.minX), Math.abs(pad.rect.maxX), Math.abs(pad.rect.minZ), Math.abs(pad.rect.maxZ)) <= WALL_INNER, `pad ${pad.rel} reaches a wall`);
      for (const other of pads) if (other.rel > pad.rel) assert.equal(overlaps(pad.rect, other.rect), false, `pads ${pad.rel} and ${other.rel} touch`);
      for (let index = 0; index < 18; index++) {
        const tile = discardRect(pad.rel, index);
        assert.ok(tile.minX >= pad.rect.minX - 0.2 && tile.maxX <= pad.rect.maxX + 0.2 && tile.minZ >= pad.rect.minZ - 0.2 && tile.maxZ <= pad.rect.maxZ + 0.2, `discard ${index + 1} of seat ${pad.rel} stands on its pad`);
      }
    }
  });

  it("lays the latest-discard plate round its tile, away from every other pond", () => {
    for (let rel = 0; rel < 4; rel++) {
      for (let index = 0; index < MOST; index++) {
        const plate = frameRect(rel, latestPlate(index));
        const tile = discardRect(rel, index);
        assert.ok(plate.minX < tile.minX && plate.maxX > tile.maxX && plate.minZ < tile.minZ && plate.maxZ > tile.maxZ, "the plate frames its tile");
        const edge = Math.max(Math.abs(plate.minX), Math.abs(plate.maxX), Math.abs(plate.minZ), Math.abs(plate.maxZ));
        assert.ok(edge <= WALL_INNER + 0.2, `plate ${index + 1} of seat ${rel} stays on the felt inside the walls`);
        const consoleSquare = { minX: -TABLE.CENTER_HALF, maxX: TABLE.CENTER_HALF, minZ: -TABLE.CENTER_HALF, maxZ: TABLE.CENTER_HALF };
        assert.equal(overlaps(plate, consoleSquare), false, `plate ${index + 1} of seat ${rel} lies on the console`);
        for (const other of all) {
          if (other.rel === rel && other.index === index) continue;
          if (other.rel === rel) continue;
          // At a corner the margin may slide under a neighbour's tile (flat on the felt, hidden), no further.
          const core = { minX: other.rect.minX + 0.13, maxX: other.rect.maxX - 0.13, minZ: other.rect.minZ + 0.13, maxZ: other.rect.maxZ - 0.13 };
          assert.equal(overlaps(plate, core), false, `plate ${index + 1} of seat ${rel} reaches seat ${other.rel}'s discard ${other.index + 1}`);
        }
      }
    }
  });
});

describe("wall draw (I p. 18-19 rules 6-8, p. 62)", () => {
  const key = (t: { rel: number; slot: number; level: number }) => `${t.rel}:${t.slot}:${t.level}`;
  type Plan = ReturnType<typeof wallPlan>;

  it("covers all 144 tiles exactly once: the lifted stack and the rest of the ring", () => {
    for (const count of [2, 7, 12]) {
      const plan = wallPlan(2, count);
      const keys = new Set([
        ...plan.tiles.map(key),
        `${plan.lifted.rel}:${plan.lifted.slot}:0`,
        `${plan.lifted.rel}:${plan.lifted.slot}:1`,
      ]);
      assert.equal(keys.size, 144, `count ${count}`);
      assert.equal(plan.tiles.length, 142);
    }
  });

  it("lifts the stack counted from the right-hand end and draws from just left of it, top tile first", () => {
    // Ten stacks counted from the right: slot 9 is the stack "10" of the book's detail.
    const plan = wallPlan(0, 10);
    assert.deepEqual(plan.lifted, { rel: 0, slot: 9 });
    assert.deepEqual(plan.tiles.slice(0, 4), [
      { rel: 0, slot: 10, level: 1 },
      { rel: 0, slot: 10, level: 0 },
      { rel: 0, slot: 11, level: 1 },
      { rel: 0, slot: 11, level: 0 },
    ]);
  });

  it("runs left to the wall's end, then into the wall on the builder's left", () => {
    const plan = wallPlan(0, 10);
    // 8 stacks remain left of the break: 16 tiles, then the next wall at its right end.
    assert.deepEqual(plan.tiles[15], { rel: 0, slot: 17, level: 0 });
    assert.deepEqual(plan.tiles[16], { rel: 3, slot: 0, level: 1 });
    // The left-hand neighbour of rel 1 is rel 0 (play runs E, S, W, N anticlockwise).
    assert.equal(wallPlan(1, 5).tiles[26]!.rel, 0);
  });

  it("ends beside the break on its right: that is where the replacements start", () => {
    const plan = wallPlan(0, 10);
    assert.deepEqual(plan.tiles.at(-1), { rel: 0, slot: 8, level: 0 });
    assert.deepEqual(plan.tiles.at(-2), { rel: 0, slot: 8, level: 1 });
  });

  /** The marker column and the height the whole wall shows at `r` replacements taken. */
  const look = (plan: Plan, r: number, front = 53) => {
    const held = 2 - (r % 2);
    const l = wallLook(plan, front, r, held);
    const m = l.markers;
    assert.equal(m.length, held);
    assert.ok(m.every((t) => t.rel === m[0]!.rel && t.slot === m[0]!.slot), "both loose tiles share one column");
    const standing = plan.tiles.slice(l.goneHead, plan.tiles.length - l.goneTail);
    const heights = new Map<string, number>();
    for (const t of standing) heights.set(`${t.rel}:${t.slot}`, (heights.get(`${t.rel}:${t.slot}`) ?? 0) + 1);
    for (const t of m) heights.set(`${t.rel}:${t.slot}`, (heights.get(`${t.rel}:${t.slot}`) ?? 0) + 1);
    return { rel: m[0]!.rel, slot: m[0]!.slot, high: heights.get(`${m[0]!.rel}:${m[0]!.slot}`)!, heights };
  };

  it("puts both loose tiles on the dead wall's column touching the break: 4 high at the start (#60)", () => {
    const plan = wallPlan(0, 10); // break at slot 9: the column touching it is slot 8
    const got = look(plan, 0);
    assert.deepEqual([got.rel, got.slot, got.high], [0, 8, 4]);
    assert.deepEqual(wallLook(plan, 53, 0, 2).markers, [
      { which: "far", rel: 0, slot: 8, level: 2 },
      { which: "near", rel: 0, slot: 8, level: 3 },
    ]);
    assert.equal(wallLook(plan, 53, 0, 2).goneTail, 0, "the dead wall has not been touched");
  });

  it("moves the marker away from the break one column per two replacements, r = 0..10, for several breaks", () => {
    for (const [rel, count] of [[0, 10], [0, 7], [1, 12], [2, 4], [3, 9]] as const) {
      const plan = wallPlan(rel, count);
      for (let r = 0; r <= 10; r++) {
        // The column floor(r / 2) away from the break, going away from it: slot count - 2 - k on the broken
        // wall, and across the corner onto the wall at the builder's right (its slot 17 downwards).
        const k = Math.floor(r / 2);
        const onWall = count - 2 - k;
        const want = onWall >= 0 ? { rel, slot: onWall } : { rel: (rel + 1) % 4, slot: 17 - (k - (count - 1)) };
        const got = look(plan, r);
        assert.deepEqual({ rel: got.rel, slot: got.slot }, want, `break ${count} on rel ${rel}, r ${r}`);
        assert.equal(got.high, r % 2 === 0 ? 4 : 3, `break ${count}, r ${r}: height`);
      }
    }
  });

  it("crosses the corner when the break is near it, still one marker column", () => {
    const plan = wallPlan(0, 3); // columns right of the break: slots 1, 0, then the next wall
    const slots = [0, 2, 4, 6].map((r) => look(plan, r)).map((g) => `${g.rel}:${g.slot}`);
    assert.deepEqual(slots, ["0:1", "0:0", "1:17", "1:16"]);
  });

  it("never shows a column other than the marker above 2 high, and the rest does not move", () => {
    for (const [rel, count] of [[0, 10], [0, 3], [2, 12]] as const) {
      const plan = wallPlan(rel, count);
      for (let r = 0; r <= 14; r++) {
        const got = look(plan, r);
        for (const [column, high] of got.heights) {
          if (column !== `${got.rel}:${got.slot}`) assert.ok(high <= 2, `break ${count} r ${r}: ${column} is ${high} high`);
        }
        assert.equal(wallLook(plan, 53, r, 2 - (r % 2)).goneHead, 53, "ordinary draws are unaffected");
      }
    }
  });

  it("leaves no tile over: ordinary draws and replacements meet and every tile is gone", () => {
    for (const count of [2, 6, 12]) {
      const plan = wallPlan(3, count);
      for (const used of [0, 10, 40, 140]) {
        const front = 142 - used;
        const l = wallLook(plan, front, used + 2, 0);
        assert.equal(plan.tiles.length - l.goneHead - l.goneTail, 0, `count ${count} used ${used}`);
      }
    }
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
