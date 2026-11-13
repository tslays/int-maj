/**
 * The centre pile (#122): every discard thrown into one shared pond in the
 * middle of the table, the way a real table plays it, instead of six-wide
 * rows in front of each seat. Nothing in the pile says who threw a tile or
 * when. With the pile the middle console is put away (each seat's wind and
 * score move to a label at its edge), so the pile has the whole centre.
 *
 * Plain numbers, no 3D library, so `test/app/pile.test.ts` can prove the
 * pile never overlaps itself, the walls, hands or melds.
 *
 * A simple physics, deterministic: the same discards always settle the same
 * way, so a reload, a replay or a review board shows the same pile.
 *
 *   - Each throw meets the felt in the lane just inside the thrower's wall,
 *     at a clear spot, and slides in a straight line towards the pile: on
 *     the first throw towards a spot near the middle, after that towards a
 *     tile near such a spot (seeded picks, a seeded scatter and turn).
 *   - It stops just short of the first tile it would touch, checked every
 *     `STEP` along the way, so it never passes through one. The tiles it
 *     crashes into are knocked on along the throw, each until it meets
 *     another or has gone `PUSH`. A slide that meets nothing stops at its aim.
 *   - A tile claimed by another player leaves the pile at once; the knocks
 *     its throw gave stay.
 *
 * Coordinates are table space as in layout.js (one unit is a tile's width;
 * the viewer sits at +z). `rel` is the thrower's seat relative to the viewer.
 */

import { H, TABLE, W, WALL_INNER, toTable } from "./layout.js";

const S = TABLE.DISCARD_SCALE;
const HALF_W = (W * S) / 2;
const HALF_H = (H * S) / 2;

export const PILE = Object.freeze({
  /** No corner of a pile tile goes past this, just inside the walls. */
  OUTER: WALL_INNER - 0.08,
  /** Where a throw meets the felt, in the thrower's frame (z): the lane just inside its wall. */
  START_Z: WALL_INNER - 0.95,
  /** How finely a slide is checked: a moving tile never passes through another. */
  STEP: 0.05,
  /** How far a knocked tile moves, at most. */
  PUSH: 0.42,
  /** Clearance kept between tiles. */
  GAP: 0.04,
});

/* ------------------------------------------------------------ randomness */

/** A seeded number in [0, 1) for the string `text` (FNV-1a, then a mix). */
function unit(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d) >>> 0;
  hash ^= hash >>> 12;
  return (hash >>> 0) / 0x100000000;
}

/* ------------------------------------------------------------ geometry */

/** The four corners of a pile tile at `x`, `z` turned by `angle` (radians). */
export function corners(pose) {
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return [
    [-HALF_W, -HALF_H],
    [HALF_W, -HALF_H],
    [HALF_W, HALF_H],
    [-HALF_W, HALF_H],
  ].map(([u, v]) => ({ x: pose.x + u * cos + v * sin, z: pose.z - u * sin + v * cos }));
}

function axesOf(points) {
  const axes = [];
  for (let index = 0; index < 2; index++) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    axes.push({ x: -(b.z - a.z) / length, z: (b.x - a.x) / length });
  }
  return axes;
}

function project(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.z * axis.z;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/** True when two convex polygons overlap by more than `gap` (separating axes). */
export function polygonsOverlap(a, b, gap = 0) {
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const p = project(a, axis);
    const q = project(b, axis);
    if (p.max + gap <= q.min || q.max + gap <= p.min) return false;
  }
  return true;
}

/** True when the tile lies inside the walls. */
export function inPond(pose) {
  return corners(pose).every((point) => Math.abs(point.x) <= PILE.OUTER && Math.abs(point.z) <= PILE.OUTER);
}

/** Two tiles further apart than this cannot touch: the quick test before the exact one. */
const REACH = 2 * Math.hypot(HALF_W, HALF_H) + PILE.GAP;

function touches(a, b) {
  return Math.abs(a.x - b.x) < REACH && Math.abs(a.z - b.z) < REACH && polygonsOverlap(a.points, b.points, PILE.GAP);
}

const inWalls = inPond;

function clear(pose, others, skip = null) {
  if (!inPond(pose)) return false;
  for (const other of others) {
    if (other !== skip && touches(pose, other)) return false;
  }
  return true;
}

