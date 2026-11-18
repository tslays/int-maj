/**
 * Online rooms (docs/MULTIPLAYER.md, M1): several people at one table.
 *   - seats: join, rejoin by token, full room, leaving to a bot
 *   - the room waits on exactly the engine's actor, and only that person may act
 *   - bots play empty and dropped seats, never a connected person's
 *   - a timed-out decision makes the move that changes least, once
 *   - the next hand waits until every connected person asks
 *   - no payload ever carries another seat's concealed tiles
 *   - a snapshot restores the room exactly
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseAction } from "../../src/core/game/bot.ts";
import { SEATS, type Seat } from "../../src/core/game/state.ts";
import { isRoomError, Room, type RoomPayload, type RoomResult } from "../../src/table/room.ts";

function ok<T>(result: RoomResult<T> | null): T {
  assert.ok(result !== null, "expected a change");
  if (isRoomError(result)) assert.fail(result.error);
  return result;
}

function seated(names: readonly string[], seed = "room-test"): Room {
  const room = new Room("TEST");
  names.forEach((name, index) => ok(room.join(name, `token-${index}`)));
  ok(room.start(seed));
  return room;
}

/** Each person plays what the bot policy would, from their own payload. */
function personMove(room: Room, seat: Seat) {
  const view = room.payloadFor(seat).state!.view;
  const action = chooseAction(view, seat);
  assert.ok(action !== null, `${seat} has nothing to do`);
  return action;
}

/** Play until the hand is over; `check` sees every change. */
function playHand(room: Room, check: (events: number) => void = () => {}, limit = 2000): void {
  for (let i = 0; i < limit; i++) {
    const waiting = room.waitingOn();
    if (waiting === null) return;
    const update = waiting.human ? ok(room.act(waiting.seat, personMove(room, waiting.seat))) : ok(room.stepBot());
    check(update.events.length);
  }
  assert.fail("the hand did not end");
}

