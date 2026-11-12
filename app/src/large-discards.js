/**
 * Large discards: whether this round's discards get their larger face layer
 * on a phone (`board-round.js`). On by default, since the players it helps
 * most are the least likely to look for a setting; a preference kept on the
 * device, like the sound and the pace, and safe with missing, refusing or
 * garbled storage.
 */

export const LARGE_DISCARDS_KEY = "int-maj.large-discards";

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createLargeDiscards({ storage = browserStorage } = {}) {
  const store = () => (typeof storage === "function" ? storage() : storage);
  let on = true;
  try {
    on = store()?.getItem(LARGE_DISCARDS_KEY) !== "off";
  } catch {
    // Unreadable: on, the default.
  }
  const listeners = [];

  return {
    get on() {
      return on;
    },
    /** Turn them on or off and remember it; the table follows at once. */
    set(value) {
      on = Boolean(value);
      try {
        store()?.setItem(LARGE_DISCARDS_KEY, on ? "on" : "off");
      } catch {
        // Storage refused: the choice lasts until the page is closed.
      }
      for (const listener of listeners) listener(on);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

export const largeDiscards = createLargeDiscards();
