/**
 * An online room: one game, one to four human players, bots in the other
 * seats (docs/MULTIPLAYER.md, slice M1).
 *
 * The room is pure, like the rest of the table service: the Durable Object
 * in `src/worker/` holds one, stores its snapshot, keeps time and sends each
 * player the payload `payloadFor` builds for their seat. Nothing here reads a
 * clock or makes randomness; seat tokens and seeds come from the caller.
 *
 * The engine asks one seat at a time - in a claim window `turn` walks through
 * the pending seats - so the room always waits on exactly one seat, the
 * `actor`. A human actor is waited for; a bot, or a human who has dropped,
 * is played by the bot policy. When a human lets their time run out, the room
 * makes the move that changes least (`fallbackAction`, recorded as
 * assumption A-TIMER in `rules/archive/ASSUMPTIONS.md`).
 *
 * Undo and retry are not offered: they would take back other players' turns.
 */

import type { Action } from "../core/game/actions.ts";
import { chooseAction, DEFAULT_BOT_LEVEL, isBotLevel, type BotLevel } from "../core/game/bot.ts";
import { describeEventFor } from "../core/game/describe.ts";
import type { Event } from "../core/game/events.ts";
import { SEATS, type Seat } from "../core/game/state.ts";
import { viewFor } from "../core/game/view.ts";
import {
  DEFAULT_HOUSE_RULES,
  GameStore,
  isDone,
  isSessionSnapshot,
  statePayload,
  type HouseRules,
  type SessionSnapshot,
  type StatePayload,
  type WebSession,
} from "./session.ts";

export interface RoomSettings {
  readonly houseRules: HouseRules;
  readonly botLevel: BotLevel;
  /** Seconds a human has for each decision; null waits for ever. */
  readonly turnSeconds: number | null;
}

export const DEFAULT_TURN_SECONDS = 30;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = Object.freeze({
  houseRules: DEFAULT_HOUSE_RULES,
  botLevel: DEFAULT_BOT_LEVEL,
  turnSeconds: DEFAULT_TURN_SECONDS,
});

/** Longest name a player may give; the rest is cut. */
export const NAME_LIMIT = 16;

interface Player {
  readonly name: string;
  /** The secret the phone keeps to take its seat back after a drop. */
  readonly token: string;
  connected: boolean;
}

/** One seat as every player in the room sees it. */
export interface LobbySeat {
  readonly seat: Seat;
  /** null: nobody sits here, a bot plays the seat. */
  readonly name: string | null;
  readonly connected: boolean;
  /** Asked for the next hand (only while a hand is finished). */
  readonly ready: boolean;
}

export interface LobbyPayload {
  readonly code: string;
  readonly started: boolean;
  readonly seats: readonly LobbySeat[];
  readonly settings: RoomSettings;
  /** Whose decision the table waits on, and whether a person makes it. */
  readonly waitingOn: { readonly seat: Seat; readonly human: boolean } | null;
  /** Counts the decisions taken; a deadline is for one stamp only. */
  readonly stamp: number;
}

/** What one seat is sent after anything changes. */
export interface RoomPayload {
  readonly room: LobbyPayload;
  /** The seat this payload is for. */
  readonly you: Seat;
  /** The table, from this seat's own projection; null before the deal. */
  readonly state: StatePayload | null;
  /** This change's events in the words this seat may read. */
  readonly events: readonly string[];
}

export interface RoomUpdate {
  /** Events produced by this change, for `payloadFor` to word per seat. */
  readonly events: readonly Event[];
}

export type RoomResult<T = RoomUpdate> = T | { readonly error: string };

export function isRoomError<T>(result: RoomResult<T>): result is { readonly error: string } {
  return typeof result === "object" && result !== null && "error" in result;
}

export interface RoomSnapshot {
  readonly version: 1;
  readonly code: string;
  readonly settings: RoomSettings;
  readonly players: Partial<Record<Seat, { readonly name: string; readonly token: string }>>;
  readonly ready: readonly Seat[];
  readonly game: SessionSnapshot | null;
}

/**
 * The move a player makes when their time runs out: the one that changes
 * least. Pass a claim or an announcement, draw when it is time to draw,
 * throw the tile just drawn; anything else (a Goulash exchange, a throw
 * after a claim) is left to the bot policy, which always has an answer.
 */
export function fallbackAction(session: WebSession, seat: Seat, level: BotLevel): Action | null {
  const view = viewFor(session.state, seat);
  const legal = view.legalActions;
  if (legal.length === 0) return null;
  const pass = legal.find((action) => action.type === "Pass");
  if (pass !== undefined) return pass;
  const draw = legal.find((action) => action.type === "Draw");
  if (draw !== undefined) return draw;
  const drawn = session.state.lastDraw;
  if (drawn !== null && drawn.seat === seat) {
    const throwDrawn = legal.find((action) => action.type === "Discard" && action.tile === drawn.tile);
    if (throwDrawn !== undefined) return throwDrawn;
  }
  return chooseAction(view, seat, level);
}

