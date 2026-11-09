/**
 * The stage: renderer, the table scene and its camera, the hand scene and its
 * camera, lights, the felt table, the centre console, and a small animation
 * system whose tweens are promises.
 *
 * Two passes are drawn each frame: the table in perspective over the whole
 * screen, then your hand in its own strip along the bottom so it stays large
 * on a phone.
 */

import * as THREE from "three";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { fitTableCamera } from "./camera.js";
import { D, H, TABLE } from "./tiles.js";

const { TABLE_HALF, WALL_R, HAND_Z, CENTER_HALF } = TABLE;
const RAIL = 1.1;

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Khronos PBR Neutral keeps the inks their own colour; ACES bleached the red
// characters pink once the ivory reached the top of its range.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

export const tableScene = new THREE.Scene();
tableScene.background = new THREE.Color(0x11191c);
tableScene.environment = environment;
tableScene.environmentIntensity = 0.3;

export const handScene = new THREE.Scene();
handScene.environment = environment;
handScene.environmentIntensity = 0.32;

export const tableCamera = new THREE.PerspectiveCamera(17, 1, 0.5, 1200);
// A long lens: the hand strip is about eight times wider than tall, and a wide
// lens would stretch the tiles at its ends.
export const handCamera = new THREE.PerspectiveCamera(5, 1, 1, 600);

const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

/* --------------------------------------------------------- table */

function feltTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72);
  gradient.addColorStop(0, "#1f716d");
  gradient.addColorStop(0.62, "#185a59");
  gradient.addColorStop(1, "#0b3334");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  // Engraved guides: the play square inside the walls, and its diagonals.
  const unit = size / (TABLE_HALF * 2);
  const inner = (WALL_R - H / 2 - 0.35) * unit;
  const centre = size / 2;
  context.strokeStyle = "rgba(4, 26, 26, 0.45)";
  context.lineWidth = 3;
  context.strokeRect(centre - inner, centre - inner, inner * 2, inner * 2);
  context.beginPath();
  const corner = CENTER_HALF * unit;
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    context.moveTo(centre + dx * corner, centre + dy * corner);
    context.lineTo(centre + dx * inner, centre + dy * inner);
  }
  context.stroke();
  const noise = context.getImageData(0, 0, size, size);
  let seed = 7;
  for (let index = 0; index < noise.data.length; index += 4) {
    seed = (seed * 16807) % 2147483647;
    const grain = (seed / 2147483647 - 0.5) * 8;
    noise.data[index] += grain;
    noise.data[index + 1] += grain;
    noise.data[index + 2] += grain;
  }
  context.putImageData(noise, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function buildTable() {
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_HALF * 2, TABLE_HALF * 2),
    new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.96, metalness: 0 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  tableScene.add(felt);

  const rail = new THREE.MeshPhysicalMaterial({ color: 0x2a3236, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 });
  for (let side = 0; side < 4; side++) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(TABLE_HALF * 2 + RAIL * 2, 0.7, RAIL), rail);
    piece.position.set(0, 0.35, TABLE_HALF + RAIL / 2);
    piece.castShadow = true;
    piece.receiveShadow = true;
    const frame = new THREE.Group();
    frame.rotation.y = (side * Math.PI) / 2;
    frame.add(piece);
    tableScene.add(frame);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x11191c, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  tableScene.add(floor);
}

function buildLights() {
  tableScene.add(new THREE.HemisphereLight(0xf4fbff, 0x10292a, 0.28));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.3);
  key.position.set(-7, 22, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -TABLE_HALF - 2,
    right: TABLE_HALF + 2,
    top: TABLE_HALF + 2,
    bottom: -TABLE_HALF - 2,
    near: 5,
    far: 60,
  });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  tableScene.add(key);

  handScene.add(new THREE.HemisphereLight(0xfff3df, 0x18302a, 0.32));
  const handKey = new THREE.DirectionalLight(0xfff1dc, 1.9);
  handKey.position.set(-4, 7, 9);
  handScene.add(handKey);
}