function placed(pose) {
  return { ...pose, points: corners(pose) };
}

/* ------------------------------------------------------------ the throw */

/**
 * Settle a hand's discards into the pile.
 *
 * `pond` is every discard of the hand in throw order, `{ rel, key, taken }`
 * (`taken`: claimed by another player and gone from the table). `seed` names
 * the hand. Returns one entry per pond entry, in order:
 * `{ x, z, angle, fromX, fromZ, live }`. `x`, `z`, `angle` are where the tile
 * finally lies once every later throw has knocked it; `fromX`, `fromZ` are
 * where its own throw met the felt and began its slide (a straight line to
 * where it stopped, clear of every tile then on the table); `live` is
 * false for a taken tile (its pose is where it lay when it was claimed).
 */
export function settlePile(pond, seed) {
  return createPile(seed).settle(pond);
}

/**
 * A pile that remembers how it settled, so the next discard costs one throw
 * rather than the whole hand again: `settle(pond)` reuses every throw of the
 * last call that `pond` repeats unchanged (same tile, same thrower, same
 * `taken`), and throws only the rest. The answer is the same as `settlePile`.
 */
export function createPile(seed) {
  let done = []; // per throw: { entry, live (the pile after it), tile }
  return {
    seed,
    settle(pond) {
      let keep = 0;
      while (
        keep < done.length &&
        keep < pond.length &&
        done[keep].entry.key === pond[keep].key &&
        done[keep].entry.rel === pond[keep].rel &&
        done[keep].entry.taken === Boolean(pond[keep].taken)
      ) {
        keep += 1;
      }
      done = done.slice(0, keep);
      let live = keep === 0 ? [] : done[keep - 1].live;
      for (let index = keep; index < pond.length; index++) {
        const entry = { key: pond[index].key, rel: pond[index].rel, taken: Boolean(pond[index].taken) };
        const step = throwTile(entry, index, seed, live);
        live = step.live;
        done.push({ entry, live, tile: step.tile });
      }
      // A tile's final pose is its pose in the last pile it is part of: later knocks move it.
      const last = new Map((done.at(-1)?.live ?? []).map((tile) => [tile.index, tile]));
      return done.map(({ entry, tile }, index) => {
        const now = last.get(index) ?? tile;
        return { x: now.x, z: now.z, angle: now.angle, fromX: tile.fromX, fromZ: tile.fromZ, live: !entry.taken };
      });
    },
  };
}

/** One throw onto the pile `before` (left untouched); the pile after it and the thrown tile. */
/** Throws tried for each tile; the one that ends nearest the pile's middle is the one made. */
const TRIES = 6;

function throwTile(entry, index, seed, before) {
  const live = before.map((tile) => ({ ...tile }));
  const tag = `${seed}|${index}|${entry.key}`;
  const facing = (entry.rel * Math.PI) / 2;
  // Square to the thrower or a quarter turn off, then a little askew: it lands as it fell.
  const angle = facing + (unit(`${tag}|quarter`) < 0.3 ? Math.PI / 2 : 0) + (unit(`${tag}|turn`) - 0.5) * 0.6;
  // Players aim for the heart of the pile: of a few seeded throws, the one that ends nearest it.
  const middle = live.length === 0 ? { x: 0, z: 0 } : {
    x: live.reduce((sum, tile) => sum + tile.x, 0) / live.length,
    z: live.reduce((sum, tile) => sum + tile.z, 0) / live.length,
  };
  let best = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const slide = slideOf(entry, `${tag}|${attempt}`, angle, live);
    if (slide === null) continue;
    const score = dist(slide.pose, middle);
    if (best === null || score < best.score - 1e-9) best = { ...slide, score };
  }

  let pose;
  let start;
  if (best === null) {
    // The lane is full where this seat throws (a very long hand): it is laid in the nearest gap.
    pose = nearestFree(middle, angle, live, facing);
    start = pose;
  } else {
    ({ pose, start } = best);
    // The tiles it crashed into are knocked on along the throw, each until it meets another.
    for (const other of best.hit) {
      let moved = other;
      for (let travelled = PILE.STEP; travelled <= PILE.PUSH + 1e-9; travelled += PILE.STEP) {
        const next = placed({ x: other.x + best.along.x * travelled, z: other.z + best.along.z * travelled, angle: other.angle });
        if (!inWalls(next) || touches(next, pose) || live.some((tile) => tile !== other && touches(next, tile))) break;
        moved = next;
      }
      Object.assign(other, { x: moved.x, z: moved.z, points: moved.points });
    }
  }

  const tile = { index, ...pose, fromX: start.x, fromZ: start.z };
  if (!entry.taken) live.push(tile);
  return { live, tile };
}

