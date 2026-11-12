/**
 * How well the bots play: Easy, Medium or Hard.
 *
 * A preference kept on the device, like the pace. It is sent with every bot
 * decision the table asks for, so a change takes effect with the bots' next
 * move. The decisions themselves are recorded in the game, so undo, Play
 * again and a resumed game never depend on the level.
 */

export const LEVEL_KEY = "int-maj.level";

export const LEVELS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createLevel({ storage = browserStorage } = {}) {
  const store = () => (typeof storage === "function" ? storage() : storage);
  const find = (id) => LEVELS.find((entry) => entry.id === id);
  let current = find("hard");
  try {
    current = find(store()?.getItem(LEVEL_KEY)) ?? current;
  } catch {
    // Unreadable: Hard, the bots as they always played.
  }

  return {
    get id() {
      return current.id;
    },
    /** Choose a level by id and remember it; an unknown id changes nothing. */
    set(id) {
      const next = find(id);
      if (next === undefined) return false;
      current = next;
      try {
        store()?.setItem(LEVEL_KEY, next.id);
      } catch {
        // Storage refused: the choice lasts until the page is closed.
      }
      return true;
    },
  };
}

export const level = createLevel();
