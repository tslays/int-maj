/** The phone and the room speak the same version of the room protocol. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

import { PROTOCOL } from "../../src/worker/room-object.ts";

it("the app sends the room's protocol version", () => {
  const source = readFileSync(new URL("../../app/src/online.js", import.meta.url), "utf8");
  const match = /export const PROTOCOL = (\d+);/.exec(source);
  assert.ok(match !== null, "online.js declares PROTOCOL");
  assert.equal(Number(match[1]), PROTOCOL);
});
