/** Hand order: characters, circles, bamboo, winds, dragons, then bonuses. Pure, so Node tests can load it. */
export function tileOrder(key) {
  const suit = { c: 0, o: 1, b: 2, w: 3, d: 4, f: 5, s: 6 }[key[0]] ?? 7;
  const rank = "123456789ESWNRGW".indexOf(key[1]);
  return suit * 20 + rank;
}
