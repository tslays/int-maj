/**
 * Deterministic turn engine: state + action -> state + events.
 *
 * Entry points:
 *   newGame(seed)            deal hand 1
 *   apply(state, action)     one decision
 *   legalActions(state, seat) what that seat may do
 *   viewFor(state, seat)     hidden-information projection
 *   nextHand(state)          deal after a finished hand
 */

export * from "./state.ts";
export * from "./actions.ts";
export * from "./events.ts";
export * from "./legal.ts";
export * from "./draft.ts";
export * from "./hands.ts";
export * from "./settle.ts";
export * from "./deal.ts";
export * from "./reduce.ts";
export * from "./view.ts";
export * from "./replay.ts";
export * from "./bot.ts";
export * from "./closest.ts";
export * from "./describe.ts";
