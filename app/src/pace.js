/**
 * The table's pace: how fast the bots play and the tiles move.
 *
 * A preference kept on the device, never part of the game: the engine, the
 * bots' decisions and replays are the same at every pace. `pace.scale(ms)`
 * stretches or shrinks any pause, animation or sound delay (any number; the
 * unit does not matter), so a new animation only has to call it.
 */

export const PACE_KEY = "int-maj.pace";

/** `factor` multiplies every duration: under 1 is quicker, over 1 is slower. */
export const PACES = [
  { id: "slower", label: "Slower", factor: 1.5 },
  { id: "normal", label: "Normal", factor: 1 },
  { id: "faster", label: "Faster", factor: 0.6 },
];

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createPace({ storage = browserStorage } = {}) {
  const store = () => (typeof storage === "function" ? storage() : storage);
  const find = (id) => PACES.find((entry) => entry.id === id);
  let current = PACES[1];
  try {
    current = find(store()?.getItem(PACE_KEY)) ?? current;
  } catch {
    // Unreadable: Normal.
  }

  return {
    get id() {
      return current.id;
    },
    get factor() {
      return current.factor;
    },
    /** Choose a pace by id and remember it; an unknown id changes nothing. */
    set(id) {
      const next = find(id);
      if (next === undefined) return false;
      current = next;
      try {
        store()?.setItem(PACE_KEY, next.id);
      } catch {
        // Storage refused: the choice lasts until the page is closed.
      }
      return true;
    },
    scale(value) {
      return value * current.factor;
    },
  };
}

export const pace = createPace();
