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
import { apply, isApplyError, newGame, nextHand, type ApplyOk } from "./reduce.ts";
import type { GameState } from "./state.ts";

export type ReplayStep = Action | { readonly type: "NextHand" };

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
        steps.push({ type: "NextHand" });
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

export function replaySteps(seed: string | number, steps: readonly ReplayStep[]): ApplyOk {
  const start = newGame(seed);
  let state = start.state;
  const events: Event[] = [...start.events];

  for (const step of steps) {
    if (step.type === "NextHand") {
      if (state.phase !== "finished") {
        throw new Error("NextHand step before the hand finished");
      }
      const next = nextHand(state);
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
export function replayEventLog(seed: string | number, log: readonly Event[]): ApplyOk {
  return replaySteps(seed, stepsFromEvents(log));
}
