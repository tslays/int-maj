/**
 * Counter sticks thrown across the table: a small top-down physics model for
 * the result screen. Each stick is thrown from the payer's side of the screen
 * towards the receiver's, flies in an arc, lands, hops once, skids on the
 * felt, knocks into the other sticks and bounces off the screen's edges until
 * it comes to rest. Pure and browser-free (the random source is passed in),
 * so the motion can be tested; `exchange.js` draws it.
 *
 * Sides are seats as the viewer sees them (`board.rel`): 0 you (bottom),
 * 1 right, 2 across (top), 3 left.
 */

/** Stick sizes in screen pixels: the red 4000 is a little longer. */
export const STICK_LENGTH = { 100: 52, 500: 52, 1000: 52, 4000: 62 };
export const STICK_THICKNESS = 10;

const AIR_S = 0.5; // time in the air
const PEAK = 110; // height of the arc, in pixels (drawn as scale and shadow)
const LAND_AT = 0.62; // the share of the way a stick flies before it lands
const DRAG = 3.4; // skid friction (per second)
const SPIN_DRAG = 3; // spin friction (per second)
const HOP = 0.28; // how high the landing hop is, as a share of the landing speed
const GRAVITY = 2600; // pulls a hop back down (px/s²)
const WALL = 0.55; // bounce off the screen's edges
const KNOCK = 0.45; // bounce between sticks
const RADIUS = 9; // each stick collides as three discs along its length, spaced so that sticks keep apart
const REST_SPEED = 6; // below this (px/s), with little spin, a stick lies still
const STEP = 1 / 120;

/** Where a side throws from (just off screen) and where its sticks are aimed when it receives. */
export function sideGeometry(side, width, height) {
  const out = 24;
  switch (side) {
    case 0:
      return { from: { x: width / 2, y: height + out }, along: { x: 1, y: 0 }, target: { x: width / 2, y: height * 0.76 } };
    case 1:
      return { from: { x: width + out, y: height / 2 }, along: { x: 0, y: 1 }, target: { x: width * 0.8, y: height / 2 } };
    case 2:
      return { from: { x: width / 2, y: -out }, along: { x: 1, y: 0 }, target: { x: width / 2, y: height * 0.24 } };
    case 3:
      return { from: { x: -out, y: height / 2 }, along: { x: 0, y: 1 }, target: { x: width * 0.2, y: height / 2 } };
    default:
      throw new Error(`no side ${side}`);
  }
}

/**
 * Set up a throw.
 *
 * @param {object} input
 * @param {number} input.width   the screen
 * @param {number} input.height
 * @param {{ from: number, to: number, value: number, delay: number }[]} input.throws
 *   one per stick: the payer's and receiver's sides, the stick's value, and
 *   when (seconds from now) it leaves the payer's hand
 * @param {() => number} [input.random]
 * @returns {{ sticks: object[], step: (dt: number) => { landed: object[], knocks: number }, resting: () => boolean }}
 */
