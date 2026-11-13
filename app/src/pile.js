/**
 * The centre pile (#122): every discard thrown into one shared pond around
 * the console, the way a real table plays it, instead of six-wide rows in
 * front of each seat. Nothing in the pile says who threw a tile or when.
 *
 * Plain numbers, no 3D library, so `test/app/pile.test.ts` can prove the
 * pile never overlaps itself, the console, the walls, hands or melds.
 *
 * A simple physics, deterministic: the same discards always settle the same
 * way, so a reload, a replay or a review board shows the same pile.
 *
 *   - The first tile lands just in front of the console on the thrower's
 *     side. Every later throw aims at a tile already in the pile near the
 *     thrower's side (a seeded pick among the nearest few), a little short of
 *     it, with a seeded scatter and a seeded turn.
 *   - Where the throw lands on tiles, it knocks them: each tile it touches is
 *     pushed a short way along the throw, if it has room to go. The thrown
 *     tile then slides back along its throw until it lies clear.
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
  /** The console square the pile keeps off, with a margin. */
  CONSOLE_HALF: TABLE.CENTER_HALF + 0.12,
  /** No corner of a pile tile goes past this, well inside the walls. */
  OUTER: WALL_INNER - 0.75,
  /** Where a throw starts, in the thrower's frame (z). */
  START_Z: WALL_INNER - 0.4,
  /** How far a knocked tile moves, at most. */
  PUSH: 0.42,
  /** The step the thrown tile slides back by until it lies clear. */
  BACK_STEP: 0.1,
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

const CONSOLE = (() => {
  const c = PILE.CONSOLE_HALF;
  return [
    { x: -c, z: -c },
    { x: c, z: -c },
    { x: c, z: c },
    { x: -c, z: c },
  ];
})();

/** True when the tile lies inside the pond: off the console and within the outer edge. */
export function inPond(pose) {
  const points = corners(pose);
  if (points.some((point) => Math.abs(point.x) > PILE.OUTER || Math.abs(point.z) > PILE.OUTER)) return false;
  return !polygonsOverlap(points, CONSOLE);
}

/** Two tiles further apart than this cannot touch: the quick test before the exact one. */
const REACH = 2 * Math.hypot(HALF_W, HALF_H) + PILE.GAP;

function touches(a, b) {
  return Math.abs(a.x - b.x) < REACH && Math.abs(a.z - b.z) < REACH && polygonsOverlap(a.points, b.points, PILE.GAP);
}

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
 * `{ x, z, angle, landX, landZ, live }`. `x`, `z`, `angle` are where the tile
 * finally lies once every later throw has knocked it; `landX`, `landZ` are
 * where its own throw first touched down, before it slid clear; `live` is
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
        return { x: now.x, z: now.z, angle: now.angle, landX: tile.landX, landZ: tile.landZ, live: !entry.taken };
      });
    },
  };
}

/** One throw onto the pile `before` (left untouched); the pile after it and the thrown tile. */
function throwTile(entry, index, seed, before) {
  const live = before.map((tile) => ({ ...tile }));
  const tag = `${seed}|${index}|${entry.key}`;
  const start = toTable(entry.rel, 0, PILE.START_Z);
  // A spot beside the console, anywhere but straight across from the thrower, so the
  // four seats' tiles mix: the pile has no side that belongs to anyone.
  const around = Math.atan2(start.z, start.x) + (unit(`${tag}|around`) - 0.5) * Math.PI * 1.5;
  const ring = PILE.CONSOLE_HALF + HALF_H + 0.4 + unit(`${tag}|ring`) * 1.2;
  const front = { x: Math.cos(around) * ring, z: Math.sin(around) * ring };

  // Aim: that spot on the first throw, else close beside one of the tiles nearest to it.
  let aim = front;
  if (live.length > 0) {
    const near = [...live].sort((a, b) => dist(a, front) - dist(b, front) || a.index - b.index).slice(0, 4);
    const anchor = near[Math.floor(unit(`${tag}|anchor`) * near.length)];
    const side = unit(`${tag}|side`) * Math.PI * 2;
    const close = 1.1 + unit(`${tag}|close`) * 0.5;
    aim = { x: anchor.x + Math.cos(side) * close, z: anchor.z + Math.sin(side) * close };
  }
  aim = {
    x: aim.x + (unit(`${tag}|ax`) - 0.5) * 0.9,
    z: aim.z + (unit(`${tag}|az`) - 0.5) * 0.9,
  };
  const facing = (entry.rel * Math.PI) / 2;
  // Square to the thrower or a quarter turn off, then a little askew: it landed as it fell.
  const angle = facing + (unit(`${tag}|quarter`) < 0.3 ? Math.PI / 2 : 0) + (unit(`${tag}|turn`) - 0.5) * 0.6;
  const along = unitVector(start, aim);

  // Knock the tiles the throw lands on.
  const land = placed({ x: aim.x, z: aim.z, angle });
  for (const other of live) {
    if (!touches(land, other)) continue;
    for (const share of [1, 0.5, 0.25]) {
      const moved = placed({
        x: other.x + along.x * PILE.PUSH * share,
        z: other.z + along.z * PILE.PUSH * share,
        angle: other.angle + (unit(`${tag}|spin|${other.index}`) - 0.5) * 0.18 * share,
      });
      if (clear(moved, live, other)) {
        Object.assign(other, moved);
        break;
      }
    }
  }

  // Slide back along the throw until clear; if the pile is too full there, the nearest free spot.
  let pose = null;
  for (let step = 0; step <= 100; step++) {
    const candidate = placed({
      x: aim.x - along.x * PILE.BACK_STEP * step,
      z: aim.z - along.z * PILE.BACK_STEP * step,
      angle,
    });
    if (clear(candidate, live)) {
      pose = candidate;
      break;
    }
  }
  if (pose === null) pose = nearestFree(aim, angle, live, facing);

  const tile = { index, ...pose, landX: aim.x, landZ: aim.z };
  if (!entry.taken) live.push(tile);
  return { live, tile };
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
  for (let radius = 0.3; radius < 2 * PILE.OUTER; radius += 0.3) {
    const tries = Math.max(8, Math.round(radius * 8));
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