const TILE_KEY = /^[a-z]+\d*$/;
const ALLOWED = [
  /^state\.view\.player\./,
  /^state\.view\.opponents\[\d+\]\.(melds|discards|flowers|seasons)(\.|\[|$)/,
  /^state\.view\.(lastDiscard|lastDraw|claimWindow)\.tile$/,
  /^state\.view\.fishing\[\d+\]\.wait(\[\d+\])?$/,
  /^state\.(view\.)?legalActions\[\d+\]\.(tile|tiles\[\d+\]|wait\[\d+\])$/,
  /^state\.checker\./,
  /^state\.table\[\d+\]\.(melds|discards|flowers|seasons)(\.|\[|$)/,
  /^state\.pond\[\d+\]\.tile$/,
  /^state\.outcome\./,
];

function tilePaths(value: unknown, path = "", found: { path: string; key: string }[] = []) {
  if (typeof value === "string") {
    if (TILE_KEY.test(value)) found.push({ path, key: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => tilePaths(item, `${path}[${index}]`, found));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) tilePaths(child, path === "" ? key : `${path}.${key}`, found);
  }
  return found;
}

function assertNoLeak(room: Room, seat: Seat, payload: RoomPayload): void {
  const state = room.inspect()!.state;
  if (state.phase === "finished") return; // the outcome shows the winning hand to all
  const hidden = new Set(state.players.filter((player) => player.seat !== seat).flatMap((player) => player.hand));
  const own = new Set(state.players.find((player) => player.seat === seat)!.hand);
  for (const hit of tilePaths(payload)) {
    if (!hidden.has(hit.key) || own.has(hit.key)) continue;
    assert.ok(
      ALLOWED.some((pattern) => pattern.test(hit.path)),
      `${seat} could see ${hit.key} at ${hit.path}`,
    );
  }
  for (const opponent of payload.state?.view.opponents ?? []) assert.equal("hand" in opponent, false);
}

describe("room seats", () => {
  it("seats people in order, gives a seat back to its token, and fills up", () => {
    const room = new Room("ABCD");
    assert.deepEqual(ok(room.join("  Ann  ", "a")), { seat: "E", rejoined: false });
    assert.deepEqual(ok(room.join("Bo", "b")), { seat: "S", rejoined: false });
    room.disconnect("E");
    assert.deepEqual(room.humans(), ["S"]);
    assert.deepEqual(ok(room.join("whatever", "a")), { seat: "E", rejoined: true });
    ok(room.join("", "c"));
    ok(room.join("Dee with a very long name indeed", "d"));
    assert.deepEqual(room.join("Eve", "e"), { error: "the room is full" });
    const seats = room.lobby().seats;
    assert.deepEqual(
      seats.map((seat) => seat.name),
      ["Ann", "Bo", "Player W", "Dee with a very "],
    );
    room.leave("W");
    assert.deepEqual(ok(room.join("Eve", "e")), { seat: "W", rejoined: false });
  });

  it("needs someone seated to deal, and deals once", () => {
    const room = new Room("ABCD");
    assert.deepEqual(room.start("x"), { error: "nobody is seated" });
    ok(room.join("Ann", "a"));
    ok(room.start("x"));
    assert.deepEqual(room.start("x"), { error: "the game has started" });
    assert.deepEqual(room.configure({ houseRules: { handSet: "all", goulashNoHalfLimit: true, winNeedsFish: false } }), {
      error: "house rules are set before the deal",
    });
    assert.ok(isRoomError(room.configure({ turnSeconds: 2 })));
    assert.equal(ok(room.configure({ turnSeconds: null })).turnSeconds, null);
  });
});

describe("room play", () => {
  it("four people play a hand to the end, each seeing only their own tiles", () => {
    const room = seated(["A", "B", "C", "D"]);
    let changes = 0;
    playHand(room, () => {
      changes++;
      if (changes % 7 !== 0) return; // a sample keeps the test quick
      for (const seat of SEATS) assertNoLeak(room, seat, room.payloadFor(seat));
    });
    assert.equal(room.inspect()!.state.phase, "finished");
    assert.ok(changes > 20);
    for (const seat of SEATS) assert.equal(room.payloadFor(seat).state!.seat, seat);
  });

  it("waits on the engine's actor and lets only that person act", () => {
    const room = seated(["A", "B", "C", "D"]);
    const waiting = room.waitingOn()!;
    assert.equal(waiting.human, true);
    assert.equal(room.stepBot(), null, "a bot never plays a connected person's seat");
    const other = SEATS.find((seat) => seat !== waiting.seat)!;
    const action = personMove(room, waiting.seat);
    assert.ok(isRoomError(room.act(other, action)), "acting for another seat is refused");
    assert.ok(isRoomError(room.act(other, { ...action, seat: other })), "acting out of turn is refused");
    const before = room.stamp();
    ok(room.act(waiting.seat, action));
    assert.equal(room.stamp(), before + 1);
  });

  it("lets bots play the empty seats and a dropped person's seat", () => {
    const room = seated(["Solo"]);
    let botMoves = 0;
    for (let i = 0; i < 400 && room.waitingOn() !== null; i++) {
      const waiting = room.waitingOn()!;
      assert.equal(waiting.human, waiting.seat === "E");
      if (waiting.human) {
        room.disconnect("E");
        assert.equal(room.waitingOn()!.human, false);
        ok(room.stepBot());
        ok(room.join("Solo", "token-0"));
      } else {
        ok(room.stepBot());
        botMoves++;
      }
    }
    assert.ok(botMoves > 10);
  });

  it("makes the least move for a person whose time ran out, once", () => {
    const room = seated(["A", "B", "C", "D"]);
    for (let i = 0; i < 200; i++) {
      const stamp = room.stamp();
      const waiting = room.waitingOn();
      if (waiting === null) break;
      const session = room.inspect()!;
      const legal = room.payloadFor(waiting.seat).state!.legalActions;
      ok(room.timeout(stamp));
      const taken = room.inspect()!.steps.at(-1)!;
      assert.equal(room.timeout(stamp), null, "a stale deadline changes nothing");
      if (legal.some((action) => action.type === "Pass")) assert.equal(taken.type, "Pass");
      else if (legal.some((action) => action.type === "Draw")) assert.equal(taken.type, "Draw");
      else if (session.state.lastDraw?.seat === waiting.seat && taken.type === "Discard") {
        assert.equal(taken.tile, session.state.lastDraw.tile);
      }
    }
  });

  it("deals the next hand once every connected person asks", () => {
    const room = seated(["A", "B"]);
    playHand(room);
    assert.ok(isRoomError(room.nextHand("W")), "a bot seat cannot ask");
    assert.equal(ok(room.nextHand("E")).dealt, false);
    assert.deepEqual(
      room.lobby().seats.map((seat) => seat.ready),
      [true, false, false, false],
    );
    const dealt = ok(room.nextHand("S"));
    assert.equal(dealt.dealt, true);
    assert.ok(dealt.events.length > 0);
    assert.notEqual(room.inspect()!.state.phase, "finished");
    assert.ok(isRoomError(room.nextHand("E")), "only after a finished hand");
  });

  it("restores from its snapshot to the same table", () => {
    const room = seated(["A", "B", "C"]);
    for (let i = 0; i < 25; i++) {
      const waiting = room.waitingOn()!;
      if (waiting.human) ok(room.act(waiting.seat, personMove(room, waiting.seat)));
      else ok(room.stepBot());
    }
    const snapshot = JSON.parse(JSON.stringify(room.snapshot()));
    const copy = ok(Room.restore(snapshot));
    assert.deepEqual(copy.humans(), [], "everyone rejoins after a restore");
    for (const [index, seat] of (["E", "S", "W"] as const).entries()) {
      assert.deepEqual(ok(copy.join("", `token-${index}`)), { seat, rejoined: true });
    }
    for (const seat of SEATS) assert.deepEqual(copy.payloadFor(seat).state, room.payloadFor(seat).state);
    assert.equal(copy.stamp(), room.stamp());
    assert.ok(isRoomError(Room.restore({ ...snapshot, version: 2 })));
  });

  it("words events per seat: nobody reads another seat's drawn tile", () => {
    const room = seated(["A", "B", "C", "D"]);
    for (let i = 0; i < 60; i++) {
      const waiting = room.waitingOn();
      if (waiting === null) break;
      const update = ok(room.act(waiting.seat, personMove(room, waiting.seat)));
      for (const event of update.events) {
        if (event.type !== "Drew") continue;
        const own = room.payloadFor(event.seat, [event]).events.join(" ");
        for (const seat of SEATS.filter((other) => other !== event.seat)) {
          const words = room.payloadFor(seat, [event]).events.join(" ");
          assert.match(words, /draws a tile/);
          assert.notEqual(words, own, `${seat} read ${event.seat}'s draw: ${words}`);
        }
      }
    }
  });
});
