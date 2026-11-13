/**
 * Discard layout (#122): each seat's discards in rows in front of it (the
 * default, easy to read on a phone), or one shared pile in the middle, the
 * way a real table plays, where nothing shows who threw what or when
 * (`pile.js`). A preference kept on the device, like the sound and the pace;
 * safe with missing, refusing or garbled storage. It changes only how the
 * table looks, never the game.
 */

import { browserStorage, storedString } from "./prefs.js";

export const DISCARD_LAYOUT_KEY = "int-maj.discard-layout";
export const DISCARD_LAYOUTS = ["rows", "pile"];

export function createDiscardLayout({ storage = browserStorage } = {}) {
  const stored = storedString(DISCARD_LAYOUT_KEY, storage);
  let id = stored.read() === "pile" ? "pile" : "rows";
  const listeners = [];

  return {
    get id() {
      return id;
    },
    get pile() {
      return id === "pile";
    },
    /** Switch the layout and remember it; the table re-lays its discards at once. */
    set(value) {
      if (!DISCARD_LAYOUTS.includes(value) || value === id) return;
      id = value;
      stored.write(id);
      for (const listener of listeners) listener(id);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

export const discardLayout = createDiscardLayout();
