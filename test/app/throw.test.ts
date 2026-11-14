/**
 * The thrown counter sticks (`app/src/throw.js`): a small top-down physics
 * model. Thrown from the payer's side, each stick lands near the receiver's
 * side, stays on screen, keeps apart from the others so the colours can be
 * counted, and comes to rest within a few seconds.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-expect-error - a plain browser module without type declarations
const { createThrow, sideGeometry } = await import("../../app/src/throw.js");

type Stick = { x: number; y: number; z: number; value: number; state: string; length: number };

/** A small seeded random source, so every run is the same. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function run(width: number, height: number, throws: { from: number; to: number; value: number; delay: number }[], seed = 1) {
  const physics = createThrow({ width, height, throws, random: seeded(seed) });
  let time = 0;
  let landed = 0;
  while (!physics.resting() && time < 10) {
    landed += physics.step(1 / 60).landed.length;
    time += 1 / 60;
  }
  return { physics, time, landed, sticks: physics.sticks as Stick[] };
}

const stagger = (from: number, to: number, values: number[], start = 0) =>
  values.map((value, order) => ({ from, to, value, delay: start + order * 0.07 }));

describe("the thrown counter sticks", () => {
  it("land on the receiver's side, on screen, and come to rest", () => {
    const screens: [number, number][] = [
      [844, 390],
      [1280, 720],
    ];
    for (const [width, height] of screens) {
      for (const to of [0, 1, 2, 3]) {
        const throws = [0, 1, 2, 3]
          .filter((from) => from !== to)
          .flatMap((from) => stagger(from, to, [1000, 500, 100, 100]));
        for (const seed of [1, 2, 3]) {
          const { sticks, time, landed } = run(width, height, throws, seed);
          assert.ok(time < 6, `${width}x${height} to ${to}: rests in ${time.toFixed(2)} s`);
          assert.equal(landed, throws.length, "every stick lands once");
          const target = sideGeometry(to, width, height).target;
          for (const stick of sticks) {
            assert.equal(stick.state, "resting");
            assert.equal(stick.z, 0);
            assert.ok(stick.x >= 0 && stick.x <= width && stick.y >= 0 && stick.y <= height, "on screen");
            // Nearer the receiver's spot than the middle of the screen is.
            const fromTarget = Math.hypot(stick.x - target.x, stick.y - target.y);
            const middle = Math.hypot(width / 2 - target.x, height / 2 - target.y);
            assert.ok(fromTarget < Math.max(middle, Math.min(width, height) * 0.3) + 40, `${width}x${height} to ${to}: lands on that side`);
          }
        }
      }
    }
  });

  it("keeps the sticks apart, so they can be counted", () => {
    const throws = [1, 2, 3].flatMap((from) => stagger(from, 0, [100, 100, 100, 100]));
    const { sticks } = run(844, 390, throws, 7);
    for (let i = 0; i < sticks.length; i++) {
      for (let j = i + 1; j < sticks.length; j++) {
        const gap = Math.hypot(sticks[i]!.x - sticks[j]!.x, sticks[i]!.y - sticks[j]!.y);
        assert.ok(gap > 14, `sticks ${i} and ${j} lie ${gap.toFixed(1)} px apart`);
      }
    }
  });

  it("throws nothing before a stick's time, and nothing when there is nothing to pay", () => {
    const physics = createThrow({ width: 800, height: 400, throws: stagger(0, 2, [100], 1), random: seeded(1) });
    physics.step(0.5);
    assert.equal((physics.sticks as Stick[])[0]!.state, "waiting");
    assert.equal(physics.resting(), false);
    const empty = createThrow({ width: 800, height: 400, throws: [], random: seeded(1) });
    assert.equal(empty.resting(), true);
  });

  it("knows only the four sides", () => {
    assert.throws(() => sideGeometry(4, 800, 400));
  });
});
