/**
 * Where the seat labels go on the screen with the centre pile (#122).
 *
 * A label may cover bare felt, the loose tiles' end of the wall (the dead
 * wall) or an empty stretch where a wall stood, but never a discard, a
 * claimed meld or bonus tile, a player's wall, the hand strip or one of the
 * screen's panels. The labels keep their size on the screen while the table
 * grows and shrinks with the screen and the pond zoom, so their places are
 * found on the screen, every time the view or the table changes:
 *
 *   - the board offers each seat's spots, best first (`candidates`): on the
 *     felt on the seat's side of the pile, nearest the pond and the seat's
 *     middle first, then further out, then out where its wall stands;
 *   - each label takes the first spot where it lies wholly on the screen and
 *     clear of every `obstacle` (screen rectangles: the tiles it must never
 *     cover, the panels) and of the labels placed before it;
 *   - when no spot is clear (a packed table), the one it overlaps least.
 *
 * Plain numbers in CSS pixels, so `test/app/label-place.test.ts` needs no
 * browser.
 */

/** Pixels kept between a label and what it must not cover, and the screen's edge. */
export const LABEL_GAP = 3;

/** A label of `width` x `height` centred on `at`, as a rectangle. */
export function labelRect(at, width, height) {
  return { left: at.x - width / 2, top: at.y - height / 2, right: at.x + width / 2, bottom: at.y + height / 2 };
}

/** How many square pixels two rectangles share, with `gap` added round `a`. */
export function overlapArea(a, b, gap = 0) {
  const w = Math.min(a.right + gap, b.right) - Math.max(a.left - gap, b.left);
  const h = Math.min(a.bottom + gap, b.bottom) - Math.max(a.top - gap, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The screen rectangle round some projected points ({ x, y }). */
export function boundsOf(points) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return { left, top, right, bottom };
}

/**
 * Place every label. `labels` is a list of `{ width, height, candidates }`,
 * `candidates` the label's screen spots best first; `obstacles` the screen
 * rectangles no label may cover; `view` the screen's `{ width, height }`.
 * Returns one `{ x, y, clear }` per label, its centre, in order.
 */
export function placeLabels({ labels, obstacles, view }) {
  const taken = [];
  return labels.map(({ width, height, candidates }) => {
    let best = null;
    for (const at of candidates) {
      const rect = labelRect(at, width, height);
      const onScreen =
        rect.left >= LABEL_GAP && rect.top >= LABEL_GAP && rect.right <= view.width - LABEL_GAP && rect.bottom <= view.height - LABEL_GAP;
      if (!onScreen) continue;
      let cost = 0;
      for (const other of taken) cost += overlapArea(rect, other, LABEL_GAP) * 4;
      for (const obstacle of obstacles) {
        cost += overlapArea(rect, obstacle, LABEL_GAP);
        if (best !== null && cost >= best.cost) break;
      }
      if (best === null || cost < best.cost) best = { at, cost, rect };
      if (cost === 0) break;
    }
    if (best === null) {
      // No spot on the screen at all: the first, kept on the screen.
      const at = candidates[0] ?? { x: view.width / 2, y: view.height / 2 };
      const x = Math.min(Math.max(at.x, width / 2 + LABEL_GAP), view.width - width / 2 - LABEL_GAP);
      const y = Math.min(Math.max(at.y, height / 2 + LABEL_GAP), view.height - height / 2 - LABEL_GAP);
      best = { at: { x, y }, cost: Infinity, rect: labelRect({ x, y }, width, height) };
    }
    taken.push(best.rect);
    return { x: best.at.x, y: best.at.y, clear: best.cost === 0 };
  });
}
