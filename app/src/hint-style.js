/**
 * The hint style: how the closest-hands panel picks its hands.
 *
 * "Likeliest" shows the hands you are most likely to build; "Mixed" the two
 * likeliest and one hand you may not have thought of; "Discovery" only such
 * hands. A preference kept on the device, never part of the game: the chance
 * shown for a hand is the same honest figure in every style, and the table
 * picks the hands (`style` in `/api/closest`).
 */

import { browserStorage, storedString } from "./prefs.js";

export const HINT_STYLE_KEY = "int-maj.hint-style";

/** Widest known first; Mixed is what a new player gets. */
export const HINT_STYLES = [
  { id: "likeliest", label: "Likeliest", about: "The hands your tiles are most likely to build." },
  { id: "mixed", label: "Mixed", about: "The two likeliest, and one you may not have thought of." },
  { id: "discovery", label: "Discovery", about: "Hands you may not have thought of, and new to you." },
];

export function createHintStyle({ storage = browserStorage } = {}) {
  const stored = storedString(HINT_STYLE_KEY, storage);
  const find = (id) => HINT_STYLES.find((entry) => entry.id === id);
  let current = find(stored.read()) ?? HINT_STYLES[1];

  return {
    get id() {
      return current.id;
    },
    /** True when the style picks hands to be new to the player, so the panel keeps a memory of them. */
    get rotates() {
      return current.id !== "likeliest";
    },
    /** Choose a style by id and remember it; an unknown id changes nothing. */
    set(id) {
      const next = find(id);
      if (next === undefined) return false;
      current = next;
      stored.write(next.id);
      return true;
    },
    /** Back to Mixed, the default. */
    reset() {
      return this.set("mixed");
    },
  };
}

export const hintStyle = createHintStyle();
