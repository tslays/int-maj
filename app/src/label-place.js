/**
 * Where a seat label goes on the screen with the centre pile (#122): never
 * over the felt the pile can cover.
 *
 * The labels keep their size on the screen while the table grows and shrinks
 * with the screen, the camera and the pond zoom, so no patch of felt measured
 * in table units can be kept for them. Instead the board projects the box the
 * pile can ever fill (the felt inside the walls, up to a lying tile's height)
 * onto the screen, and each label starts at the middle of its seat's wall's
 * inner face and moves straight out from the table's centre until it is
 * clear of that box: onto its wall and the backs of the hand behind it. A
 * label that would leave the screen (a wall the zoomed view has cut off) is
 * kept on it, and then slides along the screen's edge to the nearest place
 * clear of the pile's tiles themselves (`tiles`, each one's top on the
 * screen): the round pile leaves the felt's corners open.
 *
 * Plain numbers in CSS pixels, so `test/app/label-place.test.ts` needs no
 * browser.
 */

/** Pixels kept between a label and the pile's box, and between a label and the screen's edge. */
export const LABEL_GAP = 4;
export const SCREEN_MARGIN = 4;

/** The convex hull of `points` ({ x, y }), anticlockwise on the screen (monotone chain). */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function rectCorners(centre, width, height) {
  const w = width / 2;
  const h = height / 2;
  return [
    { x: centre.x - w, y: centre.y - h },
    { x: centre.x + w, y: centre.y - h },
    { x: centre.x + w, y: centre.y + h },
    { x: centre.x - w, y: centre.y + h },
  ];
}

function axes(polygon) {
  return polygon.map((a, index) => {
    const b = polygon[(index + 1) % polygon.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  });
}

function span(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/** True when the two convex polygons come within `gap` pixels of each other (separating axes). */
export function screenOverlap(a, b, gap = 0) {
  for (const axis of [...axes(a), ...axes(b)]) {
    const p = span(a, axis);
    const q = span(b, axis);
    if (p.max + gap <= q.min || q.max + gap <= p.min) return false;
  }
  return true;
}

/**
 * The centre of a `width` x `height` label: from `anchor` (its wall's inner
 * face) straight out, away from `centre` (the table's middle), until it is
 * clear of `hull` (the pile's box on the screen); then kept on a `view` of
 * `{ width, height }`. All in CSS pixels.
 */
export function placeLabel({ anchor, centre, hull, tiles = [], width, height, view }) {
  let dx = anchor.x - centre.x;
  let dy = anchor.y - centre.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    dx = 0;
    dy = 1;
  } else {
    dx /= length;
    dy /= length;
  }
  // Far enough to clear any box on the screen: past it, the label is surely clear.
  const limit = Math.hypot(view.width, view.height) + width + height;
  let at = anchor;
  for (let travelled = 0; travelled <= limit; travelled += 1) {
    at = { x: anchor.x + dx * travelled, y: anchor.y + dy * travelled };
    if (!screenOverlap(rectCorners(at, width, height), hull, LABEL_GAP)) break;
  }
  const kept = keep(at, width, height, view);
  if (Math.hypot(kept.x - at.x, kept.y - at.y) < 0.5) return kept;
  // Kept on the screen, so over the felt: along the edge it was pushed against, the nearest
  // place clear of every tile (or where it was kept, when there is none).
  const clearOfTiles = (point) => {
    const rect = rectCorners(point, width, height);
    return tiles.every((tile) => !screenOverlap(rect, tile, LABEL_GAP));
  };
  if (clearOfTiles(kept)) return kept;
  const along = Math.abs(kept.y - at.y) > Math.abs(kept.x - at.x) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const reach = along.x !== 0 ? view.width : view.height;
  for (let shift = 2; shift <= reach; shift += 2) {
    for (const sign of [1, -1]) {
      const moved = { x: kept.x + along.x * shift * sign, y: kept.y + along.y * shift * sign };
      const held = keep(moved, width, height, view);
      if (Math.hypot(held.x - moved.x, held.y - moved.y) < 0.5 && clearOfTiles(held)) return held;
    }
  }
  return kept;
}

/** The label's centre, moved the least to keep the whole label on a `view` (CSS pixels). */
function keep(at, width, height, view) {
  const clamp = (value, half, size) => Math.min(Math.max(value, half + SCREEN_MARGIN), Math.max(half + SCREEN_MARGIN, size - half - SCREEN_MARGIN));
  return { x: clamp(at.x, width / 2, view.width), y: clamp(at.y, height / 2, view.height) };
}
