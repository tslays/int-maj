/**
 * The opening of a hand, as data: whether the player wants to watch it, and
 * the stages the deal passes through. No DOM, no 3D: `ceremony.js` shows it.
 *
 * Watching the dice, the break and the deal is a preference kept on the
 * device, never part of the game: the engine deals the same hand either way,
 * and a player who wants to get straight to the tiles turns it off.
 */

export const OPENING_KEY = "int-maj.opening";

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** On unless the player turned it off; remembered under `OPENING_KEY`. */
export function createOpeningPref({ storage = browserStorage } = {}) {
  const store = () => (typeof storage === "function" ? storage() : storage);
  let on = true;
  try {
    on = store()?.getItem(OPENING_KEY) !== "off";
  } catch {
    // Unreadable: on.
  }
  return {
    get enabled() {
      return on;
    },
    set(value) {
      on = Boolean(value);
      try {
        store()?.setItem(OPENING_KEY, on ? "on" : "off");
      } catch {
        // Storage refused: the choice lasts until the page is closed.
      }
    },
  };
}

export const openingPref = createOpeningPref();

/**
 * How long the opening takes at each pace, as a multiple of its Faster timing
 * (the quick version, about two seconds a hand). Normal is one step slower and
 * Slower another. The opening's waits, the dice tumbling and the dice sound all
 * use it, so they follow the Pace setting together.
 */
export const OPENING_SPEED = { faster: 1, normal: 1.4, slower: 1.9 };

/** `ms` as the opening plays it at pace `paceId` (an unknown pace plays as Normal). */
export function openingMs(ms, paceId) {
  return ms * (OPENING_SPEED[paceId] ?? OPENING_SPEED.normal);
}

/** Tiles a seat takes in each round of the deal: two pairs (I p. 19, rule 8). */
const ROUND = 4;

/**
 * The hand as it is dealt, stage by stage: `stages[0]` is the table with the
 * wall whole and every hand empty, the next three are the rounds of four tiles
 * each, and the last is `payload` itself (the thirteenth tile, East's
 * fourteenth, and any flowers and seasons already put out). Every stage is a
 * copy of the payload the board can reconcile, so the board needs no deal
 * logic of its own and ends exactly where the engine says.
 */
export function dealStages(payload) {
  const finals = Object.fromEntries(payload.table.map((entry) => [entry.seat, entry.handCount]));
  const total = Object.values(finals).reduce((sum, count) => sum + count, 0);
  const rounds = Math.max(1, ...Object.values(finals).map((count) => Math.ceil(count / ROUND)));
  const stages = [];
  for (let round = 0; round < rounds; round++) {
    const counts = Object.fromEntries(Object.entries(finals).map(([seat, count]) => [seat, Math.min(count, round * ROUND)]));
    stages.push(partial(payload, counts, total));
  }
  stages.push(payload);
  return stages;
}

/** The payload with each seat holding `counts[seat]` tiles and the wall drawn down to match. */
function partial(payload, counts, total) {
  const copy = structuredClone(payload);
  const held = Object.values(counts).reduce((sum, count) => sum + count, 0);
  for (const entry of copy.table) {
    entry.handCount = counts[entry.seat];
    // Bonus tiles are put out as the deal finishes.
    entry.flowers = [];
    entry.seasons = [];
  }
  copy.view.player.hand = payload.view.player.hand.slice(0, counts[payload.seat]);
  copy.view.lastDraw = null;
  const front = total === 0 ? 0 : Math.round((payload.wall.front * held) / total);
  const gap = payload.wall.front - front;
  copy.wall.front = front;
  copy.wall.remaining = payload.wall.remaining + gap;
  return copy;
}

/** The pips each die face shows, as indices into a 3 by 3 grid. */
export const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
