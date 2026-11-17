/**
 * The Wall counter (#204): the number on the table must count every tile
 * still to be drawn, the loose pair included. A hand is drawn only once "all
 * tiles have been drawn from the wall" (I p. 21, item 26), so with the live
 * wall empty and two loose tiles left the counter reads 2, never 0.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewFor } from "../../src/core/game/view.ts";
import { buildScenario } from "../../src/table/scenarios.ts";
import { statePayload } from "../../src/table/session.ts";

describe("the Wall counter (#204)", () => {
  it("keeps counting the loose pair after the live wall is used up", () => {
    const session = buildScenario("turn");
    const state = structuredClone(session.state);
    const loose = state.wall.loose.length;
    assert.ok(loose > 0, "the break leaves loose tiles at the end of the wall");

    const emptied = { ...state, wall: { ...state.wall, front: state.wall.back + 1 } };
    const payload = statePayload({ ...session, state: emptied, id: "wall-counter" });

    assert.equal(payload.wall.remaining, 0, "the live wall is empty");
    assert.equal(payload.wall.draws, loose, "the counter still shows the loose tiles");
    assert.equal(viewFor(emptied, session.seat).drawsLeft, loose);
  });

  it("shows the live wall plus the loose pair at the deal", () => {
    const session = buildScenario("turn");
    const payload = statePayload({ ...session, id: "wall-counter-deal" });
    assert.equal(payload.wall.draws, payload.wall.remaining + payload.wall.loose);
  });
});
