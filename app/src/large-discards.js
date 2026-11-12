/**
 * Large discards: whether this round's discards get their larger face layer
 * on a phone (`board-round.js`). On by default, since the players it helps
 * most are the least likely to look for a setting; a preference kept on the
 * device, like the sound and the pace, and safe with missing, refusing or
 * garbled storage.
 */

import { browserStorage, storedString } from "./prefs.js";

export const LARGE_DISCARDS_KEY = "int-maj.large-discards";

export function createLargeDiscards({ storage = browserStorage } = {}) {
  const stored = storedString(LARGE_DISCARDS_KEY, storage);
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
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

export const largeDiscards = createLargeDiscards();
