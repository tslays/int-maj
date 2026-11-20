/**
 * The keyboard at the table: which key does what. Pure, so tests can check it
 * without a browser, and the one list the guide's Keyboard card is built from.
 * Nothing on the table shows the keys; the action buttons carry theirs in
 * `aria-keyshortcuts`, which is how `keys.js` finds the button a letter means.
 */

/** The letter for each kind of action button (see `showChoices` in main.js). */
export const ACTION_KEY = {
  pass: "X",
  reshuffle: "R",
  chow: "C",
  pung: "P",
  kong: "K",
  fishing: "F",
  win: "M",
};

const LETTER = new Map(Object.entries(ACTION_KEY).map(([name, key]) => [key.toLowerCase(), key]));

/**
 * What a key press asks for, or null when the table does not use it:
 * `{ type: "move", step }` (the next tile along), `{ type: "shift", step }`
 * (carry the lifted tile along the hand), `{ type: "throw" }` (Enter: throw,
 * or in a Goulash send the three picks), `{ type: "pick" }` (Space: throw, or
 * pick in a Goulash), `{ type: "action", key }` (a button by its letter),
 * `{ type: "button", index }` (the nth button), or one of `discards`, `sort`,
 * `hints`, `guide`. Presses with Ctrl, Alt or Cmd are the browser's.
 */
export function commandFor({ key, shiftKey = false, ctrlKey = false, altKey = false, metaKey = false }) {
  if (ctrlKey || altKey || metaKey) return null;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const step = key === "ArrowLeft" ? -1 : 1;
    return { type: shiftKey ? "shift" : "move", step };
  }
  if (key === "Home" || key === "End") return { type: "move", step: key === "Home" ? -Infinity : Infinity };
  if (key === "Enter") return { type: "throw" };
  if (key === " " || key === "Spacebar") return { type: "pick" };
  if (key === "?") return { type: "guide" };
  if (/^[1-9]$/.test(key)) return { type: "button", index: Number(key) - 1 };
  const lower = key.length === 1 ? key.toLowerCase() : "";
  if (LETTER.has(lower)) return { type: "action", key: LETTER.get(lower) };
  if (lower === "d") return { type: "discards" };
  if (lower === "s") return { type: "sort" };
  if (lower === "h") return { type: "hints" };
  return null;
}

/** The guide's Keyboard card: each row the keys, then what they do. */
export const SHORTCUTS = [
  ["← →", "Lift the next tile along"],
  ["Enter or Space", "Throw the lifted tile"],
  ["Shift ← →", "Move the lifted tile in your hand"],
  [`${ACTION_KEY.win}`, "Mah Jong"],
  [`${ACTION_KEY.pung} ${ACTION_KEY.chow} ${ACTION_KEY.kong}`, "Pung, Chow, Kong (press again for the next one)"],
  [`${ACTION_KEY.fishing}`, "Fishing"],
  [`${ACTION_KEY.pass}`, "Pass, Don't announce"],
  [`${ACTION_KEY.reshuffle}`, "Reshuffle"],
  ["1 – 9", "The buttons above your hand, left to right"],
  ["D", "Study the discards, and back"],
  ["S  H", "Sort, Hints on or off"],
  ["Esc", "Close a sheet"],
  ["?", "This list"],
];

/** In a Goulash: Space picks or puts back the tile, Enter passes the three. */
export const GOULASH_LINE = "In a Goulash, Space picks a tile or puts it back; Enter passes the three.";
