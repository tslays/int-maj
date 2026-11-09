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
/** How far a selected hand tile rises above the rest of the row. */
export const HAND_LIFT = 0.32;

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

/**
 * The pad under a seat's first three discard rows (the six-wide block that
 * stands against the console). It tints the pond, so each seat's discards read
 * as that seat's; the fourth row runs on beyond it. Inset a hair so the four
 * pads, which meet at the corners, never touch. { x, z, width, depth } in the
 * seat's frame, the centre and the size.
 */
export const POND_INSET = 0.12;
export function pondPad() {
  return {
    x: 0,
    z: TABLE.DISCARD_Z + (STEP_Z * FULL_ROWS) / 2,
    width: ROW * STEP_X - POND_INSET * 2,
    depth: FULL_ROWS * STEP_Z - POND_INSET * 2,
  };
}

/** The plate under the latest discard: its tile's footprint and a margin all round. */
export const LATEST_MARGIN = 0.12;
export function latestPlate(index) {
  const slot = discardSlot(index);
  return {
    x: slot.x,
    z: slot.z,
    width: W * DISCARD_SCALE + LATEST_MARGIN * 2,
    depth: H * DISCARD_SCALE + LATEST_MARGIN * 2,
  };
}

/** The table-space rectangle of a pad or plate `{ x, z, width, depth }` in seat `rel`'s frame. */
export function frameRect(rel, box) {
  const centre = toTable(rel, box.x, box.z);
  const [halfX, halfZ] = rel % 2 === 0 ? [box.width / 2, box.depth / 2] : [box.depth / 2, box.width / 2];
  return { minX: centre.x - halfX, maxX: centre.x + halfX, minZ: centre.z - halfZ, maxZ: centre.z + halfZ };
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
const LANE_END = TABLE.TABLE_HALF - 1.6;

/**
 * Lay a seat's exposed groups along its wall's lane. With `bonusFirst` the
 * first group is its flowers and seasons: hard left in the table corner, with
 * a wider space before the melds. The melds follow in the order made, each
 * new one to the right of the last. The wall never slides: stacks only vanish
 * where they stand, so `wallExtent` is one more than the highest slot still
 * standing, and the lane grows as the wall's left end is used up.
 * Everything lies in one single row; when the lane is short the tiles shrink
 * to fit, never wrapping into a second row. Returns the scale and each
 * tile's centre.
 *
 * A kong (its group index listed in `kongs`) is a pung with the fourth tile
 * lying on top of the middle one: it takes the room of three tiles, and that
 * tile comes back with `level: 1`.
 */
export function meldLayout(groupSizes, wallExtent, handCount, { bonusFirst = false, rel = 0, kongs = [] } = {}) {
  // The seat on your right starts in the corner beside your own hand, which
  // your hand strip covers, so its lane begins a little further along.
  const laneStart = rel === 1 ? MELD_LANE_X0 + NEAR_CORNER_INSET : MELD_LANE_X0;
  // Your own lane lies by your wall and ends where the wall begins. The other
  // three lie against the rail, outside their walls, so they run the rail's
  // length, up to the corner where the next seat's lane begins.
  const rowZero = rel !== 0 ? LANE_END : wallExtent > 0 ? wallSlotX(wallExtent - 1) - W / 2 - 0.25 : wallSlotX(0) + W / 2;
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
export function meldRects(rel, groupSizes, wallExtent, handCount, options = {}) {
  const { scale, tiles } = meldLayout(groupSizes, wallExtent, handCount, { ...options, rel });
  return tiles.map((tile) => tileRect(rel, tile.x, tile.z, W * scale, H * scale));
}

/** Table-space rectangles of the wall stacks still standing, `slots` in the seat's frame. */
export function wallRects(rel, slots) {
  return slots.map((slot) => tileRect(rel, wallSlotX(slot), WALL_R, W, H));
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

/* ------------------------------------------------------- wall draw order */

/** The stacks in one wall (two tiles high each). */
export const WALL_TILE_COUNT = 4 * TABLE.WALL_STACKS * 2;

/**
 * The break (I p. 18): two dice are thrown, the wall to break is counted
 * anticlockwise from East's own wall as 1 (the printed table: 5 or 9 East,
 * 2/6/10 South, 3/7/11 West, 4/8/12 North), and its builder counts the same
 * number of stacks from the right-hand end of that wall. The engine does not
 * throw these dice, so the app throws them from the hand's own key: any two
 * dice, always the same for the same hand.
 *
 * Returns `total` (2..12), `wallSeat` (0 East, 1 South, 2 West, 3 North, the
 * wall's builder counted from the dealer) and `count` (stacks right of the
 * break).
 */
export function breakFor(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const die = (n) => 1 + (Math.imul(h ^ (n * 40503), 2654435761) >>> 16) % 6;
  const total = die(1) + die(2);
  return { total, wallSeat: (total - 1) % 4, count: total };
}

/**
 * How the wall lies once broken (I p. 18-19, rules 6-8; p. 62), as plain
 * data. `builderRel` is the broken wall's position seen from the viewer
 * (0 near, 1 right, 2 far, 3 left); `count` the dice total, which is the
 * number of the stack lifted, counted from the wall's right-hand end (slot 0).
 *
 * - `lifted`: the break stack ("10" in the book's detail), taken off the wall.
 * - `ordinary`: the tiles drawn from the open end, the left of the break
 *   ("from the left side of the opening"): the stack just left of the break,
 *   its top tile first and then the one beneath it (p. 19, "the next tile
 *   from the top row"), then the next stack to the left, on round the corner
 *   into the wall at the builder's left, until the stacks right of the break.
 * - `block`: the replacement block, the broken wall's stacks to the right of
 *   the break, in the order they are used: from the far end (the corner,
 *   slot 0) towards the break. It never moves; tiles only leave it.
 *
 * Entries are { rel, slot, level }; level 1 is a stack's top tile.
 */
export function wallPlan(builderRel, count) {
  const at = Math.max(2, Math.min(count, TABLE.WALL_STACKS));
  const ring = [];
  for (let step = 0; step < 4; step++) {
    // The wall to a builder's left is the one before it in play order.
    const rel = (builderRel + 3 * step) % 4;
    for (let slot = 0; slot < TABLE.WALL_STACKS; slot++) ring.push({ rel, slot });
  }
  const tilesOf = (stacks) => stacks.flatMap(({ rel, slot }) => [{ rel, slot, level: 1 }, { rel, slot, level: 0 }]);
  return {
    count: at,
    rel: builderRel,
    lifted: ring[at - 1],
    ordinary: tilesOf(ring.slice(at)),
    block: tilesOf(ring.slice(0, at - 1)),
  };
}

/**
 * What the wall shows at one moment, from the engine's counts: `front` tiles
 * drawn from the open end, `used` loose tiles consumed by replacements, and
 * `held` loose tiles currently lying on top of the block (two, as the book
 * has it: "as the two loose tiles are used they are replaced", p. 62).
 *
 * Ordinary draws leave the front of `plan.ordinary` and, once that is gone,
 * carry on into the block. Replacements take two more from the block's far
 * end for each two used; if they ever outrun the block (many kongs and
 * flowers) they go on past the wall's corner, at the far end of the ordinary
 * run, so no tile is ever left over. Nothing else moves: the answer is only
 * how many tiles are gone from each list, and where the held loose tiles lie.
 *
 * The marker (owner's ruling on presentation, issue #56; the book's detail
 * diagram, I p. 19, shows the 2nd and 7th stacks instead, with the same
 * tiles, count and order): both loose tiles lie on the END column, the first
 * stack still standing in the order the replacements take them. With `used`
 * replacements the end column is `floor(used / 2)` columns in and carries
 * 2 - (used mod 2) loose tiles: 4 high, then 3 high, then the plain two-tile
 * column is lifted onto its neighbour, which is 4 high, and so on. Only that
 * one column is ever 3 or 4 high.
 *
 * Returns { goneOrdinary, goneTail, goneBlock, markers: [{ which, rel, slot, level }] }:
 * `goneOrdinary` tiles gone from the head of `plan.ordinary`, `goneTail` from
 * its end, `goneBlock` from the head of `plan.block`.
 */
export function wallLook(plan, front, used, held) {
  const overflow = Math.max(0, front - plan.ordinary.length);
  const goneOrdinary = Math.min(front, plan.ordinary.length);
  const taken = Math.max(0, used + held - 2);
  const goneBlock = Math.min(plan.block.length, taken + overflow);
  const goneTail = Math.max(0, taken + overflow - plan.block.length);
  const leftBlock = plan.block.slice(goneBlock);
  const leftOrdinary = plan.ordinary.slice(goneOrdinary, plan.ordinary.length - goneTail);
  // The end column: the block's far stack, or, once the block is used up, the
  // stack past the corner where the replacements go on; the nearest block
  // stack when nothing at all is left to lie on.
  const end =
    leftBlock[0] ??
    leftOrdinary.at(-1) ??
    (plan.block.length > 0 ? plan.block.at(-1) : { rel: plan.rel, slot: plan.count - 2 });
  const standing = [...leftBlock, ...leftOrdinary].filter((tile) => tile.rel === end.rel && tile.slot === end.slot).length;
  const wanted = [];
  if (held >= 2) wanted.push("far");
  if (held >= 1) wanted.push("near");
  const markers = wanted.map((which, index) => ({ which, rel: end.rel, slot: end.slot, level: standing + index }));
  return { goneOrdinary, goneTail, goneBlock, markers };
}
