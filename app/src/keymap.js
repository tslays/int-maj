/**
 * The keyboard at the table: arrows, Enter or Space, and Esc, and what they
 * mean depends on where you are. Pure, so tests can check it without a
 * browser; `keys.js` carries it out, and the guide's "With a keyboard" card
 * (in Your turn) is built from `SHORTCUTS`.
 *
 * Two places: your hand (← → lift a tile, Enter throws it) and the buttons
 * above it (← → choose one, Enter presses it). ↑ and ↓ move between them,
 * and Esc passes whenever there is a Pass button.
 */

/**
 * What a key press asks for in `zone` ("hand" or "buttons"), or null when
 * the table does not use it: `{ type: "move", step }` (along the hand or the
 * buttons), `{ type: "press" }` (Enter or Space), `{ type: "zone", to }`, or
 * `{ type: "pass" }`. Presses with a modifier are the browser's.
 */
export function commandFor({ key, shiftKey = false, ctrlKey = false, altKey = false, metaKey = false }, zone = "hand") {
  if (shiftKey || ctrlKey || altKey || metaKey) return null;
  if (key === "ArrowLeft" || key === "ArrowRight") return { type: "move", step: key === "ArrowLeft" ? -1 : 1 };
  if (key === "Enter" || key === " " || key === "Spacebar") return { type: "press" };
  if (key === "ArrowUp" && zone === "hand") return { type: "zone", to: "buttons" };
  if (key === "ArrowDown" && zone === "buttons") return { type: "zone", to: "hand" };
  if (key === "Escape") return { type: "pass" };
  return null;
}

/** The guide's "With a keyboard" card: each row the keys, then what they do. */
export const SHORTCUTS = [
  ["← →", "Lift a tile; on the buttons, choose one"],
  ["Enter or Space", "Throw the lifted tile; on the buttons, press the one chosen"],
  ["↑ ↓", "Up to the buttons (Pung, Chow, Mah Jong...) and back down to your hand"],
  ["Esc", "Pass, when you are asked; otherwise it closes a sheet"],
];

/** The card's text, under the keys. */
export const KEY_NOTES = [
  "When a discard is offered to you, the buttons are chosen already: ← → and Enter.",
  "In a Goulash, Enter picks a tile or puts it back; ↑ then Enter passes the three.",
];
