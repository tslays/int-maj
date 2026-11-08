/**
 * The table camera's framing, free of any renderer so tests can use it.
 */

import * as THREE from "three";

import { D, H, LANE_OUT, TABLE } from "./layout.js";

const { TABLE_HALF, WALL_R, HAND_Z } = TABLE;

/**
 * Place the table camera so the far opponent's hand touches the top of the
 * screen and your own wall sits just above the hand strip, at a fixed tilt.
 * Solved numerically, so it holds on any aspect ratio.
 */
export function fitTableCamera(tableCamera, tiltDegrees, stripFraction) {
  const tilt = THREE.MathUtils.degToRad(tiltDegrees);
  // The far hand, and the far table corners where the side seats' melds start.
  const far = [new THREE.Vector3(0, H, -(HAND_Z + 0.4)), ...[-1, 1].map((side) => new THREE.Vector3(side * (TABLE_HALF - 0.1), H, -(TABLE_HALF - 0.1)))];
  // Your wall's front, and the lane in front of it (never behind the strip).
  const near = [new THREE.Vector3(0, 2 * D, WALL_R + LANE_OUT + H / 2 + 0.2), new THREE.Vector3(0, 0, WALL_R + LANE_OUT + H / 2 + 0.2)];
  // The side opponents' hands may touch the edges, never leave them.
  // Melds and bonus tiles start in the table corners, so those stay in view too.
  const lane = TABLE_HALF + 0.1;
  const sides = [
    new THREE.Vector3(-(HAND_Z + 0.5), H, 0),
    new THREE.Vector3(HAND_Z + 0.5, H, 0),
    ...[-lane, lane].flatMap((x) => [new THREE.Vector3(x, 0, WALL_R + LANE_OUT - H / 2), new THREE.Vector3(x, 0, WALL_R + LANE_OUT + H / 2 + 0.2)]),
  ];
  const farTarget = 0.985;
  const nearTarget = -1 + 2 * stripFraction + 0.04;

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
