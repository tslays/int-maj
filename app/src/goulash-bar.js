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
  return readings.every((reading) => readingBarred(reading, excludedHands));
}

/**
 * True when the bar leaves out this one scoring of a hand (a `readings`
 * entry): Big Robert's mixed-numbers half limit goes, its same-numbers
 * limit stays, so the hand's sheet lists only the scorings in play.
 */
export function readingBarred(reading, excludedHands) {
  return (
    halfLimitBarred(excludedHands) &&
    reading.concealedTier === "half" &&
    (reading.exposedTier === null || reading.exposedTier === "half")
  );
}

/** The quiet marker row of a Goulash hand: a whole row under the figures. */
export function goulashRow(barred) {
  return `<span class="badge-goulash">Goulash${barred ? " · no half limit" : ""}</span>`;
}

/** Is this view's hand a Goulash? The exchange view or the record of the exchanges says so, the whole hand through. */
export function isGoulashView(view) {
  return view?.goulash != null || view?.goulashReceived != null;
}