/* --------------------------------------------------------- console */

const consoleCanvas = document.createElement("canvas");
consoleCanvas.width = 512;
consoleCanvas.height = 512;
const consoleTexture = new THREE.CanvasTexture(consoleCanvas);
consoleTexture.colorSpace = THREE.SRGBColorSpace;
consoleTexture.anisotropy = maxAnisotropy;
let consoleKey = "";

function buildConsole() {
  const top = new THREE.MeshPhysicalMaterial({ map: consoleTexture, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.15 });
  const side = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 0.35, metalness: 0.4 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(CENTER_HALF * 2, 0.24, CENTER_HALF * 2), [
    side, side, top, side, side, side,
  ]);
  panel.position.y = 0.12;
  panel.castShadow = true;
  panel.receiveShadow = true;
  tableScene.add(panel);
}

const WIND_WORD = { E: "EAST", S: "SOUTH", W: "WEST", N: "NORTH" };

/**
 * Redraw the console: the round, the wall count, and each seat's wind and
 * score along its own edge, reading the right way up for that seat. The seat
 * whose turn it is glows along its edge.
 *
 * `info.seats` is [{ rel, wind, score, dealer, turn }] with rel 0 = you.
 */
export function updateConsole(info) {
  const key = JSON.stringify(info);
  if (key === consoleKey) return;
  consoleKey = key;
  const size = 512;
  const context = consoleCanvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#1b2326";
  context.beginPath();
  context.roundRect(0, 0, size, size, 46);
  context.fill();
  context.strokeStyle = "rgba(120, 140, 150, 0.5)";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(14, 14, size - 28, size - 28, 36);
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = "#e8e2cf";
  context.font = `600 38px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  context.fillText(`${WIND_WORD[info.round]} ${info.hand}`, size / 2, size / 2 - 30);
  context.fillStyle = "#62f2ea";
  context.font = `700 104px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  context.fillText(String(info.wall), size / 2, size / 2 + 70);

  for (const seat of info.seats) {
    context.save();
    context.translate(size / 2, size / 2);
    context.rotate((-seat.rel * Math.PI) / 2);
    if (seat.turn) {
      const glow = context.createLinearGradient(0, size / 2 - 70, 0, size / 2 - 8);
      glow.addColorStop(0, "rgba(98, 242, 234, 0)");
      glow.addColorStop(1, "rgba(98, 242, 234, 0.55)");
      context.fillStyle = glow;
      context.fillRect(-size / 2 + 60, size / 2 - 70, size - 120, 56);
    }
    context.fillStyle = seat.dealer ? "#ff6b5e" : "#cfd6d8";
    context.font = `700 64px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    context.fillText(seat.wind, -92, size / 2 - 34);
    context.fillStyle = "#f2d36b";
    context.font = `600 52px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    context.fillText(seat.score.toLocaleString("en"), 46, size / 2 - 36);
    context.restore();
  }
  consoleTexture.needsUpdate = true;
  requestRender();
}

/* --------------------------------------------------------- framing */

export const viewport = { width: 1, height: 1, strip: 1 };
let handRowWidth = 15.5;

/** The hand row's width in tile units; the hand camera keeps it in view. */
export function setHandRowWidth(width) {
  const next = Math.max(15.5, width * 1.04 + 0.5);
  if (Math.abs(next - handRowWidth) < 0.01) return;
  handRowWidth = next;
  frameHand();
}

