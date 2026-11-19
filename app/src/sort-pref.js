/**
 * Sort (#213): whether the game keeps your hand in order. A preference kept on
 * the device, like the sound and the pace, so it holds across hands and games.
 * With Sort off the game never re-orders the hand by itself: the tiles keep
 * the places you gave them and new ones join at the end. On by default, and
 * safe with missing, refusing or garbled storage.
 */

import { browserStorage, storedString } from "./prefs.js";

export const SORT_KEY = "int-maj.sort";

export function createSortPref({ storage = browserStorage } = {}) {
  const stored = storedString(SORT_KEY, storage);
  let on = stored.read() !== "off";
  const listeners = [];

  return {
    get on() {
      return on;
    },
    /** Turn Sort on or off and remember it. */
    set(value) {
      const next = Boolean(value);
      if (next === on) return;
      on = next;
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

export const sortPref = createSortPref();
