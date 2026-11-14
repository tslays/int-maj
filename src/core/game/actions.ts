/**
 * The complete action vocabulary of the turn engine.
 *
 * One action is one deliberate decision by one seat. Every rule that turns an
 * action into a new state lives in reduce.ts; the union here is deliberately
 * small so a UI, a bot or a replay file has one shape to emit.
 *
 * Claim kinds follow the book's tile-precedence section (p. 34): mah jong is
 * ranked above pung/kong, which are ranked above chow. `tiles` always names
 * the full meld being formed, including the discard, so each chow variant is
 * distinguishable:
 *
 *   Claim { kind: "pung",    tiles: ["o5", "o5", "o5"] }
 *   Claim { kind: "kong",    tiles: ["o5", "o5", "o5", "o5"] }
 *   Claim { kind: "chow",    tiles: ["o4", "o5", "o6"] }
 *   Claim { kind: "mahjong", tiles: ["o5"] }        // the winning tile only
 *
 * `Win { kind: "on-discard" }` is sugar for the mahjong claim: it registers
 * the same claim and obeys the same precedence race. `Win { kind:
 * "self-drawn" }` is the only way to go out on a tile drawn from the wall.
 *
 * Goulash and penalties have their own complete actions: `GoulashExchange`
 * names the three tiles one seat gives in the current pairing, `RequestReshuffle`
 * exercises R82, and `FalseMahJong` is the table declaration that R80(3)
 * penalises. Normal play never offers the last two; they are table events.
 */

import type { Seat } from "./state.ts";

export type ClaimKind = "pung" | "kong" | "chow" | "mahjong";

export type WinKind = "self-drawn" | "on-discard";

export type Action =
  | { readonly type: "Draw"; readonly seat: Seat }
  | { readonly type: "Discard"; readonly seat: Seat; readonly tile: string }
  | {
      readonly type: "Claim";
      readonly seat: Seat;
      readonly kind: ClaimKind;
      readonly tiles: readonly string[];
    }
  | {
      readonly type: "DeclareFishing";
      readonly seat: Seat;
      readonly wait: readonly string[];
      /** The hand fished for, named by the offer so a table can show it; ignored by `apply`. */
      readonly hand?: string;
    }
  | { readonly type: "ConcealedKong"; readonly seat: Seat; readonly tile: string }
  | { readonly type: "AddedKong"; readonly seat: Seat; readonly tile: string }
  | { readonly type: "Pass"; readonly seat: Seat }
  | { readonly type: "Win"; readonly seat: Seat; readonly kind: WinKind }
  | {
      readonly type: "GoulashExchange";
      readonly seat: Seat;
      readonly tiles: readonly string[];
    }
  | { readonly type: "RequestReshuffle"; readonly seat: Seat }
  | { readonly type: "FalseMahJong"; readonly seat: Seat };

export type ActionType = Action["type"];

/**
 * The action as a replay or report stores it: decisions only, without the
 * display-only `hand` a fishing offer carries (apply ignores it, and a
 * report must hold nothing but the decision).
 */
export function decisionOf(action: Action): Action {
  if (action.type !== "DeclareFishing" || action.hand === undefined) return action;
  return { type: action.type, seat: action.seat, wait: action.wait };
}
