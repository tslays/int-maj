/**
 * Which hands All hands leaves out during a Goulash with the half-limit rule
 * on: a hand only when every one of its scorings is half limit.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { barredInGoulash, halfLimitBarred } = await import("../../app/src/goulash-bar.js");

const BAR = ["tier:half"];
const reading = (concealedTier: string, exposedTier: string | null) => ({ concealedTier, exposedTier });

describe("the Goulash bar in All hands", () => {
  it("is on only while the view carries the half-limit token", () => {
    assert.equal(halfLimitBarred(BAR), true);
    assert.equal(halfLimitBarred([]), false);
    assert.equal(halfLimitBarred(["tier:limit", "some-hand"]), false);
    assert.equal(halfLimitBarred(undefined), false);
  });

  it("leaves out a half-limit hand during a Goulash", () => {
    const knitting = { readings: [reading("half", "half")] };
    assert.equal(barredInGoulash(knitting, BAR), true);
    // Concealed-only half limit has no exposed scoring to fall back on.
    assert.equal(barredInGoulash({ readings: [reading("half", null)] }, BAR), true);
  });

  it("keeps a hand that has any scoring above half limit", () => {
    const mixed = { readings: [reading("half", "half"), reading("limit", null)] };
    assert.equal(barredInGoulash(mixed, BAR), false);
    const exposedOnlyHalf = { readings: [reading("limit", "half")] };
    assert.equal(barredInGoulash(exposedOnlyHalf, BAR), false);
  });

  it("changes nothing in a normal round", () => {
    assert.equal(barredInGoulash({ readings: [reading("half", "half")] }, []), false);
    assert.equal(barredInGoulash({ readings: [reading("limit", null)] }, []), false);
  });

  it("falls back to the hand's own tier when it has no readings list", () => {
    assert.equal(barredInGoulash({ concealedTier: "half", readings: [] }, BAR), true);
    assert.equal(barredInGoulash({ concealedTier: "limit", readings: [] }, BAR), false);
  });
});
