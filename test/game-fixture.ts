/**
 * Shared fixture for the turn-engine tests.
 *
 * `newGame(seed)` is the real entry point; most rule tests need a hand in a
 * particular position, so this helper starts from a real deal and replaces
 * the four hands and the wall. The result is still a plain GameState, so the
 * reducer cannot tell the difference between it and a dealt hand.
 */

import {
  apply,
  isApplyError,
  newGame,
  serialize,
  sortKeys,
  type Action,
  type ApplyOk,
  type ClaimWindow,
  type FishingState,
  type GameState,
  type MeldState,
  type Phase,
  type Seat,
} from "../src/core/game/index.ts";

export interface FixtureOptions {
  readonly seed?: string | number;
  readonly dealer?: Seat;
  readonly hands?: Partial<Record<Seat, string | readonly string[]>>;
  readonly melds?: Partial<Record<Seat, readonly MeldState[]>>;
  readonly discards?: Partial<Record<Seat, readonly string[]>>;
  readonly flowers?: Partial<Record<Seat, string | readonly string[]>>;
  readonly seasons?: Partial<Record<Seat, string | readonly string[]>>;
  readonly wall?: readonly string[];
  readonly loose?: readonly string[];
  readonly phase?: Phase;
  readonly turn?: Seat;
  readonly fishing?: readonly FishingState[];
  readonly claimWindow?: ClaimWindow;
  readonly lastDraw?: { readonly seat: Seat; readonly tile: string; readonly end: "front" | "back" };
  readonly result?: GameState["result"];
  readonly prevailingWind?: GameState["prevailingWind"];
  readonly gameOver?: boolean;
  readonly drawRepeatUsed?: boolean;
  readonly variant?: "western" | "chinese";
  readonly kitty?: number;
  readonly goulash?: boolean;
}

export function fixture(options: FixtureOptions = {}): GameState {
  const base = newGame(options.seed ?? "fixture", { dealer: options.dealer ?? "E" }).state;
  const state = JSON.parse(serialize(base));
  const dealer = options.dealer ?? "E";
  state.dealer = dealer;
  state.phase = options.phase ?? "draw";
  state.turn = options.turn ?? dealer;
  state.lastDiscard = null;
  state.claimWindow = options.claimWindow ?? null;
  state.fishing = options.fishing ? [...options.fishing] : [];
  state.ledger = [];
  state.eventSeq = 0;
  state.lastDraw = options.lastDraw ?? null;
  state.result = options.result ?? null;
  state.prevailingWind = options.prevailingWind ?? state.prevailingWind;
  state.gameOver = options.gameOver ?? false;
  state.drawRepeatUsed = options.drawRepeatUsed ?? false;
  state.variant = options.variant ?? "western";
  state.kitty = options.kitty ?? 0;
  state.goulash = options.goulash ?? false;
  state.handNumber = 1;

  const keysOf = (input: string | readonly string[]): string[] =>
    typeof input === "string" ? input.trim().split(/\s+/).filter(Boolean) : [...input];

  for (const player of state.players) {
    const hand = options.hands?.[player.seat as Seat];
    player.hand = sortKeys(hand === undefined ? player.hand : keysOf(hand));
    player.melds = options.melds?.[player.seat as Seat]
      ? options.melds[player.seat as Seat]!.map((meld) => ({
          ...meld,
          tiles: [...meld.tiles],
        }))
      : [];
    const flowers = options.flowers?.[player.seat as Seat];
    const seasons = options.seasons?.[player.seat as Seat];
    player.flowers = flowers === undefined ? [] : keysOf(flowers);
    player.seasons = seasons === undefined ? [] : keysOf(seasons);
    player.discards = options.discards?.[player.seat as Seat]
      ? [...options.discards[player.seat as Seat]!]
      : [];
  }

  const wall = options.wall ? [...options.wall] : [...base.wall.tiles];
  state.wall = {
    tiles: wall,
    front: 0,
    back: wall.length - 1,
    loose: options.loose ? [...options.loose] : [],
  };
  return state as GameState;
}

export function play(state: GameState, action: Action): ApplyOk {
  const result = apply(state, action);
  if (isApplyError(result)) throw new Error(`unexpected error: ${result.error}`);
  return result;
}

/** Apply one action and assert it failed with a matching rule name. */
export function playError(state: GameState, action: Action, pattern: RegExp): string {
  const result = apply(state, action);
  if (!isApplyError(result)) throw new Error(`expected an error for ${action.type}`);
  if (!pattern.test(result.error)) {
    throw new Error(`error "${result.error}" does not match ${pattern}`);
  }
  return result.error;
}

export function handOf(state: GameState, seat: Seat): readonly string[] {
  return state.players.find((player) => player.seat === seat)!.hand;
}

