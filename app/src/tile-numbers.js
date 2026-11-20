/**
 * Tile numbers: whether each tile prints a large rank (1-9) or wind letter in
 * its corner, for players who do not read the characters. On by default, since
 * the players it helps are the least likely to look for a setting; off gives
 * clean art. A preference kept on the device, like the sound and the pace, and
 * safe with missing, refusing or garbled storage.
 */

import { browserStorage, storedString } from "./prefs.js";

export const TILE_NUMBERS_KEY = "int-maj.tile-numbers";

export function createTileNumbers({ storage = browserStorage } = {}) {
  const stored = storedString(TILE_NUMBERS_KEY, storage);
  let on = stored.read() !== "off";
  const listeners = [];

  return {
    get on() {
      return on;
    },
    /** Turn them on or off and remember it; the table follows at once. */
    set(value) {
      on = Boolean(value);
      stored.write(on ? "on" : "off");
      for (const listener of listeners) listener(on);
    },
    /** Back to on, the default. */
    reset() {
      this.set(true);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

export const tileNumbers = createTileNumbers();