export class Room {
  readonly code: string;
  private settingsNow: RoomSettings;
  private readonly store = new GameStore();
  private gameId: string | null = null;
  private readonly players = new Map<Seat, Player>();
  private readonly ready = new Set<Seat>();

  constructor(code: string, settings: Partial<RoomSettings> = {}) {
    this.code = code;
    this.settingsNow = { ...DEFAULT_ROOM_SETTINGS, ...settings };
  }

  get settings(): RoomSettings {
    return this.settingsNow;
  }

  get started(): boolean {
    return this.gameId !== null;
  }

  private session(): WebSession | undefined {
    return this.gameId === null ? undefined : this.store.get(this.gameId);
  }

  /** The seats a connected person plays. */
  humans(): Seat[] {
    return SEATS.filter((seat) => this.players.get(seat)?.connected === true);
  }

  /** The seat holding `token`, if any. */
  seatOf(token: string): Seat | null {
    for (const [seat, player] of this.players) if (player.token === token) return seat;
    return null;
  }

  /**
   * Take a seat. A token the room knows gets its own seat back (a phone that
   * dropped); a new token takes the first seat nobody holds, even mid-game,
   * where it takes over from the bot.
   */
  join(name: string, token: string): RoomResult<{ readonly seat: Seat; readonly rejoined: boolean }> {
    if (token.length === 0) return { error: "a seat token is required" };
    const known = this.seatOf(token);
    if (known !== null) {
      this.players.get(known)!.connected = true;
      return { seat: known, rejoined: true };
    }
    const free = SEATS.find((seat) => !this.players.has(seat));
    if (free === undefined) return { error: "the room is full" };
    const trimmed = name.trim().slice(0, NAME_LIMIT);
    this.players.set(free, { name: trimmed.length === 0 ? `Player ${free}` : trimmed, token, connected: true });
    return { seat: free, rejoined: false };
  }

  /** The phone went away; a bot plays the seat until it comes back. */
  disconnect(seat: Seat): void {
    const player = this.players.get(seat);
    if (player !== undefined) player.connected = false;
    this.ready.delete(seat);
  }

  /** Give the seat up for good; a bot plays it, and anyone may take it. */
  leave(seat: Seat): void {
    this.players.delete(seat);
    this.ready.delete(seat);
  }

  /** Change the settings; the house rules only before the deal. */
  configure(settings: Partial<RoomSettings>): RoomResult<RoomSettings> {
    if (settings.houseRules !== undefined && this.started) {
      return { error: "house rules are set before the deal" };
    }
    if (settings.botLevel !== undefined && !isBotLevel(settings.botLevel)) {
      return { error: `unknown bot level: ${String(settings.botLevel)}` };
    }
    const seconds = settings.turnSeconds;
    if (seconds !== undefined && seconds !== null && !(Number.isInteger(seconds) && seconds >= 5 && seconds <= 600)) {
      return { error: "turnSeconds must be a whole number from 5 to 600, or null" };
    }
    this.settingsNow = { ...this.settingsNow, ...settings };
    return this.settingsNow;
  }

  /** Deal the game; empty seats are played by bots. */
  start(seed: string | number): RoomResult {
    if (this.started) return { error: "the game has started" };
    if (this.players.size === 0) return { error: "nobody is seated" };
    const created = this.store.create(seed, this.settingsNow.houseRules);
    this.gameId = created.session.id;
    return { events: created.events };
  }

  /** Whose decision the table waits on, or null (no game, or a hand is over). */
  waitingOn(): { readonly seat: Seat; readonly human: boolean } | null {
    const session = this.session();
    if (session === undefined || session.state.phase === "finished") return null;
    const seat = session.state.turn;
    return { seat, human: this.humans().includes(seat) };
  }

  /** The number of decisions taken so far; a deadline names the stamp it was set at. */
  stamp(): number {
    return this.session()?.steps.length ?? 0;
  }

  /** A player's decision. Only their own seat, and only one the engine allows. */
  act(seat: Seat, action: Action): RoomResult {
    if (this.gameId === null) return { error: "the game has not started" };
    if (this.players.get(seat) === undefined) return { error: "you have no seat" };
    if (action.seat !== seat) return { error: `not your seat: ${String(action.seat)}` };
    const update = this.store.move(this.gameId, action, [seat]);
    if ("error" in update) return update;
    return { events: update.events };
  }

  /**
   * One bot decision when the actor is a bot or a dropped player; null when
   * the table waits on a connected person, or the hand is over.
   */
  stepBot(): RoomResult | null {
    if (this.gameId === null) return null;
    const update = this.store.step(this.gameId, this.settingsNow.botLevel, this.humans());
    if (isDone(update)) return null;
    if ("error" in update) return update;
    return { events: update.events };
  }

