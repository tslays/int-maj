/**
 * Deterministic review states for the web table.
 *
 * `?state=<name>` must show one fixed board per table state, and it must be
 * the board play actually produces — never a doctored payload or a fake DOM.
 * So a scenario is a seed plus the condition the replay stops at: every seat,
 * including yours, is driven by the same `chooseAction` policy the bots use,
 * through the same `apply`, and the frozen state is simply where the replay
 * halted. The seed and the policy are the whole recipe, so rebuilding a
 * scenario always gives the same board.
 *
 * `scenarioSession` keeps a built scenario in the store so the browser can
 * play it like any other game. A cached scenario is reused only while its
 * board still satisfies its own condition; once a visitor has moved it, the
 * next request rebuilds from the seed.
 */

import type { Action } from "../core/game/actions.ts";
import { chooseAction } from "../core/game/bot.ts";
import type { Event } from "../core/game/events.ts";
import { isApplyError } from "../core/game/draft.ts";
import { newGame } from "../core/game/deal.ts";
import { apply } from "../core/game/reduce.ts";
import type { ReplayStep } from "../core/game/replay.ts";
import type { GameState, Seat } from "../core/game/state.ts";
import { viewFor, type GameView } from "../core/game/view.ts";
import { GameStore, handCheck, ZERO_SCORES, type WebSession } from "./session.ts";

/** Review boards are dealt to you at East, so each one opens on your move. */
const SEAT: Seat = "E";

/** A hand from deal to result is well under this; it bounds a broken replay. */
const MAX_STEPS = 600;

export interface Scenario {
  /** One line for the tab title and the state tag on the rail. */
  readonly title: string;
  /** The deal this board is replayed from. */
  readonly seed: string;
  /** The hand is dealt as a Goulash, as after a drawn hand (I p. 21). */
  readonly goulash?: boolean;
  /** True at the board the page freezes. */
  readonly at: (view: GameView, state: GameState) => boolean;
}

