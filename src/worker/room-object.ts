/**
 * The Durable Object behind one online room (docs/MULTIPLAYER.md, M2).
 *
 * It lives in its own Worker (`wrangler.rooms.jsonc`, `src/worker/rooms.ts`):
 * Cloudflare gives no preview links to a Worker that implements a Durable
 * Object, and the app's Worker keeps its pull-request previews by only binding
 * to this one.
 *
 * The game logic is the pure `Room` (`src/table/room.ts`); this class only
 * stores its snapshot, keeps time with the object's alarm, and talks to the
 * phones over hibernating WebSockets. Each socket is sent the payload for its
 * own seat, so a concealed tile never reaches another phone.
 *
 * Client -> room: { type: "join", name, token? } | { type: "start" }
 *   | { type: "configure", settings } | { type: "act", action } | { type: "next" }
 *   | { type: "leave" } | { type: "ping" }
 * Room -> client: { type: "seated", seat, token } | { type: "room", ...RoomPayload }
 *   | { type: "error", error } | { type: "pong" } | { type: "left" }
 */

import type { Action } from "../core/game/actions.ts";
import type { Seat } from "../core/game/state.ts";
import type { Event } from "../core/game/events.ts";
import { isRoomError, isRoomSnapshot, Room, type RoomSettings, type RoomSnapshot } from "../table/room.ts";

/** What the object keeps: the room, and which deadline its alarm is for. */
const ROOM_KEY = "room";
const TIMER_KEY = "timer";

/** The pause before each bot decision, so people can follow the table. */
export const BOT_DELAY_MS = 900;
/** How long a finished hand's result stays up before the next deal, when the room has a time limit. */
export const RESULT_SECONDS = 60;
/** Largest message a phone may send. */
const MAX_MESSAGE = 8_000;

