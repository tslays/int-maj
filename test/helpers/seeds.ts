/**
 * Seeds for web-table tests. A new game throws dice for East (I p. 18), so a
 * fixed seed no longer means you deal. These helpers pick a seed by what the
 * dice made of it.
 */

import { newGame, type Seat } from "../../src/core/game/index.ts";

/** The first `${prefix}-${n}` seed whose dice make `dealer` East. */
export function seedWithDealer(prefix: string, dealer: Seat): string {
  for (let n = 0; n < 200; n++) {
    const seed = `${prefix}-${n}`;
    if (newGame(seed).state.dealer === dealer) return seed;
  }
  throw new Error(`no ${prefix} seed dealt to ${dealer}`);
}

/** A seed whose dice make the human's seat, E, the dealer: your discard is first. */
export const seedYouDeal = (prefix: string): string => seedWithDealer(prefix, "E");