const TABLE = {
  turn: {
    title: "Your turn to discard",
    seed: "turn-new-0",
    at: (view) =>
      view.phase === "discard" &&
      view.turn === view.seat &&
      view.player.hand.length === 14 &&
      view.legalActions.some((action) => action.type === "Discard"),
  },

  claim: {
    title: "Claim window with a chow variant",
    seed: "claim-new-1",
    at: (view) =>
      view.phase === "claim" &&
      view.turn === view.seat &&
      view.claimWindow !== null &&
      view.legalActions.filter(
        (action) => action.type === "Claim" && action.kind === "chow",
      ).length >= 2,
  },

  wait: {
    title: "Thirteen tiles with a live wait",
    seed: "wait-v10-7",
    at: (view) => {
      if (view.phase !== "discard" || view.turn === view.seat) return false;
      // Your own plain wait: you have not shown the fish. Another seat's fish
      // reveals no tiles, so it may be on the table.
      if (view.fishing.some((entry) => entry.seat === view.seat)) return false;
      const check = handCheck(view.player);
      return check.size === 13 && check.waits.length > 0;
    },
  },

  fishing: {
    title: "Fishing announced",
    seed: "fishing-scene-3",
    at: (view) =>
      view.phase === "discard" &&
      view.turn !== view.seat &&
      view.player.hand.length === 13 &&
      view.fishing.some((entry) => entry.seat === view.seat),
  },

  botfishing: {
    title: "A bot with a meld has shown its fish",
    seed: "botfish-27",
    at: (view) =>
      view.phase === "discard" &&
      view.turn === view.seat &&
      view.legalActions.some((action) => action.type === "Discard") &&
      view.fishing.some(
        (entry) => entry.seat !== view.seat && (view.opponents.find((other) => other.seat === entry.seat)?.melds.length ?? 0) >= 1,
      ),
  },

  announce: {
    title: "Your turn to declare fishing",
    seed: "offer-announce-v11-2",
    at: (view) =>
      view.phase === "announce" &&
      view.turn === view.seat &&
      view.legalActions.some((action) => action.type === "DeclareFishing"),
  },

  ron: {
    title: "A winning tile in the claim window",
    seed: "ron-v12-20",
    at: (view) =>
      view.phase === "claim" &&
      view.turn === view.seat &&
      view.legalActions.some((action) => action.type === "Win"),
  },

  win: {
    title: "A winning hand and its pattern",
    seed: "win-v12-1",
    at: (view) =>
      view.result !== null &&
      view.result.kind === "win" &&
      view.result.winner === view.seat &&
      view.result.points !== null,
  },

  drawn: {
    title: "A drawn hand",
    seed: "drawn-v5-2",
    at: (view) => view.result !== null && view.result.kind === "drawn",
  },

  result: {
    title: "The result panel with payments and fishing",
    seed: "result-v12-31",
    at: (_view, state) =>
      state.result !== null &&
      state.result.kind === "win" &&
      state.result.selfDrawn &&
      state.fishing.length >= 1,
  },

  claims: {
    title: "Melds, a kong and bonus tiles on the table",
    seed: "claims-76",
    at: (view) => {
      if (view.phase !== "discard" || view.turn !== view.seat) return false;
      if (!view.legalActions.some((action) => action.type === "Discard")) return false;
      const seats = [view.player, ...view.opponents];
      return (
        seats.filter((seat) => seat.melds.some((meld) => meld.exposed)).length >= 2 &&
        seats.reduce((sum, seat) => sum + seat.melds.length, 0) >= 3 &&
        seats.some((seat) => seat.melds.some((meld) => meld.kind === "kong"))
      );
    },
  },

  goulash: {
    title: "The first Goulash exchange",
    seed: "goulash-0",
    goulash: true,
    at: (view) =>
      view.phase === "exchange" &&
      view.goulash?.stage === 0 &&
      view.legalActions.some((action) => action.type === "GoulashExchange"),
  },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof TABLE;

export const SCENARIOS: Readonly<Record<ScenarioName, Scenario>> = TABLE;

export const SCENARIO_NAMES = Object.keys(TABLE) as ScenarioName[];

export function isScenarioName(value: string): value is ScenarioName {
  return Object.hasOwn(TABLE, value);
}

/**
 * Replay one scenario from its seed and stop at its board. The returned
 * session has no id yet: the store numbers it on admission.
 */
export function buildScenario(name: ScenarioName): Omit<WebSession, "id"> {
  const scenario: Scenario = SCENARIOS[name];
  const started = newGame(scenario.seed, { dealer: "E", goulash: scenario.goulash === true });
  let state = started.state;
  const steps: ReplayStep[] = [];
  const humanSteps: number[] = [];
  const events: Event[] = [...started.events];

  for (let step = 0; step <= MAX_STEPS; step++) {
    const view = viewFor(state, SEAT);
    if (scenario.at(view, state)) {
      return {
        seed: scenario.seed,
        seat: SEAT,
        state,
        steps,
        humanSteps,
        events,
        handStart: {
          step: 0,
          eventIndex: started.events.length,
          state: started.state,
          scoresBefore: ZERO_SCORES,
        },
      };
    }
    if (state.phase === "finished") break;

    const actor = state.turn;
    const action: Action | null = chooseAction(viewFor(state, actor), actor);
    if (action === null) {
      throw new Error(`${name}: the replay stalled with no legal action`);
    }
    const applied = apply(state, action);
    if (isApplyError(applied)) {
      throw new Error(`${name}: ${applied.error}`);
    }
    if (action.seat === SEAT) humanSteps.push(steps.length);
    steps.push(action);
    events.push(...applied.events);
    state = applied.state;
  }

  throw new Error(`${name}: the hand ended without reaching the state`);
}

/**
 * The live session for one scenario. A cached board is reused while it still
 * satisfies its condition, so reloading the page never changes it, and a
 * visitor who plays on gets the fixed board back on the next load.
 */
export function scenarioSession(
  store: GameStore,
  cache: Map<ScenarioName, string>,
  name: ScenarioName,
): WebSession {
  const cachedId = cache.get(name);
  if (cachedId !== undefined) {
    const session = store.get(cachedId);
    if (session !== undefined) {
      const view = viewFor(session.state, session.seat);
      if (SCENARIOS[name].at(view, session.state)) return session;
    }
  }
  const session = store.adopt(buildScenario(name));
  cache.set(name, session.id);
  return session;
}
