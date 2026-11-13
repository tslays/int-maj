/**
 * Where a seat label goes on the screen with the centre pile (#122).
 *
 * Each label is the seat's wind letter alone, with one fixed place: on top of
 * its seat's wall, at the wall's dead centre (layout.js `WALL_TOP_CENTRE`).
 * It never moves as tiles are thrown, claimed or drawn from the wall; only
 * the camera moves it. A label whose place is off the screen (the zoomed view
 * can cut a wall off) is not shown.
 *
 * Plain numbers in CSS pixels, so `test/app/label-place.test.ts` needs no
 * browser.
 */

/**
 * The centre of a label `width` by `height`, centred on `anchor` (the top
 * centre of its wall on the screen), and `shown`: whether it lies wholly on a
 * `view` of `{ width, height }`.
 */
export function placeLabel({ anchor, width, height, view }) {
  const inside = (value, half, size) => value - half >= 0 && value + half <= size;
  return { x: anchor.x, y: anchor.y, shown: inside(anchor.x, width / 2, view.width) && inside(anchor.y, height / 2, view.height) };
}
