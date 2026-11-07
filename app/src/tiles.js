/**
 * Tile models: a rounded ivory front, a lacquered coloured back, and the face
 * printed on top (the riichi art from `assets/faces/` plus a corner index).
 *
 * One unit is a tile's width. A tile's local frame has its face towards +z and
 * the top of the face towards +y; callers turn it to stand, lie or face down.
 */

import * as THREE from "three";

import { D, H, TABLE, W } from "./layout.js";

export { D, H, TABLE, W };
const FRONT = 0.5;
const RADIUS = 0.12;
const BEVEL = 0.04;

const ivory = new THREE.MeshPhysicalMaterial({
  color: 0xf1efe9,
  roughness: 0.36,
  clearcoat: 0.3,
  clearcoatRoughness: 0.3,
});
const lacquer = new THREE.MeshPhysicalMaterial({
  color: 0x7fc2e4,
  roughness: 0.3,
  clearcoat: 0.8,
  clearcoatRoughness: 0.18,
});

function roundedRect(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/** A rounded slab of the given thickness, centred on the origin, face at +z. */
function slab(depth) {
  const core = depth - 2 * BEVEL;
  const geometry = new THREE.ExtrudeGeometry(roundedRect(W - 2 * BEVEL, H - 2 * BEVEL, RADIUS - BEVEL), {
    depth: core,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -core / 2);
  return geometry;
}

const frontGeometry = slab(FRONT);
frontGeometry.translate(0, 0, D / 2 - FRONT / 2);
const backGeometry = slab(D - FRONT);
backGeometry.translate(0, 0, -D / 2 + (D - FRONT) / 2);
const faceGeometry = new THREE.PlaneGeometry(W * 0.92, H * 0.92);
faceGeometry.translate(0, 0, D / 2 + 0.004);

/* --------------------------------------------------------- faces */

const FACE_W = 300;
const FACE_H = Math.round(FACE_W * (H / W));
const faceMaterials = new Map();
let anisotropy = 1;
let onFacePainted = () => {};

export function initTiles(renderer, painted) {
  anisotropy = renderer.capabilities.getMaxAnisotropy();
  onFacePainted = painted;
}

/** Corner index: the rank for suits, the wind's letter, the bonus number. */
function indexFor(key) {
  if (/^[bco][1-9]$/.test(key)) return { text: key[1], colour: "#1d2a44" };
  if (key.startsWith("w")) return { text: key[1], colour: "#141414" };
  if (key.startsWith("f")) return { text: key[1], colour: "#a8322b" };
  if (key.startsWith("s")) return { text: key[1], colour: "#1f4f8f" };
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(300, 400);
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function paintFace(canvas, key) {
  const context = canvas.getContext("2d");
  const index = indexFor(key);
  // The art fills the face, as on the big apps' tiles; the corner index sits
  // small in the margin the art leaves at its top left.
  const box = index === null ? { x: 6, y: 6, w: 288, h: 384 } : { x: 22, y: 26, w: 270, h: 360 };
  if (key === "dW") {
    context.strokeStyle = "#2a5fa8";
    context.lineWidth = 16;
    context.beginPath();
    context.roundRect(box.x + 36, box.y + 40, box.w - 72, box.h - 80, 18);
    context.stroke();
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(box.x + 58, box.y + 62, box.w - 116, box.h - 124, 10);
    context.stroke();
  } else {
    const image = await loadImage(`assets/faces/${key}.svg`);
    context.drawImage(image, box.x, box.y, box.w, box.h);
    if (key.startsWith("w")) {
      // Winds print in black ink, like a real set; the source art is blue.
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#141414";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
    }
  }
  if (index !== null) {
    context.fillStyle = index.colour;
    context.font = `800 46px -apple-system, "SF Pro Rounded", "Helvetica Neue", Arial, sans-serif`;
    context.textBaseline = "top";
    context.fillText(index.text, 10, 6);
  }
}

function faceMaterial(key) {
  let material = faceMaterials.get(key);
  if (material !== undefined) return material;
  const canvas = document.createElement("canvas");
  canvas.width = FACE_W;
  canvas.height = FACE_H;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  material = new THREE.MeshPhysicalMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.36,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  faceMaterials.set(key, material);
  void paintFace(canvas, key).then(() => {
    texture.needsUpdate = true;
    onFacePainted();
  });
  return material;
}

/** Paint every face up front, so no tile ever appears blank mid-game. */
export function preloadFaces(keys) {
  for (const key of keys) faceMaterial(key);
}

/* --------------------------------------------------------- tiles */

/** A tile; `key` null is a tile seen only from the back. */
export function makeTile(key, { shadows = true } = {}) {
  const tile = new THREE.Group();
  const front = new THREE.Mesh(frontGeometry, ivory);
  const back = new THREE.Mesh(backGeometry, lacquer);
  for (const mesh of [front, back]) {
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
  }
  tile.add(front, back);
  if (key !== null) tile.add(new THREE.Mesh(faceGeometry, faceMaterial(key)));
  tile.userData.key = key;
  return tile;
}

/** Small irregularity so tiles on the felt look placed by a hand. */
export function jitter(seed, amount) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * 2 * amount;
}

/** Pose a tile lying face up, its top towards the table's centre. */
export function poseFaceUp(tile, x, z, seed = 0, scale = 1) {
  tile.scale.setScalar(scale);
  tile.rotation.set(-Math.PI / 2, 0, jitter(seed, 0.03));
  tile.position.set(x + jitter(seed + 1, 0.025), (D / 2) * scale, z + jitter(seed + 2, 0.025));
  return tile;
}

/** Pose a tile lying face down (a wall tile, a concealed kong's end). */
export function poseFaceDown(tile, x, y, z, scale = 1) {
  tile.scale.setScalar(scale);
  tile.rotation.set(Math.PI / 2, 0, 0);
  tile.position.set(x, y, z);
  return tile;
}

/** Hand order: characters, circles, bamboo, winds, dragons, then bonuses. */
export function tileOrder(key) {
  const suit = { c: 0, o: 1, b: 2, w: 3, d: 4, f: 5, s: 6 }[key[0]] ?? 7;
  const rank = "123456789ESWNRGW".indexOf(key[1]);
  return suit * 20 + rank;
}

export const ALL_FACES = [
  ..."123456789".split("").flatMap((rank) => ["c", "o", "b"].map((suit) => `${suit}${rank}`)),
  "wE", "wS", "wW", "wN", "dR", "dG", "dW",
  "f1", "f2", "f3", "f4", "s1", "s2", "s3", "s4",
];