/**
 * One possible throw: it meets the felt at a clear spot in the lane inside the
 * thrower's wall and slides straight at a tile near the middle (on the first
 * throw, at a spot near the middle), stopping just short of the first tile it
 * would touch. Null when the lane has no clear spot.
 */
function slideOf(entry, tag, angle, live) {
  const lane = (unit(`${tag}|lane`) - 0.5) * 7;
  let start = null;
  for (const shift of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3, -3, 3.6, -3.6]) {
    const at = toTable(entry.rel, lane + shift, PILE.START_Z);
    const candidate = placed({ x: at.x, z: at.z, angle });
    if (clear(candidate, live)) {
      start = candidate;
      break;
    }
  }
  if (start === null) return null;

  const around = unit(`${tag}|around`) * Math.PI * 2;
  const ring = unit(`${tag}|ring`) * 1.6;
  const spot = { x: Math.cos(around) * ring, z: Math.sin(around) * ring };
  let aim = spot;
  if (live.length > 0) {
    const near = [...live].sort((a, b) => dist(a, spot) - dist(b, spot) || a.index - b.index).slice(0, 3);
    aim = near[Math.floor(unit(`${tag}|anchor`) * near.length)];
  }
  aim = { x: aim.x + (unit(`${tag}|ax`) - 0.5) * 0.9, z: aim.z + (unit(`${tag}|az`) - 0.5) * 0.9 };

  const along = unitVector(start, aim);
  const length = dist(start, aim);
  let pose = start;
  let hit = [];
  for (let travelled = PILE.STEP; travelled <= length; travelled += PILE.STEP) {
    const next = placed({ x: start.x + along.x * travelled, z: start.z + along.z * travelled, angle });
    if (!inWalls(next)) break;
    hit = live.filter((other) => touches(next, other));
    if (hit.length > 0) break;
    pose = next;
  }
  return { start, pose, hit, along };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function unitVector(from, to) {
  const length = dist(from, to) || 1;
  return { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
}

/** The free spot nearest `aim` on a widening ring of tries, turned square to the thrower if need be. */
function nearestFree(aim, angle, live, facing) {
  for (let radius = 0.2; radius < 2 * PILE.OUTER; radius += 0.2) {
    const tries = Math.max(8, Math.round(radius * 12));
    for (let k = 0; k < tries; k++) {
      const a = (k / tries) * Math.PI * 2;
      for (const turn of [angle, facing + Math.PI / 2]) {
        const candidate = placed({ x: aim.x + Math.cos(a) * radius, z: aim.z + Math.sin(a) * radius, angle: turn });
        if (clear(candidate, live)) return candidate;
      }
    }
  }
  // Packed tight: sweep the whole pond, square to the table.
  for (let z = -PILE.OUTER; z <= PILE.OUTER; z += 0.1) {
    for (let x = -PILE.OUTER; x <= PILE.OUTER; x += 0.1) {
      for (const turn of [0, Math.PI / 2]) {
        const candidate = placed({ x, z, angle: turn });
        if (clear(candidate, live)) return candidate;
      }
    }
  }
  // No room at all (more discards than a hand can have): the tile lies where it was aimed.
  return placed({ x: aim.x, z: aim.z, angle });
}

/** How far from the centre the pile's tiles reach (for framing the zoomed view); at least the rows' first three. */
export function pileReach(poses) {
  let reach = TABLE.DISCARD_Z + ((H + 0.03) * S) * 3;
  for (const pose of poses) {
    for (const point of corners(pose)) reach = Math.max(reach, Math.abs(point.x), Math.abs(point.z));
  }
  return reach;
}
