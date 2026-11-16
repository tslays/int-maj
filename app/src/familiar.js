/**
 * What the player has already met: which hands the panel offered as a
 * discovery, and which they built. The hint styles that pick discoveries
 * ("Mixed", "Discovery") lean away from familiar hands, so the panel rotates
 * and the player keeps meeting new ones. The likeliest style never reads it.
 *
 * Kept on the device, one JSON object per key. Every new game halves it, so
 * a hand shown a while ago comes back: the rotation is gentle, not a ban.
 * Pure apart from the storage it is given, so it needs no browser to test.
 */

import { browserStorage, storedString } from "./prefs.js";

export const FAMILIAR_KEY = "int-maj.familiar";

/** A hand built is worth this many sightings: building it means it is truly known. */
export const BUILT_WEIGHT = 3;
/** A weight below this is forgotten. */
const FORGET = 0.25;
/** Most hands sent to the table: the likeliest sightings, so the request stays small. */
const MOST = 60;

export function createFamiliar({ storage = browserStorage } = {}) {
  const stored = storedString(FAMILIAR_KEY, storage);
  /** @type {Record<string, number>} */
  let shown = {};
  /** @type {Record<string, number>} */
  let built = {};
  try {
    const saved = JSON.parse(stored.read() ?? "null");
    const clean = (object) =>
      Object.fromEntries(
        Object.entries(object ?? {}).filter(([id, n]) => typeof id === "string" && Number.isFinite(n) && n > 0),
      );
    if (saved !== null && typeof saved === "object") {
      shown = clean(saved.shown);
      built = clean(saved.built);
    }
  } catch {
    // Unreadable: start with nothing met.
  }

  const save = () => stored.write(JSON.stringify({ shown, built }));
  const weightOf = (id) => (shown[id] ?? 0) + BUILT_WEIGHT * (built[id] ?? 0);

  return {
    /** How familiar `id` is: sightings plus built hands, weighted. */
    weight: weightOf,
    /** The hands offered as a discovery are one sighting more familiar. */
    recordShown(ids) {
      for (const id of new Set(ids)) shown[id] = (shown[id] ?? 0) + 1;
      save();
    },
    /** A hand the player built. */
    recordBuilt(id) {
      if (typeof id !== "string" || id.length === 0) return;
      built[id] = (built[id] ?? 0) + 1;
      save();
    },
    /** A new game: everything fades by half, and what falls to nothing is forgotten. */
    decay() {
      const fade = (object) =>
        Object.fromEntries(Object.entries(object).map(([id, n]) => [id, n / 2]).filter(([, n]) => n >= FORGET));
      shown = fade(shown);
      built = fade(built);
      save();
    },
    /** The `seen` query for the table: "id:weight,..." for the most familiar hands; empty when none. */
    query() {
      const ids = [...new Set([...Object.keys(shown), ...Object.keys(built)])];
      return ids
        .map((id) => [id, weightOf(id)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, MOST)
        .map(([id, weight]) => `${id}:${Math.round(weight * 100) / 100}`)
        .join(",");
    },
  };
}

export const familiar = createFamiliar();