function frameHand() {
  const { width, strip } = viewport;
  handCamera.aspect = width / strip;
  const vertical = THREE.MathUtils.degToRad(handCamera.fov);
  const byWidth = handRowWidth / 2 / Math.tan(vertical / 2) / handCamera.aspect;
  const byHeight = (H * 1.18) / 2 / Math.tan(vertical / 2);
  const distance = Math.max(byWidth, byHeight);
  // Seen from a little above, so the tiles show their top edge.
  handCamera.position.set(0, 0.1 + distance * Math.tan(THREE.MathUtils.degToRad(7)), distance);
  handCamera.lookAt(0, 0.1, 0);
  handCamera.updateProjectionMatrix();
  handCamera.updateMatrixWorld();
  // Where the tops of the hand tiles stand in the strip, so the decision
  // buttons sit right above them rather than above the strip's empty margin.
  const top = new THREE.Vector3(0, 0.1 + H / 2, 0).project(handCamera);
  const tileTop = Math.round(((top.y + 1) / 2) * strip);
  document.documentElement.style.setProperty("--hand-top", `${Math.min(strip, tileTop)}px`);
  requestRender();
}

export function frame() {
  // The canvas fills its container: the window, or the `?phone` frame.
  const host = renderer.domElement.parentElement ?? document.body;
  const width = Math.max(1, host.clientWidth || window.innerWidth);
  const height = Math.max(1, host.clientHeight || window.innerHeight);
  renderer.setSize(width, height, false);
  const portrait = height > width;
  viewport.width = width;
  viewport.height = height;
  viewport.strip = Math.round(portrait ? height * 0.16 : height * 0.27);
  document.documentElement.style.setProperty("--strip", `${viewport.strip}px`);
  tableCamera.aspect = width / height;
  fitTableCamera(tableCamera, portrait ? 62 : 46, viewport.strip / height);
  frameHand();
}

/** Where a table point appears on screen, in CSS pixels from the top left. */
export function screenPoint(point) {
  const projected = point.clone().project(tableCamera);
  return {
    x: ((projected.x + 1) / 2) * viewport.width,
    y: ((1 - projected.y) / 2) * viewport.height,
  };
}

/* --------------------------------------------------------- animation */

const tweens = [];
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/**
 * Queue an animation step function. Frames drive it, but a timer finishes it
 * too: a backgrounded or hidden page gets no frames, and the game must never
 * wait on a picture nobody can see.
 */
function schedule(duration, step) {
  return new Promise((resolve) => {
    const item = { start: performance.now(), duration, step, resolve, done: false };
    tweens.push(item);
    setTimeout(() => finish(item), duration + 120);
    requestRender();
  });
}

function finish(item) {
  if (item.done) return;
  item.done = true;
  const index = tweens.indexOf(item);
  if (index >= 0) tweens.splice(index, 1);
  item.step(1);
  item.resolve();
  requestRender();
}

/** Animate numeric properties of `target`; resolves when done. */
export function tween(target, to, duration, ease = easeOutCubic) {
  const from = {};
  for (const name of Object.keys(to)) from[name] = target[name];
  return schedule(duration, (t) => {
    const k = ease(t);
    for (const name of Object.keys(to)) target[name] = from[name] + (to[name] - from[name]) * k;
  });
}

/** Run `step(t)` for t in 0..1 over `duration`; resolves when done. */
export function animate(duration, step) {
  return schedule(duration, step);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stepTweens(now) {
  for (let index = tweens.length - 1; index >= 0; index--) {
    const item = tweens[index];
    const t = item.duration <= 0 ? 1 : Math.min(1, (now - item.start) / item.duration);
    if (t >= 1) {
      finish(item);
      continue;
    }
    // A step that answers `false` is stale (its owner moved on): stop it now.
    if (item.step(t) === false) finish(item);
  }
}

let renderQueued = false;
export function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function render(now) {
  renderQueued = false;
  stepTweens(now);
  const { width, height, strip } = viewport;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  renderer.render(tableScene, tableCamera);
  renderer.clearDepth();
  renderer.setViewport(0, 0, width, strip);
  renderer.setScissor(0, 0, width, strip);
  renderer.setScissorTest(true);
  renderer.render(handScene, handCamera);
  renderer.setScissorTest(false);
  if (tweens.length > 0) requestRender();
}

export function mountStage(parent) {
  parent.prepend(renderer.domElement);
  buildLights();
  buildTable();
  buildConsole();
  frame();
  window.addEventListener("resize", frame);
}
