/**
 * Table geometry, as plain numbers: no 3D library, so the tests can check it.
 *
 * One unit is a tile's width. Each seat's things are laid out in that seat's
 * frame, as if it sat at the bottom (+z) looking at the centre; the frame is
 * then turned about the centre (rel 1 by +90 degrees, and so on).
 *
 * The discard areas form a pinwheel around the centre console. Each seat's
 * rows are exactly as wide as the console square, so the four areas meet only
 * at the corners and never overlap. Rows one to three hold six tiles; the
 * fourth row takes every later tile and runs on to the seat's right, into the
 * corner that no other seat uses.
 *
 * Melds follow the table custom: they lie in the player's own wall lane,
 * starting in the table corner on the player's left and growing to the right
 * as the wall in front of the player is used up - never inside the walls.
 */

export const W = 1;
export const H = 1.36;
export const D = 0.78;

const GAP = 0.03;
const ROW = 6;
const FULL_ROWS = 3;
const DISCARD_SCALE = 1.15;
const STEP_X = (W + GAP) * DISCARD_SCALE;
const STEP_Z = (H + GAP) * DISCARD_SCALE;
const ROW_HALF = (ROW * STEP_X) / 2;

const WALL_STACKS = 18;
const WALL_R = 11.0;

export const TABLE = Object.freeze({
  WALL_STACKS,
  // At least WALL_STACKS / 2 + H / 2, so the pinwheel walls never touch.
  WALL_R,
  HAND_Z: 12.9,
  // The console is the square the discard rows stand around.
  CENTER_HALF: ROW_HALF - 0.3,
  DISCARD_Z: ROW_HALF + 0.05,
  // Discards are drawn a little larger than the wall: they carry the game.
  DISCARD_SCALE,
  TABLE_HALF: 15.0,
  ROW,
  FULL_ROWS,
});

/** Where discard `index` lies in its seat's frame (the tile's centre). */
export function discardSlot(index) {
  const row = Math.min(Math.floor(index / ROW), FULL_ROWS);
  const column = row < FULL_ROWS ? index % ROW : index - FULL_ROWS * ROW;
  return {
    x: -ROW_HALF + STEP_X * (column + 0.5),
    z: TABLE.DISCARD_Z + STEP_Z * (row + 0.5),
  };
}

/** A seat-frame point turned into table coordinates for seat `rel`. */
export function toTable(rel, x, z) {
  const angle = (rel * Math.PI) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/** The table-space rectangle a discard covers: { minX, maxX, minZ, maxZ }. */
export function discardRect(rel, index) {
  const slot = discardSlot(index);
  const centre = toTable(rel, slot.x, slot.z);
  const across = (W * DISCARD_SCALE) / 2;
  const along = (H * DISCARD_SCALE) / 2;
  // A quarter turn swaps the tile's width and height on the table.
  const [halfX, halfZ] = rel % 2 === 0 ? [across, along] : [along, across];
  return { minX: centre.x - halfX, maxX: centre.x + halfX, minZ: centre.z - halfZ, maxZ: centre.z + halfZ };
}

/** The inner edge of the walls: discards must stay inside this square. */
export const WALL_INNER = WALL_R - H / 2;

/** Where wall stack `slot` lies in its seat's frame: slot 0 is the seat's right end. */
export function wallSlotX(slot) {
  return (WALL_STACKS / 2 - 0.5 - slot) * W - H / 2 + W / 2;
}

/** A seat's melds start in the table corner on its left, in its wall's lane. */
export const MELD_LANE_X0 = -(TABLE.TABLE_HALF - 0.35);
// Set aside tiles sit towards the rail, as they do on a real table.
export const LANE_OUT = 0.6;
const NEAR_CORNER_INSET = 2.8;
const LANE_FAR = TABLE.TABLE_HALF - 0.2;

/**
 * Lay a seat's exposed groups along its wall's lane. With `bonusFirst` the
 * first group is its flowers and seasons: hard left in the table corner, with
 * a wider space before the melds. The melds follow in the order made, each
 * new one to the right of the last. The seat's remaining wall is pushed
 * to its right end (see `wallSlotX`), so the lane grows as the wall shrinks.
 * Everything lies in one single row; when the lane is short the tiles shrink
 * to fit, never wrapping into a second row. Returns the scale and each
 * tile's centre.
 *
 * A kong (its group index listed in `kongs`) is a pung with the fourth tile
 * lying on top of the middle one: it takes the room of three tiles, and that
 * tile comes back with `level: 1`.
 */
export function meldLayout(groupSizes, wallStacks, handCount, { bonusFirst = false, rel = 0, kongs = [] } = {}) {
  // The seat on your right starts in the corner beside your own hand, which
  // your hand strip covers, so its lane begins a little further along.
  const laneStart = rel === 1 ? MELD_LANE_X0 + NEAR_CORNER_INSET : MELD_LANE_X0;
  const rowZero = wallStacks > 0 ? wallSlotX(wallStacks - 1) - W / 2 - 0.25 : wallSlotX(0) + W / 2;
  // Always one single row, flowers and melds together: when the lane is short
  // the tiles shrink to fit rather than start a second row.
  for (let scale = 0.9; scale >= 0.1; scale -= 0.02) {
    const tileStep = (W + GAP) * scale;
    const groupGap = 0.3 * scale;
    // Your own lane stays by the wall, above your hand strip; the others lie against the rail.
    const z = rel === 0 ? WALL_R + LANE_OUT : LANE_FAR - (H * scale) / 2;
    const tiles = [];
    let x = laneStart;
    let end = laneStart;
    groupSizes.forEach((size, group) => {
      const stacked = kongs.includes(group) && size === 4;
      const footprint = stacked ? 3 : size;
      for (let index = 0; index < size; index++) {
        const level = stacked && index === 3 ? 1 : 0;
        const column = level === 1 ? 1 : index;
        tiles.push({ group, index, level, x: x + column * tileStep + (W * scale) / 2, z });
      }
      end = x + footprint * tileStep - GAP * scale;
      x = end + (bonusFirst && group === 0 ? 3 * groupGap : groupGap);
    });
    if (end <= rowZero) return { scale, tiles };
  }
  throw new Error(`meld lane cannot hold groups of ${groupSizes.join(", ")}`);
}

/** Table-space rectangles of a seat's meld tiles. */
export function meldRects(rel, groupSizes, wallStacks, handCount, options = {}) {
  const { scale, tiles } = meldLayout(groupSizes, wallStacks, handCount, { ...options, rel });
  return tiles.map((tile) => tileRect(rel, tile.x, tile.z, W * scale, H * scale));
}

/** Table-space rectangles of a seat's remaining wall, pushed to its right end. */
export function wallRects(rel, wallStacks) {
  return Array.from({ length: wallStacks }, (_, slot) => tileRect(rel, wallSlotX(slot), WALL_R, W, H));
}

/** Table-space rectangles of a seat's standing hand. */
export function handRects(rel, handCount) {
  const start = -((handCount - 1) / 2) * (W + GAP);
  return Array.from({ length: handCount }, (_, index) => tileRect(rel, start + index * (W + GAP), TABLE.HAND_Z, W, D));
}

/** A tile of `width` across and `depth` along the seat's view, turned onto the table. */
function tileRect(rel, x, z, width, depth) {
  const centre = toTable(rel, x, z);
  const [halfX, halfZ] = rel % 2 === 0 ? [width / 2, depth / 2] : [depth / 2, width / 2];
  return { minX: centre.x - halfX, maxX: centre.x + halfX, minZ: centre.z - halfZ, maxZ: centre.z + halfZ };
}
