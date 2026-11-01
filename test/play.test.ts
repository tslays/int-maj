/**
 * The console layer is pure, so its parsers, renderer and undo are tested
 * without a terminal. The one contract that matters: a rejected command
 * changes nothing, and undo returns to the exact state before the previous
 * human decision.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  commandPrompt,
  parseCommand,
  parsePlayArgs,
  renderTable,
  recordAction,
  startSession,
  undoLastDecision,
} from "../src/core/game/console.ts";
import {
  legalActions,
  serialize,
  viewFor,

} from "../src/core/game/index.ts";
import { fixture, play } from "./game-fixture.ts";

describe("play arguments", () => {
  it("accepts the documented flags", () => {
    assert.deepEqual(parsePlayArgs([]), {
      seed: "console",
      seat: "E",
      bot: false,
      events: false,
      help: false,
    });
    assert.deepEqual(parsePlayArgs(["--seed", "table-7", "--seat", "N", "--bot", "--events"]), {
      seed: "table-7",
      seat: "N",
      bot: true,
      events: true,
      help: false,
    });
    assert.equal(parsePlayArgs(["--help"]).help, true);
  });

  it("rejects missing and unknown values", () => {
    assert.throws(() => parsePlayArgs(["--seed"]), /needs a value/);
    assert.throws(() => parsePlayArgs(["--seat"]), /needs E, S, W or N/);
    assert.throws(() => parsePlayArgs(["--seat", "Q"]), /unknown seat/);
    assert.throws(() => parsePlayArgs(["--nope"]), /unknown option/);
    assert.throws(() => parsePlayArgs(["stray"]), /unexpected argument/);
  });
});

const discardState = () => fixture({ phase: "discard", turn: "E" });

function pungKongState() {
  return fixture({
    hands: {
      E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE o5",
      S: "o5 o5 o5 b2 b3 b4 c2 c3 c4 c5 c6 c7 dR",
      W: "b7 b8 b9 c7 c8 c9 o2 o3 o4 wE wS wW wN",
      N: "b7 b8 b9 c7 c8 c9 o1 o6 o7 wE wS wW wN",
    },
    wall: ["o1", "o2", "o3", "o4"],
    phase: "discard",
    turn: "E",
  });
}

function chowState() {
  return fixture({
    hands: {
      E: "b1 b1 b1 c1 c2 c3 c7 c8 c9 wE wS wW o5 o9",
      S: "o3 o4 o6 o7 b1 b3 b5 c2 c4 c6 dR dG dW",
      W: "o5 o5 o3 o4 o6 o7 b2 b4 b6 c1 c3 c5 dR",
      N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
    },
    wall: ["o1", "o2", "o3", "o4", "o5", "o6"],
    phase: "discard",
    turn: "E",
  });
}

function mahjongState() {
  return fixture({
    hands: {
      E: "b1 b1 b1 c1 c2 c3 o1 o1 o1 o2 o3 o4 wE b5",
      S: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5",
      W: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
    },
    wall: ["o1", "o2", "o3", "o4"],
    phase: "discard",
    turn: "E",
  });
}

function fishingState() {
  return fixture({
    hands: {
      E: "b1 b1 b1 b2 b2 b2 b3 b3 b3 b4 b4 b4 b5",
      S: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
      W: "b1 b2 b3 b4 b5 b6 c1 c2 c3 c4 c5 c6 c7",
      N: "b7 b8 b9 c7 c8 c9 o1 o2 o3 wE wS wW wN",
    },
    wall: ["o1", "o2", "o3"],
    phase: "announce",
    turn: "E",
  });
}

describe("console commands", () => {
  it("maps d <n> to the numbered discard and rejects bad indices", () => {
    const view = viewFor(discardState(), "E");
    const command = parseCommand("d 1", view);
    assert.equal(command.kind, "action");
    assert.deepEqual(
      command.kind === "action" ? command.action : null,
      { type: "Discard", seat: "E", tile: view.player.hand[0] },
    );

    for (const line of ["d", "d 0", "d 99", "d one", "p", "space", "nonsense"]) {
      const rejected = parseCommand(line, view);
      assert.equal(rejected.kind, "invalid", line);
    }
  });

  it("accepts p, k and space in a claim window", () => {
    const discarded = play(pungKongState(), { type: "Discard", seat: "E", tile: "o5" });
    const view = viewFor(discarded.state, "S");

    const pung = parseCommand("p", view);
    assert.equal(pung.kind, "action");
    assert.equal(pung.kind === "action" && pung.action.type, "Claim");
    assert.equal(pung.kind === "action" && pung.action.type === "Claim" && pung.action.kind, "pung");

    const kong = parseCommand("k", view);
    assert.equal(kong.kind, "action");
    assert.equal(kong.kind === "action" && kong.action.type === "Claim" && kong.action.kind, "kong");

    const pass = parseCommand("space", view);
    assert.deepEqual(pass, { kind: "action", action: { type: "Pass", seat: "S" } });
    assert.equal(parseCommand("c", view).kind, "invalid");
    assert.equal(parseCommand("m", view).kind, "invalid");
  });

  it("accepts c with a chow variant index", () => {
    const discarded = play(chowState(), { type: "Discard", seat: "E", tile: "o5" });
    const view = viewFor(discarded.state, "S");
    const first = parseCommand("c", view);
    const second = parseCommand("c 2", view);
    assert.equal(first.kind, "action");
    assert.equal(second.kind, "action");
    assert.notDeepEqual(
      first.kind === "action" ? first.action : null,
      second.kind === "action" ? second.action : null,
    );
    assert.equal(parseCommand("c 4", view).kind, "invalid");
  });

  it("maps m to a win or a mahjong claim", () => {
    const discarded = play(mahjongState(), { type: "Discard", seat: "E", tile: "b5" });
    const view = viewFor(discarded.state, "S");
    const command = parseCommand("m", view);
    assert.equal(command.kind, "action");
    assert.equal(command.kind === "action" ? command.action.type : null, "Win");
  });

  it("shows the fixed wait on f and accepts space in the announce phase", () => {
    const view = viewFor(fishingState(), "E");
    const fishing = parseCommand("f", view);
    assert.equal(fishing.kind, "action");
    if (fishing.kind === "action") {
      assert.equal(fishing.action.type, "DeclareFishing");
      assert.ok(
        fishing.action.type === "DeclareFishing" && fishing.action.wait.includes("b5"),
      );
    }
    assert.deepEqual(parseCommand("space", view), {
      kind: "action",
      action: { type: "Pass", seat: "E" },
    });
    assert.equal(parseCommand("d 1", view).kind, "invalid");
  });

  it("handles u, h and q without an action", () => {
    const view = viewFor(discardState(), "E");
    assert.equal(parseCommand("u", view).kind, "undo");
    assert.equal(parseCommand("undo", view).kind, "undo");
    assert.equal(parseCommand("h", view).kind, "help");
    assert.equal(parseCommand("q", view).kind, "quit");
  });
});

describe("console rendering", () => {
  it("numbers the hand and prints the public table", () => {
    const view = viewFor(discardState(), "E");
    const text = renderTable(view);
    assert.match(text, /Hand 1/);
    assert.match(text, /wall \d+/);
    assert.match(text, /Scores: E 0/);
    assert.match(text, /E \(dealer\) \(you\)  hand: 1:/);
    assert.match(text, /S  hand: 13 concealed/);
    assert.match(text, /melds: none · discards: none/);
    assert.match(commandPrompt(view), /d <n> discard/);
  });

  it("prints the claim prompt with pung, kong and pass", () => {
    const discarded = play(pungKongState(), { type: "Discard", seat: "E", tile: "o5" });
    const prompt = commandPrompt(viewFor(discarded.state, "S"));
    assert.match(prompt, /p pung/);
    assert.match(prompt, /k kong/);
    assert.match(prompt, /space pass/);
  });

  it("prints the fishing prompt with the wait", () => {
    const prompt = commandPrompt(viewFor(fishingState(), "E"));
    assert.match(prompt, /f fishing .*b5/);
    assert.match(prompt, /space pass/);
  });
});

describe("undo", () => {
  it("replays to the exact state before the previous human decision", () => {
    let session = startSession("undo-test");
    const draw = viewFor(session.state, "E").legalActions.find(
      (action) => action.type === "Draw",
    )!;
    session = recordAction(session, draw, false);

    const before = session.state;
    const discard = viewFor(before, "E").legalActions.find(
      (action) => action.type === "Discard",
    )!;
    session = recordAction(session, discard, true);
    assert.deepEqual(session.humanActions, [1]);

    let guard = 0;
    while (
      session.state.phase !== "finished" &&
      session.state.turn !== "E" &&
      guard++ < 100
    ) {
      const legal = legalActions(session.state, session.state.turn);
      if (legal.length === 0) break;
      session = recordAction(session, legal[0]!, false);
    }

    const undone = undoLastDecision(session);
    assert.notEqual(undone, null);
    assert.equal(serialize(undone!.state), serialize(before));
    assert.deepEqual(undone!.actions, [draw]);
    assert.deepEqual(undone!.humanActions, []);
    assert.equal(undoLastDecision(undone!), null);
  });

  it("throws for an illegal action without replacing the session", () => {
    const session = startSession("undo-illegal");
    const before = serialize(session.state);
    assert.throws(
      () => recordAction(session, { type: "Discard", seat: "E", tile: "b1" }, true),
      /tile not in hand|cannot discard/,
    );
    assert.equal(serialize(session.state), before);
  });
});