export interface RoomSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(time: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface RoomObjectState {
  readonly storage: RoomStorage;
  acceptWebSocket(socket: RoomSocket): void;
  getWebSockets(): RoomSocket[];
}

/** What the Workers runtime provides, passed in so the tests can stand in for it. */
export interface RoomRuntime {
  now(): number;
  /** A fresh secret: seat tokens and seeds. */
  random(): string;
  /** A connected pair: the client end goes back in the 101 response. */
  pair(): { readonly client: unknown; readonly server: RoomSocket };
  upgrade(client: unknown): Response;
}

interface Timer {
  readonly kind: "bot" | "turn" | "result";
  readonly stamp: number;
  readonly at: number;
}

interface Attachment {
  readonly seat: Seat | null;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function parse(message: unknown): Record<string, unknown> | null {
  if (typeof message !== "string" || message.length > MAX_MESSAGE) return null;
  try {
    const value: unknown = JSON.parse(message);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class RoomObject {
  private readonly state: RoomObjectState;
  private readonly runtime: RoomRuntime;
  /** The room while the object is awake; reloaded from storage after hibernation. */
  private room: Room | null = null;

  constructor(state: RoomObjectState, _env: unknown, runtime: RoomRuntime = workersRuntime()) {
    this.state = state;
    this.runtime = runtime;
  }

  /**
   * `POST /create?code=` opens the room (409 when the code is taken);
   * `GET /` with `Upgrade: websocket` connects a phone.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") {
      if ((await this.load()) !== null) return json(409, { error: "room code taken" });
      const code = url.searchParams.get("code") ?? "";
      this.room = new Room(code);
      await this.save();
      return json(201, { code });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json(426, { error: "a room is joined over a WebSocket" });
    }
    if ((await this.load()) === null) return json(404, { error: "no such room" });
    const { client, server } = this.runtime.pair();
    server.serializeAttachment({ seat: null } satisfies Attachment);
    this.state.acceptWebSocket(server);
    return this.runtime.upgrade(client);
  }

  async webSocketMessage(socket: RoomSocket, message: unknown): Promise<void> {
    const room = await this.load();
    const request = parse(message);
    if (room === null) return socket.close(4404, "no such room");
    if (request === null) return this.send(socket, { type: "error", error: "unreadable message" });
    const seat = seatOf(socket);
    const fail = (error: string) => this.send(socket, { type: "error", error });

    switch (request.type) {
      case "ping":
        return this.send(socket, { type: "pong" });
      case "join": {
        if (seat !== null) return fail("you are already seated");
        const given = typeof request.token === "string" && request.token.length > 0 && request.token.length <= 64;
        const token = given ? (request.token as string) : this.runtime.random();
        const name = typeof request.name === "string" ? request.name : "";
        const joined = room.join(name, token);
        if (isRoomError(joined)) return fail(joined.error);
        socket.serializeAttachment({ seat: joined.seat } satisfies Attachment);
        this.send(socket, { type: "seated", seat: joined.seat, token });
        return this.changed([]);
      }
    }

    if (seat === null) return fail("join the room first");
    switch (request.type) {
      case "start": {
        const started = room.start(this.runtime.random());
        if (isRoomError(started)) return fail(started.error);
        return this.changed(started.events);
      }
      case "configure": {
        const settings = request.settings;
        if (typeof settings !== "object" || settings === null) return fail("settings are required");
        const configured = room.configure(settings as Partial<RoomSettings>);
        if (isRoomError(configured)) return fail(configured.error);
        return this.changed([]);
      }
      case "act": {
        const action = request.action;
        if (typeof action !== "object" || action === null) return fail("action is required");
        const acted = room.act(seat, action as Action);
        if (isRoomError(acted)) return fail(acted.error);
        return this.changed(acted.events);
      }
      case "next": {
        const next = room.nextHand(seat);
        if (isRoomError(next)) return fail(next.error);
        return this.changed(next.events);
      }
      case "leave": {
        room.leave(seat);
        socket.serializeAttachment({ seat: null } satisfies Attachment);
        this.send(socket, { type: "left" });
        return this.changed([]);
      }
      default:
        return fail(`unknown message: ${String(request.type)}`);
    }
  }

  async webSocketClose(socket: RoomSocket): Promise<void> {
    await this.dropped(socket);
  }

  async webSocketError(socket: RoomSocket): Promise<void> {
    await this.dropped(socket);
  }

  /** A deadline fell due: a bot's move, a person's time, or the result screen's. */
  async alarm(): Promise<void> {
    const room = await this.load();
    const timer = await this.state.storage.get<Timer>(TIMER_KEY);
    if (room === null || timer === undefined) return;
    await this.state.storage.delete(TIMER_KEY);
    if (timer.stamp !== room.stamp()) return this.schedule();
    if (timer.kind === "bot") {
      const stepped = room.stepBot();
      if (stepped === null || isRoomError(stepped)) return this.schedule();
      return this.changed(stepped.events);
    }
    if (timer.kind === "turn") {
      const timed = room.timeout(timer.stamp);
      if (timed === null || isRoomError(timed)) return this.schedule();
      return this.changed(timed.events);
    }
    const dealt = room.forceNextHand();
    if (isRoomError(dealt)) return this.schedule();
    return this.changed(dealt.events);
  }

  private async dropped(socket: RoomSocket): Promise<void> {
    const seat = seatOf(socket);
    const room = await this.load();
    if (seat === null || room === null) return;
    const stillHere = this.state
      .getWebSockets()
      .some((other) => other !== socket && seatOf(other) === seat);
    if (stillHere) return;
    room.disconnect(seat);
    await this.changed([]);
  }

  /** Save, tell every seated phone, and set the next deadline. */
  private async changed(events: readonly Event[]): Promise<void> {
    const room = this.room;
    if (room === null) return;
    await this.save();
    for (const socket of this.state.getWebSockets()) {
      const seat = seatOf(socket);
      if (seat !== null) this.send(socket, { type: "room", ...room.payloadFor(seat, events) });
    }
    await this.schedule();
  }

  private async schedule(): Promise<void> {
    const room = this.room;
    if (room === null) return;
    const now = this.runtime.now();
    const waiting = room.waitingOn();
    const seconds = room.settings.turnSeconds;
    let timer: Timer | null = null;
    if (waiting !== null && !waiting.human) {
      timer = { kind: "bot", stamp: room.stamp(), at: now + BOT_DELAY_MS };
    } else if (waiting !== null && seconds !== null) {
      timer = { kind: "turn", stamp: room.stamp(), at: now + seconds * 1000 };
    } else if (waiting === null && room.started && seconds !== null && room.humans().length > 0) {
      timer = { kind: "result", stamp: room.stamp(), at: now + RESULT_SECONDS * 1000 };
    }
    if (timer === null) {
      await this.state.storage.delete(TIMER_KEY);
      await this.state.storage.deleteAlarm();
      return;
    }
    const current = await this.state.storage.get<Timer>(TIMER_KEY);
    // A person's clock is not restarted by a change that left them to move.
    if (current !== undefined && current.kind === timer.kind && current.stamp === timer.stamp) return;
    await this.state.storage.put(TIMER_KEY, timer);
    await this.state.storage.setAlarm(timer.at);
  }

  private async load(): Promise<Room | null> {
    if (this.room !== null) return this.room;
    const snapshot = await this.state.storage.get<RoomSnapshot>(ROOM_KEY);
    if (snapshot === undefined || !isRoomSnapshot(snapshot)) return null;
    const restored = Room.restore(snapshot);
    if (isRoomError(restored)) return null;
    // A restore starts everyone disconnected; the open sockets say who is here.
    for (const socket of this.state.getWebSockets()) {
      const seat = seatOf(socket);
      const token = seat === null ? undefined : snapshot.players[seat]?.token;
      if (token !== undefined) restored.join("", token);
    }
    this.room = restored;
    return restored;
  }

  private async save(): Promise<void> {
    if (this.room !== null) await this.state.storage.put(ROOM_KEY, this.room.snapshot());
  }

  private send(socket: RoomSocket, message: unknown): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // The phone has gone; its close event tidies up.
    }
  }
}

function seatOf(socket: RoomSocket): Seat | null {
  const attachment = socket.deserializeAttachment() as Attachment | null;
  return attachment?.seat ?? null;
}

/** The Workers runtime's own pieces; only called inside a Worker. */
function workersRuntime(): RoomRuntime {
  return {
    now: () => Date.now(),
    random: () => crypto.randomUUID(),
    pair() {
      const Pair = (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, unknown> }).WebSocketPair;
      const pair = new Pair();
      return { client: pair[0], server: pair[1] as RoomSocket };
    },
    upgrade: (client) => new Response(null, { status: 101, webSocket: client } as ResponseInit),
  };
}
