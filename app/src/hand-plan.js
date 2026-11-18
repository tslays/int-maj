/**
 * Which of your hand tiles stay, which leave and in what order the hand lies
 * after the table moved (`reconcileHand` in board-hand.js). Pure, so tests
 * can check it without a browser.
 *
 * Identical tiles are told apart by the tile object, not by their face: when
 * a copy leaves (a Goulash pass, a discard), the copy you picked or threw is
 * the one that goes (#210, #214). Before this, the first copy of that face
 * stayed, so a passed tile could stay in the hand with its pick still on and
 * stand raised for the rest of the hand.
 */

import { tileOrder } from "./tile-order.js";

/**
 * `hand` is the tiles held now ({ key, drawn }, in their order), `keys` the
 * payload's hand, `drawnKey` the tile just drawn on your own turn (or null),
 * `sorted` the Sort preference and `leaving` the tiles to let go first (the
 * ones picked for a pass, the one thrown). Gives `order`, the new hand as
 * `{ entry, key, drawn }` (`entry` null for a tile not yet on the table), and
 * `dropped`, the tiles that left.
 */
/**
 * Whether tiles picked for a Goulash pass may stand raised: only while the
 * prompt offers an exchange. Once the last exchange is over none stays up,
 * whichever copies the hand kept.
 */
export function picksStand(payload) {
  return (payload?.legalActions ?? []).some((action) => action.type === "GoulashExchange");
}

export function planHand({ hand, keys, drawnKey = null, sorted, leaving = new Set() }) {
  const need = new Map();
  for (const key of keys) need.set(key, (need.get(key) ?? 0) + 1);

  // Per face, keep as many as the payload holds: copies that are leaving go first, then the last ones.
  const dropped = new Set();
  const byKey = new Map();
  for (const entry of hand) byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry]);
  for (const [key, copies] of byKey) {
    let excess = copies.length - (need.get(key) ?? 0);
    for (const entry of copies) {
      if (excess <= 0) break;
      if (!leaving.has(entry)) continue;
      dropped.add(entry);
      excess -= 1;
    }
    for (const entry of [...copies].reverse()) {
      if (excess <= 0) break;
      if (dropped.has(entry)) continue;
      dropped.add(entry);
      excess -= 1;
    }
  }
  const kept = hand.filter((entry) => !dropped.has(entry));
  const left = new Map(need);
  for (const entry of kept) left.set(entry.key, left.get(entry.key) - 1);
  const added = [];
  for (const [key, count] of left) for (let i = 0; i < count; i += 1) added.push(key);
  added.sort((a, b) => tileOrder(a) - tileOrder(b));
  // A newly drawn tile is always one of the new ones, and it goes last.
  const drawnIsNew = drawnKey !== null && added.includes(drawnKey);
  if (drawnIsNew) added.push(added.splice(added.indexOf(drawnKey), 1)[0]);

  let order;
  if (!sorted) {
    // Your own arrangement stands: tiles keep their places, new ones join at the end.
    order = [...kept.map((entry) => ({ entry, key: entry.key })), ...added.map((key) => ({ entry: null, key }))];
    order.forEach((item, index) => {
      item.drawn = drawnKey !== null && index === order.length - 1;
    });
  } else {
    // Sorted, with the drawn tile apart at the end.
    let drawn = null;
    if (drawnKey !== null && !drawnIsNew) {
      const copies = kept.filter((entry) => entry.key === drawnKey);
      drawn = copies.find((entry) => entry.drawn) ?? copies.at(-1) ?? null;
    }
    const plain = [
      ...kept.filter((entry) => entry !== drawn).map((entry) => ({ entry, key: entry.key, drawn: false })),
      ...(drawnIsNew ? added.slice(0, -1) : added).map((key) => ({ entry: null, key, drawn: false })),
    ];
    plain.sort((a, b) => tileOrder(a.key) - tileOrder(b.key));
    order = plain;
    if (drawn !== null) order.push({ entry: drawn, key: drawn.key, drawn: true });
    else if (drawnIsNew) order.push({ entry: null, key: drawnKey, drawn: true });
  }
  return { order, dropped: [...dropped] };
}
