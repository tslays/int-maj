/**
 * The words the hand's sheet uses for the version of a hand your tiles are
 * nearest to, when the panel shows another (`ClosestHand.nearer` in core):
 * a version barred by the table's rules (the Goulash half-limit bar, C p. 55)
 * or one that needs a tile whose every copy is already in sight. Pure, so
 * the wording is tested on its own; `name` turns a tile key into words.
 */

const TIER_WORD = {
  half: "half-limit",
  limit: "limit",
  middle: "middle-limit",
  double: "double-limit",
  calculate: "calculated",
};

/** "a, b and c". */
export function listWords(words) {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The tiles a version lacks, each key once ("the 6 circle", "the 6 circle twice"). */
function tilesWords(keys, name) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return listWords([...counts].map(([key, count]) => `the ${name(key)}${count > 1 ? (count === 2 ? " twice" : ` ${count} times`) : ""}`));
}

/**
 * Which scoring the tiles shown are for, on a hand with more than one
 * ("For the limit scoring: when the three runs use the same numbers."), or
 * null for a hand with one.
 */
export function versionNote(hand) {
  if (hand === null || hand.scoringWhen === null || hand.scoringWhen === undefined) return null;
  return `For the ${TIER_WORD[hand.tier] ?? hand.tier} scoring: ${hand.scoringWhen}.`;
}

/** The sheet's note on a nearer version the player cannot play, or null when the hand shown is the nearest. */
export function nearerNote(hand, name) {
  const nearer = hand?.nearer ?? null;
  if (nearer === null) return null;
  const lacks = `A nearer version lacks only ${tilesWords(nearer.need, name)}`;
  if (nearer.barred !== null) {
    const which = `${TIER_WORD[nearer.barred] ?? nearer.barred} version${nearer.scoringWhen === null ? "" : `, ${nearer.scoringWhen}`}`;
    const bar =
      nearer.barred === "half"
        ? "Half-limit hands are barred in this Goulash (Companion p. 55), so it is neither a win nor a fishing hand."
        : "The table's rules bar it, so it is neither a win nor a fishing hand.";
    return `${lacks}: the ${which}. ${bar} The tiles above are for the version still open.`;
  }
  const dead = listWords(nearer.dead.map((key) => `the ${name(key)}`));
  return (
    `${lacks}, but every copy of ${dead} is already in sight (discarded or in an exposed meld), ` +
    "so it can no longer be built. The tiles above are for the nearest version still open."
  );
}

/** The one line a hand's sheet carries when the Goulash bar leaves the whole hand out. */
export function barredNote() {
  return "Barred in this Goulash: half-limit hands can't win or fish here (Companion p. 55).";
}
