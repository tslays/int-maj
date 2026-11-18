/** The score breakdown rows on the result card (#212). Pure module, no browser. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
import { PAYMENT_NOTES, breakdownRows } from "../../app/src/breakdown.js";

const items = [
  { kind: "ground", id: "mah-jong", what: "Going Mah Jong", amount: 20, cite: "(h)" },
  { kind: "double", id: "no-chows", what: "No chows", amount: 1, cite: "(g)" },
  { kind: "double", id: "pure", what: "All one suit", amount: 3, cite: "(j)" },
];

describe("breakdownRows (#212)", () => {
  it("splits ground items from doubles and words each value", () => {
    const rows = breakdownRows(items);
    assert.deepEqual(rows.ground, [{ what: "Going Mah Jong", value: "+20", cite: "(h)" }]);
    assert.deepEqual(rows.doubles.map((row: { value: string }) => row.value), ["1 double", "3 doubles"]);
  });
  it("drops the citation when asked", () => {
    assert.equal(breakdownRows(items, { cite: false }).ground[0].cite, "");
  });
  it("has nothing for a printed-tier hand or a missing list", () => {
    assert.equal(breakdownRows(null), null);
    assert.equal(breakdownRows([]), null);
  });
  it("explains the rounding and the loser settlement", () => {
    assert.match(PAYMENT_NOTES[0], /nearest 100.*over 50 rounds up, 50 or less rounds down/);
    assert.match(PAYMENT_NOTES[1], /losers also settle among themselves/);
  });
});