  /**
   * The actor's time ran out: make `fallbackAction` for them. `stamp` is the
   * one the deadline was set at; if anything has happened since, the deadline
   * is stale and nothing changes (null).
   */
  timeout(stamp: number): RoomResult | null {
    const session = this.session();
    if (session === undefined || this.gameId === null || stamp !== this.stamp()) return null;
    const waiting = this.waitingOn();
    if (waiting === null) return null;
    const action = fallbackAction(session, waiting.seat, this.settingsNow.botLevel);
    if (action === null) return null;
    const update = this.store.move(this.gameId, action, [waiting.seat]);
    if ("error" in update) return update;
    return { events: update.events };
  }

  /**
   * A player asks for the next hand. It is dealt once every connected player
   * has asked (`dealt`), so nobody is hurried off the result screen.
   */
  nextHand(seat: Seat): RoomResult<RoomUpdate & { readonly dealt: boolean }> {
    const session = this.session();
    if (session === undefined || this.gameId === null) return { error: "the game has not started" };
    if (session.state.phase !== "finished") return { error: "the hand is not over" };
    if (this.players.get(seat) === undefined) return { error: "you have no seat" };
    this.ready.add(seat);
    return this.dealIfReady();
  }

  /** Deal the next hand regardless of who asked: the result screen's time ran out. */
  forceNextHand(): RoomResult<RoomUpdate & { readonly dealt: boolean }> {
    for (const seat of this.humans()) this.ready.add(seat);
    return this.dealIfReady();
  }

  private dealIfReady(): RoomResult<RoomUpdate & { readonly dealt: boolean }> {
    if (this.gameId === null) return { error: "the game has not started" };
    if (!this.humans().every((seat) => this.ready.has(seat))) return { events: [], dealt: false };
    const update = this.store.next(this.gameId);
    if ("error" in update) return update;
    this.ready.clear();
    return { events: update.events, dealt: true };
  }

  /** Read-only inspection for tests; never sent to a player. */
  inspect(): WebSession | undefined {
    return this.session();
  }

  lobby(): LobbyPayload {
    return {
      code: this.code,
      started: this.started,
      seats: SEATS.map((seat) => {
        const player = this.players.get(seat);
        return {
          seat,
          name: player?.name ?? null,
          connected: player?.connected ?? false,
          ready: this.ready.has(seat),
        };
      }),
      settings: this.settingsNow,
      waitingOn: this.waitingOn(),
      stamp: this.stamp(),
    };
  }

  /**
   * Everything one seat is sent: the lobby, the table from that seat's own
   * `viewFor` projection, and the change's events in the words it may read.
   */
  payloadFor(seat: Seat, events: readonly Event[] = []): RoomPayload {
    const session = this.session();
    return {
      room: this.lobby(),
      you: seat,
      state: session === undefined ? null : statePayload({ ...session, seat }),
      events: events.flatMap((event) => describeEventFor(event, seat).split("\n")),
    };
  }

  snapshot(): RoomSnapshot {
    const players: Partial<Record<Seat, { name: string; token: string }>> = {};
    for (const [seat, player] of this.players) players[seat] = { name: player.name, token: player.token };
    return {
      version: 1,
      code: this.code,
      settings: this.settingsNow,
      players,
      ready: [...this.ready],
      game: this.gameId === null ? null : (this.store.snapshot(this.gameId) ?? null),
    };
  }

  /** A room from its snapshot; every player starts disconnected until they rejoin. */
  static restore(snapshot: RoomSnapshot): RoomResult<Room> {
    if (!isRoomSnapshot(snapshot)) return { error: "not a room snapshot" };
    const room = new Room(snapshot.code, snapshot.settings);
    for (const seat of SEATS) {
      const player = snapshot.players[seat];
      if (player !== undefined) room.players.set(seat, { ...player, connected: false });
    }
    for (const seat of snapshot.ready) if (SEATS.includes(seat)) room.ready.add(seat);
    if (snapshot.game !== null) {
      const restored = room.store.restore(snapshot.game);
      if ("error" in restored) return restored;
      room.gameId = restored.session.id;
    }
    return room;
  }
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const players = record.players as Record<string, unknown> | undefined;
  return (
    record.version === 1 &&
    typeof record.code === "string" &&
    typeof record.settings === "object" &&
    record.settings !== null &&
    typeof players === "object" &&
    players !== null &&
    Object.entries(players).every(
      ([seat, player]) =>
        SEATS.includes(seat as Seat) &&
        typeof player === "object" &&
        player !== null &&
        typeof (player as Record<string, unknown>).name === "string" &&
        typeof (player as Record<string, unknown>).token === "string",
    ) &&
    Array.isArray(record.ready) &&
    (record.game === null || isSessionSnapshot(record.game))
  );
}
