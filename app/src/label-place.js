/**
 * Where a seat label goes on the screen with the centre pile (#122).
 *
 * Each label has one fixed place on the table: against the inside of its
 * seat's wall, in the middle (layout.js `labelPad`, a strip of felt the pile
 * keeps clear). It never moves as tiles are thrown or claimed; only the
 * camera moves it. The seats to the sides turn theirs on end, along their
 * wall; the seat across lies half over its wall.
 *
 * `anchor` is the middle of the wall's inner face on the screen, `centre` the
 * table's middle. The label's outer edge goes `over` of its depth past the
 * anchor, out towards the wall, and the rest lies on the felt. A label whose
 * place is off the screen (the zoomed view can cut a wall off) is not shown:
 * kept on the screen it would lie over the pile.
 *
 * Plain numbers in CSS pixels, so `test/app/label-place.test.ts` needs no
 * browser.
 */

/** Pixels kept between a label and its wall's face, and between a label and the screen's edge. */
export const LABEL_GAP = 3;

/**
 * The centre of a label `width` long and `height` deep (before it is turned;
 * `turned` labels stand on end on the screen), from its wall's `anchor`
 * towards the table's `centre`, and `shown`: whether it lies wholly on a
 * `view` of `{ width, height }`.
 */
export function placeLabel({ anchor, centre, width, height, turned = false, over = 0, view }) {
  let dx = centre.x - anchor.x;
  let dy = centre.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    dx = 0;
    dy = -1;
  } else {
    dx /= length;
    dy /= length;
  }
  // Its depth runs from the wall towards the centre: `over` of it past the wall's face.
  const inward = height * (0.5 - over) + (over > 0 ? 0 : LABEL_GAP);
  const at = { x: anchor.x + dx * inward, y: anchor.y + dy * inward };
  const [across, down] = turned ? [height, width] : [width, height];
  const inside = (value, half, size) => value - half >= 0 && value + half <= size;
  return { ...at, shown: inside(at.x, across / 2, view.width) && inside(at.y, down / 2, view.height) };
}
