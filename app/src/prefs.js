/**
 * Preferences kept on the device (sound, pace, bot level, the opening, large
 * discards): one string per key in `localStorage`, safe when storage is
 * missing, refuses to be read or written, or holds something unexpected.
 * Each preference module gets its storage injected so tests can hand it a
 * fake, a refusing one or none.
 */

/** The browser's storage, or null where there is none or it may not be touched. */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The string kept under `key`. `storage` is a storage object, a function
 * returning one (looked up on each use), or null. `read` gives null when there
 * is nothing readable; `write` that is refused leaves the choice to last only
 * until the page is closed.
 */
export function storedString(key, storage = browserStorage) {
  const store = () => (typeof storage === "function" ? storage() : storage);
  return {
    read() {
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        store()?.setItem(key, value);
      } catch {
        // Storage refused: the choice lasts until the page is closed.
      }
    },
  };
}
