/**
 * The online room's Durable Object and the app Worker's room routes
 * (docs/MULTIPLAYER.md, M2), with the Workers runtime stood in for:
 *   - a room opens once per code and is joined over a WebSocket
 *   - each socket gets its own seat's payload; strangers get nothing
 *   - bots and timed-out people are moved by the alarm, stale alarms do nothing
 *   - a dropped phone's seat goes to the bot; the room survives hibernation
 *   - the routes validate codes, rate-limit new rooms, and need the binding
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseAction } from "../../src/core/game/bot.ts";
import type { Seat } from "../../src/core/game/state.ts";
import { RoomObject, type RoomObjectState, type RoomRuntime, type RoomSocket, type RoomStorage } from "../../src/worker/room-object.ts";
import { handleRoom, isRoomCode, newCode, type RoomNamespace } from "../../src/worker/room-route.ts";

class FakeSocket implements RoomSocket {
  readonly sent: Record<string, unknown>[] = [];
  closed = false;
  private attachment: unknown = null;
  send(message: string): void {
    this.sent.push(JSON.parse(message) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
  }
  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  last(type: string): Record<string, unknown> | undefined {
    return this.sent.findLast((message) => message.type === type);
  }
}

class FakeState implements RoomObjectState {
  readonly data = new Map<string, unknown>();
  alarm: number | null = null;
  sockets: FakeSocket[] = [];
  readonly storage: RoomStorage = {
    get: async <T>(key: string) => structuredClone(this.data.get(key)) as T | undefined,
    put: async (key, value) => void this.data.set(key, structuredClone(value)),
    delete: async (key) => this.data.delete(key),
    setAlarm: async (time) => void (this.alarm = time),
    deleteAlarm: async () => void (this.alarm = null),
  };
  acceptWebSocket(socket: RoomSocket): void {
    this.sockets.push(socket as FakeSocket);
  }
  getWebSockets(): RoomSocket[] {
    return this.sockets.filter((socket) => !socket.closed);
  }
}

function runtime(): RoomRuntime & { clock: number } {
  let n = 0;
  const fake = {
    clock: 1_000_000,
    now: () => fake.clock,
    random: () => `secret-${++n}`,
    pair: () => ({ client: {}, server: new FakeSocket() }),
    // Node's Response refuses status 101; the test only needs the server end accepted.
    upgrade: () => new Response(null, { status: 204 }),
  };
  return fake;
}

const upgrade = () => new Request("https://room/", { headers: { upgrade: "websocket" } });

async function openRoom() {
  const state = new FakeState();
  const clock = runtime();
  const object = new RoomObject(state, {}, clock);
  const created = await object.fetch(new Request("https://room/create?code=ABCD", { method: "POST" }));
  assert.equal(created.status, 201);
  return { state, clock, object };
}

async function connect(object: RoomObject, state: FakeState): Promise<FakeSocket> {
  await object.fetch(upgrade());
  return state.sockets.at(-1)!;
}

const say = (object: RoomObject, socket: FakeSocket, message: unknown) =>
  object.webSocketMessage(socket, JSON.stringify(message));

interface Payload {
  readonly you: Seat;
  readonly room: { readonly waitingOn: { seat: Seat; human: boolean } | null; readonly seats: { connected: boolean }[] };
  readonly state: { readonly view: Parameters<typeof chooseAction>[0]; readonly seat: Seat; readonly outcome: unknown } | null;
}

const latest = (socket: FakeSocket) => socket.last("room") as unknown as Payload;

describe("room object", () => {
  it("opens a room once and refuses a socket before it exists or without an upgrade", async () => {
    const { object } = await openRoom();
    const again = await object.fetch(new Request("https://room/create?code=ABCD", { method: "POST" }));
    assert.equal(again.status, 409);
    assert.equal((await object.fetch(new Request("https://room/"))).status, 426);
    const empty = new RoomObject(new FakeState(), {}, runtime());
    assert.equal((await empty.fetch(upgrade())).status, 404);
  });

  it("seats two phones, deals, and sends each only its own seat", async () => {
    const { state, object } = await openRoom();
    const ann = await connect(object, state);
    const bo = await connect(object, state);
    const stranger = await connect(object, state);
    await say(object, stranger, { type: "start" });
    assert.equal(stranger.last("error")?.error, "join the room first");

    await say(object, ann, { type: "join", name: "Ann" });
    await say(object, bo, { type: "join", name: "Bo", token: "bo-token" });
    assert.deepEqual(ann.last("seated"), { type: "seated", seat: "E", token: "secret-1" });
    assert.deepEqual(bo.last("seated"), { type: "seated", seat: "S", token: "bo-token" });
    await say(object, ann, { type: "join", name: "Ann again" });
    assert.equal(ann.last("error")?.error, "you are already seated");

    await say(object, bo, { type: "start" });
    assert.equal(latest(ann).state!.seat, "E");
    assert.equal(latest(bo).state!.seat, "S");
    assert.equal(stranger.last("room"), undefined, "an unseated socket is told nothing");
    assert.notDeepEqual(latest(ann).state!.view.player.hand, latest(bo).state!.view.player.hand);
    await say(object, ann, { type: "ping" });
    assert.deepEqual(ann.sent.at(-1), { type: "pong" });
    await object.webSocketMessage(ann, "not json");
    assert.equal(ann.last("error")?.error, "unreadable message");
  });

  it("plays a hand: people by message, bots and the next deal by alarm", async () => {
    const { state, clock, object } = await openRoom();
    const sockets = { E: await connect(object, state), S: await connect(object, state) } as Record<Seat, FakeSocket>;
    await say(object, sockets.E, { type: "join", name: "Ann" });
    await say(object, sockets.S, { type: "join", name: "Bo" });
    await say(object, sockets.E, { type: "configure", settings: { turnSeconds: null } });
    await say(object, sockets.E, { type: "start" });

    let botMoves = 0;
    for (let i = 0; i < 2000; i++) {
      const payload = latest(sockets.E);
      const waiting = payload.room.waitingOn;
      if (waiting === null) break;
      if (waiting.human) {
        assert.equal(state.alarm, null, "no clock when the room waits for ever");
        const own = latest(sockets[waiting.seat]);
        const action = chooseAction(own.state!.view, waiting.seat)!;
        await say(object, sockets[waiting.seat], { type: "act", action });
        assert.equal(sockets[waiting.seat].last("error"), undefined);
      } else {
        assert.ok(state.alarm !== null, "a bot's move is on the alarm");
        clock.clock = state.alarm;
        await object.alarm();
        botMoves++;
      }
    }
    assert.ok(latest(sockets.E).state!.outcome !== null, "the hand ended");
    assert.ok(botMoves > 10);

    await say(object, sockets.E, { type: "next" });
    assert.equal(latest(sockets.E).room.waitingOn, null, "one person asking is not enough");
    await say(object, sockets.S, { type: "next" });
    assert.notEqual(latest(sockets.E).room.waitingOn, null, "the next hand is dealt");
  });

  it("moves a person whose time ran out, once, and ignores a stale alarm", async () => {
    const { state, clock, object } = await openRoom();
    const sockets = [await connect(object, state), await connect(object, state), await connect(object, state), await connect(object, state)];
    for (const [index, socket] of sockets.entries()) await say(object, socket, { type: "join", name: `P${index}` });
    await say(object, sockets[0]!, { type: "start" });
    const waiting = latest(sockets[0]!).room.waitingOn!;
    assert.equal(waiting.human, true);
    assert.equal(state.alarm, clock.clock + 15_000);
    const timer = state.data.get("timer") as { stamp: number };
    const steps = () => (state.data.get("room") as { game: { steps: unknown[] } }).game.steps.length;
    assert.equal(steps(), timer.stamp);

    clock.clock = state.alarm!;
    await object.alarm();
    assert.equal(steps(), timer.stamp + 1, "the room moved for them");

    // A deadline set for a decision already taken changes nothing.
    const before = JSON.stringify(state.data.get("room"));
    state.data.set("timer", { kind: "turn", stamp: timer.stamp, at: 0 });
    await object.alarm();
    assert.equal(JSON.stringify(state.data.get("room")), before);
  });

  it("hands a dropped phone's seat to the bot and keeps the room through hibernation", async () => {
    const { state, clock, object } = await openRoom();
    const ann = await connect(object, state);
    await say(object, ann, { type: "join", name: "Ann", token: "ann" });
    await say(object, ann, { type: "start" });

    ann.closed = true;
    await object.webSocketClose(ann);
    const snapshot = state.data.get("room") as { players: Record<string, unknown> };
    assert.ok(snapshot.players.E !== undefined, "the seat is kept for the phone's return");

    // The object wakes from hibernation with no memory: only storage and sockets.
    const woken = new RoomObject(state, {}, clock);
    const back = await connect(woken, state);
    await say(woken, back, { type: "join", name: "", token: "ann" });
    assert.deepEqual(back.last("seated"), { type: "seated", seat: "E", token: "ann" });
    assert.equal(latest(back).room.seats[0]!.connected, true);
    assert.equal(latest(back).state!.seat, "E");

    const later = new RoomObject(state, {}, clock);
    await say(later, back, { type: "ping" });
    assert.deepEqual(back.sent.at(-1), { type: "pong" });
    await say(later, back, { type: "leave" });
    assert.deepEqual(back.last("left"), { type: "left" });
  });
});

describe("room routes", () => {
  function namespace(taken: Set<string> = new Set()) {
    const seen: Request[] = [];
    const rooms: RoomNamespace = {
      idFromName: (name) => name,
      get: (id) => ({
        async fetch(request: Request) {
          seen.push(request);
          if (request.method === "POST") {
            if (taken.has(id as string)) return new Response("{}", { status: 409 });
            taken.add(id as string);
            return new Response("{}", { status: 201 });
          }
          return new Response(`room ${String(id)}`, { status: 200 });
        },
      }),
    };
    return { rooms, seen };
  }

  it("needs the binding", async () => {
    const answer = await handleRoom(new Request("https://int/api/room/new", { method: "POST" }), {});
    assert.equal(answer.status, 503);
  });

  it("opens a room under a fresh readable code, drawing again when one is taken", async () => {
    const draws = [new Uint8Array([0, 0, 0, 0]), new Uint8Array([1, 2, 3, 4])];
    const { rooms } = namespace(new Set(["AAAA"]));
    const answer = await handleRoom(new Request("https://int/api/room/new", { method: "POST" }), { ROOMS: rooms }, () => draws.shift()!);
    assert.equal(answer.status, 201);
    assert.deepEqual(await answer.json(), { code: "CDEF" });
    assert.ok(isRoomCode(newCode()));
    assert.equal(isRoomCode("AB0O"), false);
  });

  it("rate-limits new rooms by address", async () => {
    const { rooms } = namespace();
    const answer = await handleRoom(new Request("https://int/api/room/new", { method: "POST" }), {
      ROOMS: rooms,
      ROOM_LIMIT: { limit: async () => ({ success: false }) },
    });
    assert.equal(answer.status, 429);
  });

  it("forwards a WebSocket join to the room named by its code, any case", async () => {
    const { rooms, seen } = namespace();
    const join = await handleRoom(new Request("https://int/api/room/cdef", { headers: { upgrade: "websocket" } }), { ROOMS: rooms });
    assert.equal(await join.text(), "room CDEF");
    assert.equal(seen.length, 1);
    assert.equal((await handleRoom(new Request("https://int/api/room/CDEF"), { ROOMS: rooms })).status, 426);
    assert.equal((await handleRoom(new Request("https://int/api/room/nope!"), { ROOMS: rooms })).status, 404);
  });
});
