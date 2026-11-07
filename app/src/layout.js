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
 * The rest of that corner is the seat's meld zone: exposed melds and bonus
 * tiles lie there face up, in front of the walls and hands, so nothing on the
 * table hides them (they used to lie beside the hand at the table's edge).
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

/**
 * The seat's meld zone, in its own frame: to its right of the discard rows,
 * nearer the centre than the corner row, inside the walls.
 */
export const MELD_ZONE = Object.freeze({
  x0: ROW_HALF + 0.25,
  x1: WALL_INNER - 0.25,
  z0: TABLE.DISCARD_Z + 0.05,
  z1: TABLE.DISCARD_Z + FULL_ROWS * STEP_Z - 0.1,
});

/**
 * Lay a seat's exposed groups (melds, then its bonus tiles as one more group)
 * into its meld zone. Groups never split across rows. The rows are anchored
 * in the zone's outer corner - by the walls, at the seat's right - and fill
 * inwards, so a normal hand keeps a band of felt between its melds and the
 * discards. The tiles shrink only when a hand is unusually full.
 * Returns the scale and each tile's centre as { group, index, x, z }.
 */
export function meldPlacement(groupSizes) {
  const width = MELD_ZONE.x1 - MELD_ZONE.x0;
  const depth = MELD_ZONE.z1 - MELD_ZONE.z0;
  for (let scale = 0.9; scale > 0.3; scale -= 0.05) {
    const tileStep = (W + GAP) * scale;
    const groupGap = 0.3 * scale;
    const rowStep = (H + 0.08) * scale;
    // Pack left to right into rows, as offsets from each row's start.
    const rows = [[]];
    let x = 0;
    let fits = true;
    groupSizes.forEach((size, group) => {
      const groupWidth = size * tileStep - GAP * scale;
      if (groupWidth > width) fits = false;
      if (x > 0 && x + groupWidth > width) {
        rows.push([]);
        x = 0;
      }
      for (let index = 0; index < size; index++) {
        rows.at(-1).push({ group, index, offset: x + index * tileStep });
      }
      x += groupWidth + groupGap;
    });
    const used = groupSizes.length === 0 ? 0 : rows.length * rowStep - 0.08 * scale;
    if (!fits || used > depth) continue;
    const tiles = [];
    rows.forEach((row, rowIndex) => {
      if (row.length === 0) return;
      const rowWidth = row.at(-1).offset + W * scale;
      for (const tile of row) {
        tiles.push({
          group: tile.group,
          index: tile.index,
          // Right-aligned to the zone's outer edge, first row by the walls.
          x: MELD_ZONE.x1 - rowWidth + tile.offset + (W * scale) / 2,
          z: MELD_ZONE.z1 - rowIndex * rowStep - (H * scale) / 2,
        });
      }
    });
    return { scale, tiles };
  }
  throw new Error(`meld zone cannot hold groups of ${groupSizes.join(", ")}`);
}

/** Table-space rectangles of a seat's meld tiles. */
export function meldRects(rel, groupSizes) {
  const { scale, tiles } = meldPlacement(groupSizes);
  const across = (W * scale) / 2;
  const along = (H * scale) / 2;
  const [halfX, halfZ] = rel % 2 === 0 ? [across, along] : [along, across];
  return tiles.map((tile) => {
    const centre = toTable(rel, tile.x, tile.z);
    return { minX: centre.x - halfX, maxX: centre.x + halfX, minZ: centre.z - halfZ, maxZ: centre.z + halfZ };
  });
}
