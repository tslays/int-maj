/**
 * What the table should do with the teal marks of tiles a Goulash exchange
 * just brought in (#119, #163).
 *
 * The engine names the tiles this seat received (`view.goulashReceived`), so
 * they are not inferred by diffing the hand: a received tile whose key matches
 * a tile passed away would cancel out in a diff and go unmarked.
 *
 * Returns "clear" when the marks should go (a new hand, or a tile has been
 * thrown), the tiles to mark when a new exchange has just completed, or null
 * to leave the marks as they are.
 */
export function receivedPlan(before, next) {
  const sameHand =
    before !== null && before !== undefined && before.game === next.game && before.view.handNumber === next.view.handNumber;
  if (!sameHand || next.table.some((seat) => seat.discards.length > 0)) return "clear";
  const got = next.view.goulashReceived ?? null;
  if (got === null || before.view.goulashReceived?.stage === got.stage) return null;
  return got.tiles;
}
