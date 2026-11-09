/**
 * The table camera's framing, free of any renderer so tests can use it.
 */

import * as THREE from "three";

import { D, H, HAND_LIFT, LANE_OUT, TABLE } from "./layout.js";

const { TABLE_HALF, WALL_R, HAND_Z } = TABLE;

/** The hand camera's long lens: the strip is far wider than tall, and a wide lens would stretch its ends. */
export const HAND_FOV = 5;
const HAND_TILT = 7;
// What the hand strip must show, in tile units about a tile's centre: the row,
// a little below it, and above it room for a selected tile to rise.
const HAND_BELOW = 0.08;
const HAND_ABOVE = 0.1;
const HAND_MIN_STRIP = 56;

/**
 * Size the hand strip to its tiles and point the hand camera at them.
 *
 * The row is as wide as the screen, so its tiles are as tall as the width
 * allows; the strip is just that tall, plus headroom for a lifted tile, never
 * more than `cap` of the screen. Returns the strip's height and where the
 * resting tiles' tops stand, both in CSS pixels up from the bottom: the table
 * camera frames the table down to that line, so no screen is spent on a margin.
 */
export function fitHandCamera(handCamera, width, height, rowWidth) {
  const portrait = height > width;
  const cap = Math.round(height * (portrait ? 0.16 : 0.27));
  const bottom = -H / 2 - HAND_BELOW;
  const span = H + HAND_BELOW + HAND_LIFT + HAND_ABOVE;
  const pixelsPerUnit = width / rowWidth;
  const strip = Math.min(cap, Math.max(HAND_MIN_STRIP, Math.ceil(span * pixelsPerUnit)));

  handCamera.fov = HAND_FOV;
  handCamera.aspect = width / strip;
  const half = Math.tan(THREE.MathUtils.degToRad(HAND_FOV) / 2);
  const byWidth = rowWidth / 2 / half / handCamera.aspect;
  const byHeight = span / 2 / half;
  const distance = Math.max(byWidth, byHeight);
  // The row stands on the strip's bottom edge; any spare height is headroom.
  const centre = bottom + distance * half;
  // Seen from a little above, so the tiles show their top edge.
  handCamera.position.set(0, centre + distance * Math.tan(THREE.MathUtils.degToRad(HAND_TILT)), distance);
  handCamera.lookAt(0, centre, 0);
  handCamera.updateProjectionMatrix();
  handCamera.updateMatrixWorld();
  const top = new THREE.Vector3(0, H / 2, 0).project(handCamera);
  return { strip, tileTop: Math.min(strip, Math.round(((top.y + 1) / 2) * strip)) };
}

/**
 * Place the table camera so the far opponent's hand touches the top of the
 * screen and your own wall and lane sit just above the standing hand tiles, at a fixed tilt.
 * Solved numerically, so it holds on any aspect ratio.
 */
export function fitTableCamera(tableCamera, tiltDegrees, handTopFraction) {
  const tilt = THREE.MathUtils.degToRad(tiltDegrees);
  // The far hand, and the far table corners where the side seats' melds start.
  const far = [new THREE.Vector3(0, H, -(HAND_Z + 0.4)), ...[-1, 1].map((side) => new THREE.Vector3(side * (TABLE_HALF - 0.1), H, -(TABLE_HALF - 0.1)))];
  // Your wall's front, and the lane in front of it: its tiles' near edge (the
  // lane's tiles are drawn at up to 0.9 scale) is the lowest the table reaches.
  const nearZ = WALL_R + LANE_OUT + (H * 0.9) / 2 + 0.06;
  const near = [new THREE.Vector3(0, 2 * D, nearZ), new THREE.Vector3(0, 0, nearZ)];
  // The side opponents' hands may touch the edges, never leave them.
  // Melds and bonus tiles start in the table corners, so those stay in view too.
  const lane = TABLE_HALF + 0.1;
  const sides = [
    new THREE.Vector3(-(HAND_Z + 0.5), H, 0),
    new THREE.Vector3(HAND_Z + 0.5, H, 0),
    ...[-lane, lane].flatMap((x) => [new THREE.Vector3(x, 0, WALL_R + LANE_OUT - H / 2), new THREE.Vector3(x, 0, WALL_R + LANE_OUT + H / 2 + 0.2)]),
  ];
  const farTarget = 0.985;
  // Right down to the top of the standing hand: the felt between the lane and
  // the hand is dead space, and on a phone every pixel counts.
  const nearTarget = -1 + 2 * handTopFraction + 0.02;

  const place = (distance, target) => {
    tableCamera.position.set(0, Math.sin(tilt) * distance, target + Math.cos(tilt) * distance);
    tableCamera.lookAt(0, 0, target);
    tableCamera.updateMatrixWorld();
    tableCamera.updateProjectionMatrix();
  };
  const ndc = (point) => point.clone().project(tableCamera);
  const solveTarget = (distance) => {
    let low = -TABLE_HALF;
    let high = TABLE_HALF;
    for (let step = 0; step < 40; step++) {
      const mid = (low + high) / 2;
      place(distance, mid);
      if (far.some((point) => ndc(point).y > farTarget)) high = mid;
      else low = mid;
    }
    return (low + high) / 2;
  };
  let low = 5;
  let high = 600;
  for (let step = 0; step < 40; step++) {
    const mid = (low + high) / 2;
    place(mid, solveTarget(mid));
    const tooLow = near.some((point) => ndc(point).y < nearTarget);
    const tooWide = sides.some((point) => Math.abs(ndc(point).x) > 1);
    if (tooLow || tooWide) low = mid;
    else high = mid;
  }
  place(high, solveTarget(high));
}