export function createThrow({ width, height, throws, random = Math.random }) {
  const jitter = (spread) => (random() * 2 - 1) * spread;
  const sticks = throws.map((entry, index) => {
    const from = sideGeometry(entry.from, width, height);
    const to = sideGeometry(entry.to, width, height);
    const spreadAlong = Math.min(width, height) * 0.16;
    const start = {
      x: from.from.x + from.along.x * jitter(spreadAlong),
      y: from.from.y + from.along.y * jitter(spreadAlong),
    };
    const target = {
      x: to.target.x + jitter(Math.min(width * 0.09, 90)),
      y: to.target.y + jitter(Math.min(height * 0.07, 50)),
    };
    const land = { x: start.x + (target.x - start.x) * LAND_AT, y: start.y + (target.y - start.y) * LAND_AT };
    const heading = Math.atan2(target.y - start.y, target.x - start.x);
    return {
      index,
      value: entry.value,
      length: STICK_LENGTH[entry.value] ?? 52,
      delay: entry.delay,
      start,
      land,
      target,
      // The stick flies roughly crosswise and tumbles end over end on the way.
      angle: heading + Math.PI / 2 + jitter(0.6),
      spin: jitter(9),
      x: start.x,
      y: start.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      air: 0,
      state: "waiting", // waiting → flying → down (on the felt) → resting
    };
  });

  let clock = 0;

  const discs = (stick) => {
    const cos = Math.cos(stick.angle);
    const sin = Math.sin(stick.angle);
    const reach = stick.length / 2 - RADIUS * 0.6;
    return [-reach, 0, reach].map((offset) => ({ x: stick.x + cos * offset, y: stick.y + sin * offset, offset }));
  };

  const touchDown = (stick) => {
    // It slides the rest of the way: with drag D, a stick moving at v skids v / D.
    const dx = stick.target.x - stick.land.x;
    const dy = stick.target.y - stick.land.y;
    stick.vx = dx * DRAG;
    stick.vy = dy * DRAG;
    stick.vz = Math.hypot(stick.vx, stick.vy) * HOP;
    stick.spin *= 0.6;
    stick.state = "down";
  };

  function substep(dt, result) {
    clock += dt;
    for (const stick of sticks) {
      if (stick.state === "waiting") {
        if (clock < stick.delay) continue;
        stick.state = "flying";
      }
      if (stick.state === "flying") {
        stick.air = Math.min(1, (clock - stick.delay) / AIR_S);
        const t = stick.air;
        stick.x = stick.start.x + (stick.land.x - stick.start.x) * t;
        stick.y = stick.start.y + (stick.land.y - stick.start.y) * t;
        stick.z = 4 * PEAK * t * (1 - t);
        stick.angle += stick.spin * dt;
        if (t >= 1) {
          stick.z = 0;
          touchDown(stick);
          result.landed.push(stick);
        }
        continue;
      }
      if (stick.state !== "down") continue;
      // The hop after landing.
      if (stick.z > 0 || stick.vz > 0) {
        stick.vz -= GRAVITY * dt;
        stick.z = Math.max(0, stick.z + stick.vz * dt);
        if (stick.z === 0) stick.vz = 0;
      }
      const drag = Math.exp(-DRAG * dt);
      stick.vx *= drag;
      stick.vy *= drag;
      stick.spin *= Math.exp(-SPIN_DRAG * dt);
      stick.x += stick.vx * dt;
      stick.y += stick.vy * dt;
      stick.angle += stick.spin * dt;
      // The screen's edges.
      const margin = stick.length / 2;
      if (stick.x < margin) {
        stick.x = margin;
        stick.vx = Math.abs(stick.vx) * WALL;
        result.knocks++;
      } else if (stick.x > width - margin) {
        stick.x = width - margin;
        stick.vx = -Math.abs(stick.vx) * WALL;
        result.knocks++;
      }
      if (stick.y < margin) {
        stick.y = margin;
        stick.vy = Math.abs(stick.vy) * WALL;
        result.knocks++;
      } else if (stick.y > height - margin) {
        stick.y = height - margin;
        stick.vy = -Math.abs(stick.vy) * WALL;
        result.knocks++;
      }
    }

    // Sticks on the felt knock into each other.
    const down = sticks.filter((stick) => (stick.state === "down" || stick.state === "resting") && stick.z < 6);
    for (let i = 0; i < down.length; i++) {
      for (let j = i + 1; j < down.length; j++) {
        const a = down[i];
        const b = down[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) > (a.length + b.length) / 2 + 2 * RADIUS) continue;
        for (const p of discs(a)) {
          for (const q of discs(b)) {
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= 2 * RADIUS || dist === 0) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = (2 * RADIUS - dist) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (closing < 0) {
              const impulse = (-(1 + KNOCK) * closing) / 2;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
              // A knock off-centre turns the stick.
              a.spin -= (impulse * p.offset) / (a.length * a.length) * 6;
              b.spin += (impulse * q.offset) / (b.length * b.length) * 6;
              if (-closing > 40) result.knocks++;
            }
            for (const stick of [a, b]) {
              if (stick.state === "resting") stick.state = "down";
            }
          }
        }
      }
    }

    for (const stick of sticks) {
      if (stick.state !== "down" || stick.z > 0) continue;
      if (Math.hypot(stick.vx, stick.vy) < REST_SPEED && Math.abs(stick.spin) < 0.25) {
        stick.vx = 0;
        stick.vy = 0;
        stick.spin = 0;
        stick.state = "resting";
      }
    }
  }

  return {
    sticks,
    /** Advance by `dt` seconds; returns the sticks that landed and how many knocks were hard enough to hear. */
    step(dt) {
      const result = { landed: [], knocks: 0 };
      let left = Math.min(dt, 0.1);
      while (left > 1e-9) {
        const slice = Math.min(STEP, left);
        substep(slice, result);
        left -= slice;
      }
      return result;
    },
    /** Every stick has been thrown and lies still. */
    resting() {
      return sticks.every((stick) => stick.state === "resting");
    },
  };
}
