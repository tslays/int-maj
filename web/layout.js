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
  const phone = mode === "phone";
  const minGap = phone ? 2 : 1;
  const tileFloor = phone ? 26 : minTileWidth;
  if (phone) {
    const controlHeight = Math.max(34, Math.min(48, round(height * 0.05)));
    const boardScale = Math.max(26, round(width * 0.045));
    const handScale = Math.min(
      width * 0.15,
      Math.max(40, boardScale * 1.6),
    );
    const handGap = 2;
    const boardGap = Math.max(2, round(boardScale * 0.25));
    const boardTileHeight = (boardScale * 4) / 3;
    const handTileHeight = (handScale * 4) / 3;
    const riverRows = width > height ? 2 : 3;
    const riverWidth =
      riverColumns * boardScale + (riverColumns - 1) * boardGap;
    const riverHeight =
      riverRows * boardTileHeight + (riverRows - 1) * boardGap;
    const topSeatHeight = round(boardScale * 0.96);
    const rackWidth = round(boardScale * 0.73);
    const rackHeight = boardScale * 0.96;
    const badgeWidth = Math.max(34, round(boardScale * 0.8));
    const badgeHeight = round(boardScale * 0.36);
    const sideInset = 0;
    const topRiverY = topSeatHeight + boardGap;
    const bottomRiverY = height - boardGap - riverHeight;
    const centreY = topRiverY + riverHeight + boardGap;
    const centreHeight = bottomRiverY - boardGap - centreY;
    const leftRiverX = sideInset + rackWidth + boardGap;
    const rightRiverX = width - sideInset - rackWidth - boardGap - riverHeight;
    const centreX = leftRiverX + riverHeight + boardGap;
    const centreWidth = rightRiverX - boardGap - centreX;
    const seatHeight = Math.min(
      13 * rackHeight + 12,
      bottomRiverY - boardGap - (topSeatHeight + boardGap),
    );
    const handWidth = 14 * handScale + 13 * handGap;
    const handBandY = height - handTileHeight - 2 * handGap;
    const handY = handBandY + handGap;
    const controlsY = handBandY - handGap - controlHeight;
    const seats = {
      top: [
        round((width - (13 * rackWidth + 12)) / 2),
        0,
        round(13 * rackWidth + 12),
        topSeatHeight,
      ],
      left: [sideInset, topSeatHeight + boardGap, rackWidth, seatHeight],
      right: [
        width - sideInset - rackWidth,
        topSeatHeight + boardGap,
        rackWidth,
        seatHeight,
      ],
      bottom: [0, handY, width, handTileHeight],
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
    const handBand = [0, handBandY, width, handTileHeight + 2 * handGap];
    const hand = [0, handY, handWidth, handTileHeight];
    const controls = [0, controlsY, width, controlHeight];
    const badges = {
      top: [
        seats.top[0] - boardGap - badgeWidth,
        round(seats.top[1] + seats.top[3] / 2 - badgeHeight / 2),
        badgeWidth,
        badgeHeight,
      ],
      left: [
        boardGap,
        round(seats.left[1] + seats.left[3] / 2 - badgeHeight / 2),
        badgeWidth,
        badgeHeight,
      ],
      right: [
        width - boardGap - badgeWidth,
        round(seats.right[1] + seats.right[3] / 2 - badgeHeight / 2),
        badgeWidth,
        badgeHeight,
      ],
      self: [
        round((width - badgeWidth) / 2),
        round(handY - handGap - badgeHeight),
        badgeWidth,
        badgeHeight,
      ],
    };
    return {
      board: [0, 0, width, height],
      table: [0, 0, width, height],
      control: [0, handBandY, width, height - handBandY],
      handBand,
      hand,
      centre,
      rivers,
      seats,
      controls,
      badges,
      tileWidth: handScale,
      boardTileWidth: boardScale,
      handTileWidth: handScale,
      tileHeight: handTileHeight,
      gap: handGap,
      boardGap,
      handGap,
      inset: handGap,
      handWidth,
      handScrollWidth: handWidth,
      handTileCount: HAND_TILE_COUNT,
      drawnTileIndex: HAND_TILE_COUNT - 1,
      riverColumns,
      riverRows,
      mode,
      supported: handScale >= 40,
      minimumLegalWidth: 390,
    };
  }

  const controlHeight = Math.max(34, Math.min(48, round(height * 0.05)));
  const handBandHeight = round(height * handBandFraction);
  const maxTileForWidth = phone
    ? Math.min(maxTileWidth, Math.floor((width - 13 * minGap) / HAND_TILE_COUNT))
    : Math.min(maxTileWidth, Math.floor(width / HAND_UNITS));

  const gapFor = (tile, gapFloor) =>
    Math.max(gapFloor, round(tile * 0.25));
  const tileHeightOf = (tile) => (tile * 4) / 3;
  const riverHeightOf = (tile) => {
    const gap = gapFor(tile, minGap);
    return RIVER_ROWS * tileHeightOf(tile) + (RIVER_ROWS - 1) * gap;
  };

  const fitsHeight = (tile) => {
    const gap = gapFor(tile, minGap);
    const tileHeight = tileHeightOf(tile);
    const seatHeight = tile * 0.96;
    const riverHeight = riverHeightOf(tile);
    const centreMin = Math.max(tileHeight, 24);
    const used = phone
      ? seatHeight + 2 * riverHeight + centreMin + 5 * gap
      : seatHeight +
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
  let gap = gapFor(tileWidth, minGap);

  // No badge slot is needed beside the hand on a phone: the self badge sits
  // above it. On the single-screen layouts the badge reserves the left slot.
  if (!phone) {
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
  }

  // Shrink the gap before letting a phone tile fall below the 26px floor.
  const maxGap = Math.floor((width - 14 * tileWidth) / 13);
  gap = Math.min(gap, Math.max(minGap, maxGap));
  const handWidth = HAND_TILE_COUNT * tileWidth + (HAND_TILE_COUNT - 1) * gap;
  const supported = tileWidth >= tileFloor && handWidth <= width;

  const tileHeight = tileHeightOf(tileWidth);
  const rackWidth = tileWidth * 0.73;
  const rackHeight = tileWidth * 0.96;
  const sideSeatWidth = round(rackWidth);
  const sideSeatHeight = 13 * rackHeight + 12;
  const topSeatHeight = round(rackHeight);
  const badgeWidth = Math.max(34, round(tileWidth * 0.8));
  const badgeHeight = round(tileWidth * 0.36);
  const sideInset = badgeWidth + gap;
  const riverWidth = riverColumns * tileWidth + (riverColumns - 1) * gap;
  const riverHeight = RIVER_ROWS * tileHeight + (RIVER_ROWS - 1) * gap;

  const tableHeight = phone ? height : height;
  const handBandY = phone
    ? height + gap
    : height - controlHeight - gap - handBandHeight;
  const handBand = [
    0,
    handBandY,
    width,
    phone ? tileHeight + 2 * gap : handBandHeight,
  ];
  const handY = handBandY + (phone ? gap : handBand[3] - tileHeight);
  const hand = [(width - handWidth) / 2, handY, handWidth, tileHeight];

  const availableSideHeight = phone
    ? tableHeight - gap - (topSeatHeight + gap)
    : handBandY - gap - (topSeatHeight + gap);
  const topRiverY = topSeatHeight + gap;
  const bottomRiverY = (phone ? tableHeight - gap : handBandY - gap) - riverHeight;
  const centreY = topRiverY + riverHeight + gap;
  const centreHeight = bottomRiverY - gap - centreY;
  const leftRiverX = sideInset + sideSeatWidth + gap;
  const rightRiverX = width - sideInset - sideSeatWidth - gap - riverHeight;
  const centreX = leftRiverX + riverHeight + gap;
  const centreWidth = rightRiverX - gap - centreX;

  const board = [0, 0, width, phone ? height * 2 : height];
  const table = [0, 0, width, height];
  const control = phone ? [0, height, width, height] : [0, handBandY, width, handBand[3]];
  const seats = {
    top: [
      round((width - (13 * rackWidth + 12)) / 2),
      0,
      round(13 * rackWidth + 12),
      topSeatHeight,
    ],
    left: [
      sideInset,
      topSeatHeight + gap,
      sideSeatWidth,
      Math.min(sideSeatHeight, availableSideHeight),
    ],
    right: [
      width - sideInset - sideSeatWidth,
      topSeatHeight + gap,
      sideSeatWidth,
      Math.min(sideSeatHeight, availableSideHeight),
    ],
    bottom: [0, handBandY, width, phone ? height : handBandHeight],
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

  const controlsWidth = phone || mode === "portrait" ? width : Math.min(width, 220);
  const controls = [
    phone || mode === "portrait" ? 0 : width - controlsWidth - gap,
    phone ? height * 2 - controlHeight - gap : height - controlHeight,
    controlsWidth,
    controlHeight,
  ];

  const centreOf = (rect) => rect[1] + rect[3] / 2;
  const badges = {
    top: [
      seats.top[0] - gap - badgeWidth,
      round(centreOf(seats.top) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    left: [
      0,
      round(centreOf(seats.left) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    right: [
      width - badgeWidth,
      round(centreOf(seats.right) - badgeHeight / 2),
      badgeWidth,
      badgeHeight,
    ],
    self: phone
      ? [
          round((width - badgeWidth) / 2),
          round(handY - gap - badgeHeight),
          badgeWidth,
          badgeHeight,
        ]
      : [
          round(width / 2 - handWidth / 2 - gap - badgeWidth),
          round(handY + tileHeight / 2 - badgeHeight / 2),
          badgeWidth,
          badgeHeight,
        ],
  };

  return {
    board,
    table,
    control,
    handBand,
    hand,
    centre,
    rivers,
    seats,
    controls,
    badges,
    tileWidth,
    tileHeight,
    gap,
    inset: gap,
    handWidth,
    handTileCount: HAND_TILE_COUNT,
    drawnTileIndex: HAND_TILE_COUNT - 1,
    riverColumns,
    mode,
    supported,
    minimumLegalWidth: phone
      ? HAND_TILE_COUNT * 26 + 13 * 2
      : HAND_TILE_COUNT * minTileWidth + 15,
  };
}
