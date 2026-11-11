/**
 * The hands a player has pinned to the closest-hands panel. Pure apart from
 * the storage handle it is given, so it needs no browser and is tested alone.
 *
 * Pins belong to one game: they survive a reload and the next hand, and a
 * new game starts with none. At most three (`MAX_PINS`): the panel shows
 * three hands in all, and a pin takes one of those places.
 */

export const MAX_PINS = 3;
export const PINS_KEY = "int-maj.pins";

/**
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void } | null} store
 */
export function createPins(store) {
  let game = null;
  let ids = [];

  try {
    const saved = JSON.parse(store?.getItem(PINS_KEY) ?? "null");
    if (saved !== null && typeof saved.game === "string" && Array.isArray(saved.pins)) {
      game = saved.game;
      ids = saved.pins.filter((id) => typeof id === "string").slice(0, MAX_PINS);
    }
  } catch {
    // Unreadable or no storage: start with none.
  }

  function save() {
    try {
      store?.setItem(PINS_KEY, JSON.stringify({ game, pins: ids }));
    } catch {
      // Private mode: the pins last for this visit.
    }
  }

  /** Switch to `id`'s pins; another game's are dropped. */
  function forGame(id) {
    if (id !== game) {
      game = id;
      ids = [];
      save();
    }
  }

  return {
    /** The pinned hand ids for this game, in the order they were pinned. */
    list(id) {
      forGame(id);
      return [...ids];
    },
    has(id, pattern) {
      forGame(id);
      return ids.includes(pattern);
    },
    full(id) {
      forGame(id);
      return ids.length >= MAX_PINS;
    },
    /**
     * Pin a hand, or unpin it when it is pinned already. Returns whether it is
     * pinned now; a fourth pin is refused (false, nothing changes).
     */
    toggle(id, pattern) {
      forGame(id);
      if (ids.includes(pattern)) {
        ids = ids.filter((item) => item !== pattern);
        save();
        return false;
      }
      if (ids.length >= MAX_PINS) return false;
      ids = [...ids, pattern];
      save();
      return true;
    },
  };
}
