/**
 * Which hands the table leaves out while a Goulash is played with the
 * half-limit rule on (C p. 55). The engine decides this and says so in the
 * view's `excludedHands` as the token "tier:half" (`tierExclusion` in core,
 * which this module cannot import). The app only reads that token.
 */

const HALF_BAR = "tier:half";

/** True when the view bars half-limit hands in the hand in play. */
export function halfLimitBarred(excludedHands) {
  return Array.isArray(excludedHands) && excludedHands.includes(HALF_BAR);
}

/**
 * True when every scoring of this hand is half limit, so the bar leaves
 * nothing to play it at. A hand with one scoring the bar does not touch
 * stays listed.
 */
export function barredInGoulash(hand, excludedHands) {
  if (!halfLimitBarred(excludedHands)) return false;
  const readings = Array.isArray(hand.readings) && hand.readings.length > 0 ? hand.readings : null;
  if (readings === null) return hand.concealedTier === "half";
  return readings.every(
    (reading) => reading.concealedTier === "half" && (reading.exposedTier === null || reading.exposedTier === "half"),
  );
}
