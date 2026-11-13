/**
 * The centre pile (#122): however a hand runs, no two discards in the pile
 * overlap, every one stays inside the walls, clear of the
 * walls, hands and melds, and the same discards always settle the same way.
 * The pile has the whole middle: the console is put away in this layout.
 * `app/src/pile.js` is plain numbers, so this needs no browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { corners, createPile, inPond, PILE, pileReach, polygonsOverlap, settlePile } from "../../app/src/pile.js";
// @ts-expect-error - a plain browser module without type declarations
import { handRects, meldRects, TABLE, WALL_INNER, wallRects } from "../../app/src/layout.js";

interface Pose {
  readonly x: number;
  readonly z: number;
  readonly angle: number;
  readonly fromX: number;
  readonly fromZ: number;
  readonly live: boolean;
}
interface Entry {
  rel: number;
  key: string;
  taken: boolean;
}
interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const KEYS = ["b1", "c5", "o9", "wE", "dR", "s2", "c7", "o3"];

/** A hand's pond: `count` discards round the table, about one in eleven claimed. */
function pondFor(seed: number, count: number): Entry[] {
  const pond: Entry[] = [];
  let rel = seed % 4;
  for (let index = 0; index < count; index++) {
    pond.push({ rel, key: KEYS[(index * 5 + seed) % KEYS.length]!, taken: (index * 13 + seed) % 11 === 0 });
    // Mostly in turn, now and then a claim moves the turn on.
    rel = (rel + ((index + seed) % 7 === 0 ? 2 : 1)) % 4;
  }
  return pond;
}

function box(pose: Pose): Rect {
  const points = corners(pose) as { x: number; z: number }[];
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}

function touch(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

describe("the centre pile", () => {
  // A hand has at most about 75 discards on the table; 90 leaves room.
  const HANDS = Array.from({ length: 24 }, (_, seed) => ({ seed, pond: pondFor(seed, 90) }));

  it("never lets two tiles overlap, and keeps every tile inside the walls", () => {
    for (const { seed, pond } of HANDS) {
      const poses: Pose[] = settlePile(pond, `hand-${seed}`);
      assert.equal(poses.length, pond.length);
      const live = poses.filter((pose) => pose.live);
      assert.equal(live.length, pond.filter((entry) => !entry.taken).length);
      for (const pose of live) {
        assert.ok(inPond(pose), `hand ${seed}: a tile left the pond`);
        for (const point of corners(pose) as { x: number; z: number }[]) {
          assert.ok(Math.abs(point.x) < WALL_INNER && Math.abs(point.z) < WALL_INNER, `hand ${seed}: a tile reaches the walls`);
        }
      }
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          assert.equal(polygonsOverlap(corners(live[i]), corners(live[j])), false, `hand ${seed}: tiles ${i} and ${j} overlap`);
        }
      }
    }
  });

  it("stays clear of the walls, the hands and the melds", () => {
    const solid: Rect[] = [];
    const slots = Array.from({ length: TABLE.WALL_STACKS }, (_, i) => i);
    for (let rel = 0; rel < 4; rel++) {
      solid.push(...wallRects(rel, slots), ...handRects(rel, 13));
      for (const walls of [18, 12, 6, 0]) solid.push(...meldRects(rel, [4, 3, 3, 3], walls, 1, { bonusFirst: true }));
    }
    for (const { seed, pond } of HANDS.slice(0, 8)) {
      for (const pose of (settlePile(pond, `hand-${seed}`) as Pose[]).filter((p) => p.live)) {
        for (const rect of solid) assert.equal(touch(box(pose), rect), false, `hand ${seed}: a pile tile touches the furniture`);
      }
    }
    assert.ok(PILE.OUTER < WALL_INNER);
  });

  it("settles the same discards the same way, and the incremental pile agrees with a fresh one", () => {
    const pond = pondFor(5, 60);
    assert.deepEqual(settlePile(pond, "same"), settlePile(pond, "same"));
    assert.notDeepEqual(settlePile(pond, "same"), settlePile(pond, "other"), "the hand's seed shapes the pile");

    // Discard by discard, as the table plays it; a claim marks the latest one taken.
    const pile = createPile("same");
    const growing: Entry[] = [];
    for (const entry of pond) {
      growing.push({ ...entry, taken: false });
      pile.settle(growing);
      if (entry.taken) {
        growing[growing.length - 1]!.taken = true;
        pile.settle(growing);
      }
    }
    assert.deepEqual(pile.settle(growing), settlePile(pond, "same"));
  });

  it("knocks a tile at most a short push per throw", () => {
    const pond = pondFor(9, 40);
    const pile = createPile("knock");
    let before: Pose[] = pile.settle(pond.slice(0, 1));
    for (let n = 2; n <= pond.length; n++) {
      const after: Pose[] = pile.settle(pond.slice(0, n));
      for (let i = 0; i < n - 1; i++) {
        const moved = Math.hypot(after[i]!.x - before[i]!.x, after[i]!.z - before[i]!.z);
        assert.ok(moved <= PILE.PUSH + 1e-9, `throw ${n} moved tile ${i} by ${moved}`);
      }
      before = after;
    }
  });

  it("slides every throw on a straight line that passes through no tile", () => {
    for (const seed of [2, 7, 11]) {
      const pond = pondFor(seed, 70);
      let before: Pose[] = [];
      const pile = createPile(`slide-${seed}`);
      for (let n = 1; n <= pond.length; n++) {
        const after: Pose[] = pile.settle(pond.slice(0, n));
        const thrown = after[n - 1]!;
        const length = Math.hypot(thrown.x - thrown.fromX, thrown.z - thrown.fromZ);
        const steps = Math.max(1, Math.ceil(length / 0.04));
        for (let step = 0; step <= steps; step++) {
          const k = step / steps;
          const at = { x: thrown.fromX + (thrown.x - thrown.fromX) * k, z: thrown.fromZ + (thrown.z - thrown.fromZ) * k, angle: thrown.angle };
          assert.ok(inPond(at), `hand ${seed}, throw ${n}: the slide leaves the table`);
          for (const [i, tile] of before.entries()) {
            if (!tile.live) continue;
            assert.equal(polygonsOverlap(corners(at), corners(tile)), false, `hand ${seed}, throw ${n} slides through tile ${i}`);
          }
        }
        before = after;
      }
    }
  });

  it("frames the zoomed view on the pile", () => {
    const poses: Pose[] = settlePile(pondFor(3, 70), "reach");
    const reach = pileReach(poses.filter((p) => p.live));
    assert.ok(reach <= PILE.OUTER + 1e-9);
    assert.ok(reach >= pileReach([]));
  });
});
