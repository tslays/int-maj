/**
 * Replay a hand from its public event log.
 *
 * The event log is self-sufficient: it names the seat and the tile keys for
 * every deliberate act, so the action list can be reconstructed without the
 * hidden hands. Claims that lost a precedence race produce no `Claimed`
 * event; the replayer auto-passes those seats, which yields the same winner
 * and the same final state.
 *
 * `stepsFromEvents` is the inverse of `apply` for the events that carry an
 * action; automatic events (deal, replacement, promotion, scoring, payments)
 * are skipped because the reducer regenerates them.
 */

import type { Action } from "./actions.ts";
import type { Event } from "./events.ts";
import { isApplyError, type ApplyOk } from "./draft.ts";
import { newGame, nextHand } from "./deal.ts";
import { apply } from "./reduce.ts";
import type { GameState, Seat } from "./state.ts";

export type ReplayStep =
  | Action
  /** `excludedHands` is present when a house rule changed with this deal. */
  | { readonly type: "NextHand"; readonly excludedHands?: readonly string[] };

export function stepsFromEvents(events: readonly Event[]): ReplayStep[] {
  const steps: ReplayStep[] = [];
  for (const event of events) {
    switch (event.type) {
      case "Drew":
        if (event.end === "front" && !event.replacement) {
          steps.push({ type: "Draw", seat: event.seat });
        }
        break;
      case "Discarded":
        steps.push({ type: "Discard", seat: event.seat, tile: event.tile });
        break;
      case "Claimed":
        steps.push({
          type: "Claim",
          seat: event.seat,
          kind: event.kind,
          tiles: event.tiles,
        });
        break;
      case "KongDeclared":
        steps.push(
          event.kind === "concealed"
            ? { type: "ConcealedKong", seat: event.seat, tile: event.tile }
            : { type: "AddedKong", seat: event.seat, tile: event.tile },
        );
        break;
      case "FishingDeclared":
        steps.push({ type: "DeclareFishing", seat: event.seat, wait: event.wait });
        break;
      case "WinDeclared":
        steps.push(
          event.selfDrawn
            ? { type: "Win", seat: event.seat, kind: "self-drawn" }
            : { type: "Claim", seat: event.seat, kind: "mahjong", tiles: [event.tile] },
        );
        break;
      case "GoulashExchanged":
        steps.push(
          { type: "GoulashExchange", seat: event.a.seat, tiles: event.a.tiles },
          { type: "GoulashExchange", seat: event.b.seat, tiles: event.b.tiles },
        );
        break;
      case "Reshuffled":
        steps.push({ type: "RequestReshuffle", seat: event.seat });
        break;
      case "NextDeal":
        steps.push(
          event.excludedHands === undefined
            ? { type: "NextHand" }
            : { type: "NextHand", excludedHands: event.excludedHands },
        );
        break;
      default:
        break;
    }
  }
  return steps;
}

function autoPass(
  state: GameState,
  step: ReplayStep,
  log: Event[],
): GameState {
  let current = state;
  while (current.phase === "announce") {
    if (
      (step.type === "DeclareFishing" || step.type === "Pass") &&
      step.seat === current.turn
    ) {
      break;
    }
    const result = apply(current, { type: "Pass", seat: current.turn });
    if (isApplyError(result)) throw new Error(`replay pass failed: ${result.error}`);
    current = result.state;
    log.push(...result.events);
  }
  while (current.phase === "claim" && current.claimWindow !== null) {
    const pending = current.claimWindow.pending[0];
    if (pending === undefined) break;
    const isClaim = step.type === "Claim" || step.type === "Win";
    if (isClaim && step.seat === pending) break;
    if (step.type === "Pass" && step.seat === pending) break;
    const result = apply(current, { type: "Pass", seat: pending });
    if (isApplyError(result)) throw new Error(`replay pass failed: ${result.error}`);
    current = result.state;
    log.push(...result.events);
  }
  return current;
}

export interface ReplayOptions {
  /** The hand's first dealer, when the caller fixed it rather than the seed. */
  readonly dealer?: Seat;
  /** House rule the game was dealt with: hands the table plays without. */
  readonly excludedHands?: readonly string[];
}

export function replaySteps(
  seed: string | number,
  steps: readonly ReplayStep[],
  options: ReplayOptions = {},
): ApplyOk {
  const start = newGame(seed, {
    ...(options.dealer === undefined ? {} : { dealer: options.dealer }),
    ...(options.excludedHands === undefined ? {} : { excludedHands: options.excludedHands }),
  });
  const rest = replayFrom(start.state, steps);
  return { state: rest.state, events: [...start.events, ...rest.events] };
}

/**
 * Continue from any state, typically one saved at the start of a hand, so a
 * resume or an undo replays one hand instead of the whole game from its seed.
 * The returned events are only those the steps produced.
 */
export function replayFrom(start: GameState, steps: readonly ReplayStep[]): ApplyOk {
  let state = start;
  const events: Event[] = [];

  for (const step of steps) {
    if (step.type === "NextHand") {
      if (state.phase !== "finished") {
        throw new Error("NextHand step before the hand finished");
      }
      const next = nextHand(
        state,
        step.excludedHands === undefined ? {} : { excludedHands: step.excludedHands },
      );
      state = next.state;
      events.push(...next.events);
      continue;
    }
    state = autoPass(state, step, events);
    const result = apply(state, step);
    if (isApplyError(result)) {
      throw new Error(`replay ${step.type} by ${step.seat} failed: ${result.error}`);
    }
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Convenience: seed + event log -> the same state and a byte-identical log. */
export function replayEventLog(
  seed: string | number,
  log: readonly Event[],
  options: ReplayOptions = {},
): ApplyOk {
  return replaySteps(seed, stepsFromEvents(log), options);
}
