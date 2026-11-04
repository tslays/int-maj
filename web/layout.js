/**
 * The one geometry formula for variant D.
 *
 * Everything starts from the board box and a tile width. Breakpoints only
 * change the four inputs: river columns, hand-band fraction, minimum tile
 * width and the large-screen cap. No caller may hand-place a region.
 */

export const HAND_TILE_COUNT = 14;
export const RIVER_SLOTS = 18;
export const RIVER_ROWS = 3;

/** The 14-tile row plus 13 inter-tile gaps and two edge insets, at 0.25 tile. */
const HAND_UNITS = HAND_TILE_COUNT + 15 * 0.25;

function round(value) {
  return Math.round(value);
}

/**
 * @param {object} input
 * @param {number} input.width
 * @param {number} input.height
 * @param {"desktop"|"landscape"|"portrait"} input.mode
 * @param {number} input.riverColumns
 * @param {number} input.handBandFraction
 * @param {number} input.minTileWidth
 * @param {number} input.maxTileWidth
 */
export function computeLayout({
  width,
  height,
  mode,
  riverColumns,
  handBandFraction,
  minTileWidth,
  maxTileWidth,
}) {
  const controlHeight = Math.max(34, Math.min(48, round(height * 0.05)));
  const handBandHeight = round(height * handBandFraction);
  const maxTileForWidth = Math.min(
    maxTileWidth,
    Math.floor(width / HAND_UNITS),
  );

  const fitsHeight = (tile) => {
    const gap = Math.max(1, round(tile * 0.25));
    const tileHeight = (tile * 4) / 3;
    const seatHeight = tile * 0.96;
    const riverHeight = RIVER_ROWS * tileHeight + (RIVER_ROWS - 1) * gap;
    const centreMin = Math.max(tileHeight, 24);
    const used =
      seatHeight +
      2 * riverHeight +
      centreMin +
      handBandHeight +
      controlHeight +
      5 * gap;
    return used <= height;
  };

  // The largest tile that fits both the 14-tile row and the vertical stack.
  let low = 1;
  let high = Math.max(1, maxTileForWidth);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fitsHeight(middle)) low = middle;
    else high = middle - 1;
  }
  let tileWidth = low;
  let gap = Math.max(1, round(tileWidth * 0.25));
  let inset = gap;

  // The hand badge needs its own slot to the left of the hand. If the row
  // would leave no room, reduce the tile; the 14-tile row stays one row.
  while (tileWidth > 1) {
    const idealGap = Math.max(1, round(tileWidth * 0.25));
    const badgeWidth = Math.max(34, round(tileWidth * 0.8));
    let candidateGap = idealGap;
    while (
      candidateGap > 1 &&
      14 * tileWidth + 13 * candidateGap + 2 * (badgeWidth + candidateGap) > width
    ) {
      candidateGap -= 1;
    }
    const handWidth = 14 * tileWidth + 13 * candidateGap;
    if (handWidth + 2 * (badgeWidth + candidateGap) <= width) {
      gap = candidateGap;
      break;
    }
    tileWidth -= 1;
  }

  // If 14 legal tiles do not fit, shrink the gap before touching the tile.
  if (14 * tileWidth + 13 * gap + 2 * inset > width) {
    gap = Math.max(1, Math.floor((width - 14 * tileWidth) / 15));
    inset = gap;
    tileWidth = Math.min(
      tileWidth,
      Math.floor((width - 15 * gap) / 14),
    );
  }
  const tileHeight = (tileWidth * 4) / 3;
  const handWidth =
    HAND_TILE_COUNT * tileWidth + (HAND_TILE_COUNT - 1) * gap;
  const rackWidth = tileWidth * 0.73;
  const rackHeight = tileWidth * 0.96;
  const sideSeatWidth = round(rackWidth);
  const sideSeatHeight = 13 * rackHeight + 12;
  const topSeatHeight = round(rackHeight);
  const riverWidth = riverColumns * tileWidth + (riverColumns - 1) * gap;
  const riverHeight = RIVER_ROWS * tileHeight + (RIVER_ROWS - 1) * gap;

  const handBandY = height - controlHeight - gap - handBandHeight;
  const availableSideHeight =
    handBandY - gap - (topSeatHeight + gap);
  const topRiverY = topSeatHeight + gap;
  const bottomRiverY = handBandY - gap - riverHeight;
  const centreY = topRiverY + riverHeight + gap;
  const centreHeight = bottomRiverY - gap - centreY;
  const leftRiverX = sideSeatWidth + gap;
  const rightRiverX = width - sideSeatWidth - gap - riverHeight;
  const centreX = leftRiverX + riverHeight + gap;
  const centreWidth = rightRiverX - gap - centreX;

  const board = [0, 0, width, height];
  const seats = {
    top: [
      round((width - (13 * rackWidth + 12)) / 2),
      0,
      round(13 * rackWidth + 12),
      topSeatHeight,
    ],
    left: [
      0,
      topSeatHeight + gap,
      sideSeatWidth,
      Math.min(sideSeatHeight, availableSideHeight),
    ],
    right: [
      width - sideSeatWidth,
      topSeatHeight + gap,
      sideSeatWidth,
      Math.min(sideSeatHeight, availableSideHeight),
    ],
    bottom: [0, handBandY, width, handBandHeight],
  };

  const centre = [centreX, centreY, centreWidth, centreHeight];
  const rivers = {
    top: [round((width - riverWidth) / 2), topRiverY, riverWidth, riverHeight],
    bottom: [
      round((width - riverWidth) / 2),
      bottomRiverY,
      riverWidth,
      riverHeight,
    ],
    left: [leftRiverX, topRiverY, riverHeight, riverWidth],
    right: [rightRiverX, topRiverY, riverHeight, riverWidth],
  };

  const controlsWidth = mode === "portrait" ? width : Math.min(width, 220);
  const controls = [
    mode === "portrait" ? 0 : width - controlsWidth - gap,
    height - controlHeight,
    controlsWidth,
    controlHeight,
  ];

  const badgeWidth = Math.max(34, round(tileWidth * 0.8));
  const badgeHeight = round(tileWidth * 0.36);
  const centreYOf = (rect) => rect[1] + rect[3] / 2;
  const badges = {
    top: [
      seats.top[0] - gap - badgeWidth,
      round(centreYOf(seats.top) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    left: [
      seats.left[0] - gap - badgeWidth,
      round(centreYOf(seats.left) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    right: [
      seats.right[0] + seats.right[2] + gap,
      round(centreYOf(seats.right) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    self: [
      round(width / 2 - handWidth / 2 - gap - badgeWidth),
      round(handBandY + handBandHeight - tileHeight / 2 - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
  };

  const handRect = [
    (width - handWidth) / 2,
    handBandY + handBandHeight - tileHeight,
    handWidth,
    tileHeight,
  ];

  return {
    board,
    handBand: [0, handBandY, width, handBandHeight],
    hand: handRect,
    centre,
    rivers,
    seats,
    controls,
    badges,
    tileWidth,
    tileHeight,
    gap,
    inset,
    handWidth,
    riverColumns,
    mode,
    minimumLegalWidth: HAND_TILE_COUNT * minTileWidth + 15,
  };
}
