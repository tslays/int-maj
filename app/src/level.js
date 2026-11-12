/**
 * How well the bots play: Easy, Medium or Hard.
 *
 * A preference kept on the device, like the pace. It is sent with every bot
 * decision the table asks for, so a change takes effect with the bots' next
 * move. Medium is the default: most players found the bots too strong at
 * Hard, which is how they played before there was a choice. The decisions
 * themselves are recorded in the game, so undo, Play again and a resumed game
 * never depend on the level.
 */

import { browserStorage, storedString } from "./prefs.js";

export const LEVEL_KEY = "int-maj.level";

export const LEVELS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

export function createLevel({ storage = browserStorage } = {}) {
  const stored = storedString(LEVEL_KEY, storage);
  const find = (id) => LEVELS.find((entry) => entry.id === id);
  // Nothing readable: Medium, the table's default.
  let current = find(stored.read()) ?? find("medium");

  return {
    get id() {
      return current.id;
    },
    /** Choose a level by id and remember it; an unknown id changes nothing. */
    set(id) {
      const next = find(id);
      if (next === undefined) return false;
      current = next;
      stored.write(next.id);
      return true;
    },
  };
}

export const level = createLevel();
