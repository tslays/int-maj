/**
 * Which of your hand tiles carry a fish: those whose discard would leave you
 * fishing (`payload.fishingDiscards`, from the engine), shown on your own
 * discard turn while Hints are on. The Fishing offer itself still comes after
 * the throw; the fish only says it will. Pure, so it is tested on its own.
 */

/** Tile key -> the hand you would be fishing for; empty when nothing is to be marked. */
export function fishingMarks(payload, hintsOn) {
  const marks = new Map();
  if (!hintsOn || payload === null || payload === undefined) return marks;
  const view = payload.view;
  if (view.phase !== "discard" || view.turn !== payload.seat) return marks;
  for (const entry of payload.fishingDiscards ?? []) marks.set(entry.tile, entry.hand);
  return marks;
}

/** The note above a lifted tile that carries a fish: the hand's name, nothing more. */
export function fishNoteText(hand) {
  return hand;
}
