/**
 * Tile faces for the web table.
 *
 * The face table is plain data: one entry per canonical key, describing the
 * marks a real tile carries. `drawTileFace` turns an entry into SVG. Keeping
 * the table free of DOM access lets the tests walk every key without a
 * browser; `app.js` only calls the drawing function.
 *
 * No emoji, no image files, no webfonts: the shapes are SVG, and the only
 * text is CJK (萬 / winds / dragons) with a serif CJK stack.
 */

const NS = "http://www.w3.org/2000/svg";

export const VIEW_WIDTH = 40;
export const VIEW_HEIGHT = 56;

export const PAPER = "#fffdf4";
const INK = "#1b1b1b";
const CHARACTER = "#b3261e";
const CIRCLE = "#1f5fa8";
const BAMBOO = "#1d7a4f";
const BAMBOO_DARK = "#14603d";
const BAMBOO_RED = "#c62828";
const DRAGON_RED = "#c62828";
const DRAGON_GREEN = "#1b7a3d";
const DRAGON_WHITE = "#1f5fa8";
const FLOWER = "#c2558f";
const SEASON = "#b07a1f";

const CJK =
  '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "Hiragino Mincho ProN", "Yu Mincho", "SimSun", "MingLiU", serif';

const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WIND_GLYPH = { E: "東", S: "南", W: "西", N: "北" };
const DRAGON_GLYPH = { R: "中", G: "發" };

/* -------------------------------------------------------------- circles */

/** Dot centres for each circle rank, as printed on a dots tile. */
function circleDots() {
  const grid = (xs, ys, r) =>
    ys.flatMap((y) => xs.map((x) => Object.freeze({ x, y, r })));
  return {
    1: [Object.freeze({ x: 20, y: 28, r: 12 })],
    2: grid([20], [17, 39], 7),
    3: [
      Object.freeze({ x: 11, y: 14, r: 5.4 }),
      Object.freeze({ x: 20, y: 28, r: 5.4 }),
      Object.freeze({ x: 29, y: 42, r: 5.4 }),
    ],
    4: grid([12, 28], [17, 39], 6),
    5: [
      Object.freeze({ x: 11, y: 15, r: 5.2 }),
      Object.freeze({ x: 29, y: 15, r: 5.2 }),
      Object.freeze({ x: 20, y: 28, r: 5.2 }),
      Object.freeze({ x: 11, y: 41, r: 5.2 }),
      Object.freeze({ x: 29, y: 41, r: 5.2 }),
    ],
    6: grid([12, 28], [13, 28, 43], 5.2),
    7: [
      Object.freeze({ x: 9, y: 12, r: 4.2 }),
      Object.freeze({ x: 20, y: 12, r: 4.2 }),
      Object.freeze({ x: 31, y: 12, r: 4.2 }),
      Object.freeze({ x: 12, y: 31, r: 4.4 }),
      Object.freeze({ x: 28, y: 31, r: 4.4 }),
      Object.freeze({ x: 12, y: 45, r: 4.4 }),
      Object.freeze({ x: 28, y: 45, r: 4.4 }),
    ],
    8: grid([7, 15.7, 24.3, 33], [16, 40], 4.2),
    9: grid([10, 20, 30], [13, 28, 43], 4.2),
  };
}

const CIRCLE_DOTS = circleDots();

/* --------------------------------------------------------------- bamboo */

/**
 * Sticks per bamboo rank. b1 is the bird, so it carries no sticks. Each
 * stick is a vertical bamboo segment: centre x, top y, height, optional red.
 */
function bambooSticks() {
  const stick = (x, y, h, red = false) => Object.freeze({ x, y, h, red });
  return {
    2: [stick(13, 14, 28), stick(27, 14, 28)],
    3: [stick(20, 8, 14), stick(12, 29, 18), stick(28, 29, 18)],
    4: [stick(12, 11, 14), stick(28, 11, 14), stick(12, 31, 14), stick(28, 31, 14)],
    5: [
      stick(12, 8, 12),
      stick(28, 8, 12),
      stick(20, 22, 12, true),
      stick(12, 36, 12),
      stick(28, 36, 12),
    ],
    6: [
      stick(8, 8, 18),
      stick(20, 8, 18),
      stick(32, 8, 18),
      stick(8, 30, 18),
      stick(20, 30, 18),
      stick(32, 30, 18),
    ],
    7: [
      stick(8, 8, 11),
      stick(20, 8, 11, true),
      stick(32, 8, 11),
      stick(7, 27, 20),
      stick(15.7, 27, 20),
      stick(24.3, 27, 20),
      stick(33, 27, 20),
    ],
    8: [
      stick(7, 8, 17),
      stick(15.7, 8, 17),
      stick(24.3, 8, 17),
      stick(33, 8, 17),
      stick(7, 30, 17),
      stick(15.7, 30, 17),
      stick(24.3, 30, 17),
      stick(33, 30, 17),
    ],
    9: [
      stick(8, 8, 10),
      stick(20, 8, 10),
      stick(32, 8, 10),
      stick(8, 23, 10),
      stick(20, 23, 10),
      stick(32, 23, 10),
      stick(8, 38, 10),
      stick(20, 38, 10),
      stick(32, 38, 10),
    ],
  };
}

const BAMBOO_STICKS = bambooSticks();

/* ------------------------------------------------------------- face table */

export const PLAY_TILE_KEYS = Object.freeze([
  ...Array.from({ length: 9 }, (_, i) => `b${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `c${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `o${i + 1}`),
  "wE",
  "wS",
  "wW",
  "wN",
  "dR",
  "dG",
  "dW",
]);

export const BONUS_TILE_KEYS = Object.freeze([
  "f1",
  "f2",
  "f3",
  "f4",
  "s1",
  "s2",
  "s3",
  "s4",
]);

const FACES = Object.create(null);

for (let rank = 1; rank <= 9; rank++) {
  FACES[`c${rank}`] = Object.freeze({
    kind: "characters",
    rank,
    numeral: NUMERALS[rank - 1],
    numeralColour: rank === 1 ? CHARACTER : INK,
    markColour: CHARACTER,
  });
  FACES[`o${rank}`] = Object.freeze({
    kind: "circles",
    rank,
    dots: Object.freeze(CIRCLE_DOTS[rank]),
  });
  FACES[`b${rank}`] = Object.freeze({
    kind: "bamboo",
    rank,
    bird: rank === 1,
    sticks: Object.freeze(BAMBOO_STICKS[rank] ?? []),
  });
}

for (const wind of ["E", "S", "W", "N"]) {
  FACES[`w${wind}`] = Object.freeze({
    kind: "wind",
    wind,
    glyph: WIND_GLYPH[wind],
  });
}

for (const [dragon, glyph] of [
  ["R", DRAGON_GLYPH.R],
  ["G", DRAGON_GLYPH.G],
  ["W", null],
]) {
  FACES[`d${dragon}`] = Object.freeze({ kind: "dragon", dragon, glyph });
}

const FLOWER_MOTIFS = ["plum", "orchid", "chrysanthemum", "bamboo"];
const SEASON_MOTIFS = ["spring", "summer", "autumn", "winter"];

export const BONUS_NAMES = Object.freeze({
  ...Object.fromEntries(
    FLOWER_MOTIFS.map((motif, index) => [`f${index + 1}`, `${motif} flower`]),
  ),
  ...Object.fromEntries(
    SEASON_MOTIFS.map((motif, index) => [`s${index + 1}`, `${motif} season`]),
  ),
});

FLOWER_MOTIFS.forEach((motif, index) => {
  FACES[`f${index + 1}`] = Object.freeze({
    kind: "flower",
    index: index + 1,
    motif,
  });
});
SEASON_MOTIFS.forEach((motif, index) => {
  FACES[`s${index + 1}`] = Object.freeze({
    kind: "season",
    index: index + 1,
    motif,
  });
});

export const FACES_TABLE = Object.freeze(FACES);

/** The face for a canonical key, or null when the key is not a tile. */
export function faceFor(key) {
  return Object.hasOwn(FACES, key) ? FACES[key] : null;
}

/* -------------------------------------------------------------- drawing */

function node(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function textNode(content, attributes) {
  const element = node("text", attributes);
  element.textContent = content;
  return element;
}

function circleNode(cx, cy, r, attributes) {
  return node("circle", { cx, cy, r, ...attributes });
}

function group(...children) {
  const element = node("g");
  element.append(...children);
  return element;
}

function cjk(content, attributes) {
  return textNode(content, {
    "text-anchor": "middle",
    "font-family": CJK,
    "font-weight": 600,
    ...attributes,
  });
}

/** A printed dot: solid rim, paper gap, inner ring and centre dot. */
function dotNode(dot, colour) {
  const { x, y, r } = dot;
  return group(
    circleNode(x, y, r, { fill: colour }),
    circleNode(x, y, r * 0.72, { fill: PAPER }),
    circleNode(x, y, r * 0.5, {
      fill: "none",
      stroke: colour,
      "stroke-width": Math.max(0.8, r * 0.2),
    }),
    circleNode(x, y, r * 0.18, { fill: colour }),
    circleNode(x - r * 0.32, y - r * 0.32, r * 0.11, { fill: PAPER, opacity: 0.9 }),
  );
}

function stickNode(stick) {
  const width = 3.4;
  const x = stick.x - width / 2;
  const colour = stick.red ? BAMBOO_RED : BAMBOO;
  return group(
    node("rect", {
      x,
      y: stick.y,
      width,
      height: stick.h,
      rx: width / 2,
      fill: colour,
    }),
    node("line", {
      x1: x - 0.5,
      y1: stick.y + stick.h / 2,
      x2: x + width + 0.5,
      y2: stick.y + stick.h / 2,
      stroke: PAPER,
      "stroke-width": 0.8,
      "stroke-linecap": "round",
    }),
    node("circle", {
      cx: stick.x,
      cy: stick.y + 1.7,
      r: 0.7,
      fill: PAPER,
      opacity: 0.55,
    }),
  );
}

/** b1: the sparrow, green with red beak, crest, legs and tail tip. */
function birdNode() {
  return group(
    node("path", {
      d: "M6 47 C14 44 26 44 34 47",
      fill: "none",
      stroke: BAMBOO_DARK,
      "stroke-width": 1.5,
      "stroke-linecap": "round",
    }),
    node("path", {
      d: "M14 35 L4 46 L13 44 Z",
      fill: BAMBOO,
    }),
    node("path", {
      d: "M10 44 L4 46 L8 41 Z",
      fill: BAMBOO_RED,
    }),
    node("ellipse", {
      cx: 21,
      cy: 29,
      rx: 8,
      ry: 9,
      fill: BAMBOO,
    }),
    node("path", {
      d: "M15 27 C18 23 24 24 26 29 C22 33 17 32 15 27 Z",
      fill: BAMBOO_DARK,
    }),
    circleNode(27, 17, 5.2, { fill: BAMBOO }),
    node("path", {
      d: "M24 12 L25 7 L29 11 Z",
      fill: BAMBOO_RED,
    }),
    node("path", {
      d: "M31.5 15.5 L37 18 L31.5 20.5 Z",
      fill: BAMBOO_RED,
    }),
    circleNode(28.5, 16, 1.1, { fill: PAPER }),
    node("path", {
      d: "M20 37 L20 45 M25 37 L25 45",
      stroke: BAMBOO_RED,
      "stroke-width": 1.4,
      "stroke-linecap": "round",
    }),
    node("path", {
      d: "M17 45 H23 M22 45 H28",
      stroke: BAMBOO_RED,
      "stroke-width": 1.4,
      "stroke-linecap": "round",
    }),
  );
}

function flowerNode(face) {
  const colour = face.kind === "flower" ? FLOWER : SEASON;
  const parts = [];
  switch (face.motif) {
    case "plum": {
      for (let petal = 0; petal < 5; petal++) {
        const angle = (Math.PI * 2 * petal) / 5 - Math.PI / 2;
        parts.push(
          circleNode(20 + Math.cos(angle) * 7.5, 25 + Math.sin(angle) * 7.5, 4.4, {
            fill: colour,
          }),
        );
      }
      parts.push(
        circleNode(20, 25, 3.4, { fill: PAPER }),
        circleNode(20, 25, 1.8, { fill: "#e7c65b" }),
        node("path", {
          d: "M20 32 L20 46",
          stroke: BAMBOO_DARK,
          "stroke-width": 1.6,
          "stroke-linecap": "round",
        }),
        node("path", {
          d: "M20 39 L14 35 M20 42 L26 38",
          stroke: BAMBOO_DARK,
          "stroke-width": 1.4,
          "stroke-linecap": "round",
        }),
      );
      break;
    }
    case "orchid": {
      parts.push(
        node("path", {
          d: "M20 47 C20 37 18 28 20 17",
          fill: "none",
          stroke: BAMBOO_DARK,
          "stroke-width": 1.7,
          "stroke-linecap": "round",
        }),
        node("path", {
          d: "M20 42 C13 40 9 34 9 27 C15 30 19 35 20 42 Z",
          fill: BAMBOO,
        }),
        node("path", {
          d: "M20 39 C27 37 31 31 31 25 C25 28 21 33 20 39 Z",
          fill: BAMBOO,
        }),
        node("ellipse", {
          cx: 15,
          cy: 15,
          rx: 3.2,
          ry: 6.5,
          transform: "rotate(-35 15 15)",
          fill: colour,
        }),
        node("ellipse", {
          cx: 25,
          cy: 15,
          rx: 3.2,
          ry: 6.5,
          transform: "rotate(35 25 15)",
          fill: colour,
        }),
        node("ellipse", {
          cx: 20,
          cy: 10,
          rx: 3.2,
          ry: 6,
          fill: colour,
        }),
        circleNode(20, 18, 2, { fill: "#e7c65b" }),
      );
      break;
    }
    case "chrysanthemum": {
      for (let petal = 0; petal < 12; petal++) {
        const angle = (Math.PI * 2 * petal) / 12;
        parts.push(
          node("line", {
            x1: 20 + Math.cos(angle) * 3,
            y1: 24 + Math.sin(angle) * 3,
            x2: 20 + Math.cos(angle) * 12,
            y2: 24 + Math.sin(angle) * 12,
            stroke: colour,
            "stroke-width": 2.2,
            "stroke-linecap": "round",
          }),
        );
      }
      parts.push(
        circleNode(20, 24, 3.2, { fill: "#e7c65b" }),
        node("path", {
          d: "M20 36 L20 47 M20 42 L15 47 M20 42 L25 47",
          stroke: BAMBOO_DARK,
          "stroke-width": 1.4,
          "stroke-linecap": "round",
        }),
      );
      break;
    }
    case "bamboo": {
      for (const x of [14, 26]) {
        parts.push(
          node("rect", {
            x: x - 2,
            y: 10,
            width: 4,
            height: 34,
            rx: 2,
            fill: BAMBOO,
          }),
          node("line", {
            x1: x - 2.6,
            y1: 24,
            x2: x + 2.6,
            y2: 24,
            stroke: PAPER,
            "stroke-width": 1,
          }),
          node("line", {
            x1: x - 2.6,
            y1: 36,
            x2: x + 2.6,
            y2: 36,
            stroke: PAPER,
            "stroke-width": 1,
          }),
        );
      }
      parts.push(
        node("path", {
          d: "M14 14 C9 12 6 8 5 4 C10 6 14 9 14 14 Z",
          fill: BAMBOO_DARK,
        }),
        node("path", {
          d: "M26 18 C31 16 34 12 35 8 C30 10 26 13 26 18 Z",
          fill: BAMBOO_DARK,
        }),
      );
      break;
    }
    case "spring": {
      parts.push(
        node("path", {
          d: "M20 47 L20 26",
          stroke: BAMBOO_DARK,
          "stroke-width": 1.8,
          "stroke-linecap": "round",
        }),
        node("path", {
          d: "M20 34 C13 34 8 29 7 21 C14 23 19 27 20 34 Z",
          fill: BAMBOO,
        }),
        node("path", {
          d: "M20 30 C27 30 32 25 33 17 C26 19 21 23 20 30 Z",
          fill: BAMBOO,
        }),
        node("path", {
          d: "M20 26 C20 20 17 15 13 12 C12 18 15 23 20 26 Z",
          fill: "#4caf50",
        }),
      );
      break;
    }
    case "summer": {
      for (let ray = 0; ray < 8; ray++) {
        const angle = (Math.PI * 2 * ray) / 8;
        parts.push(
          node("line", {
            x1: 20 + Math.cos(angle) * 12,
            y1: 26 + Math.sin(angle) * 12,
            x2: 20 + Math.cos(angle) * 16,
            y2: 26 + Math.sin(angle) * 16,
            stroke: colour,
            "stroke-width": 1.8,
            "stroke-linecap": "round",
          }),
        );
      }
      parts.push(
        circleNode(20, 26, 8.5, { fill: "#e7c65b", stroke: colour, "stroke-width": 1.8 }),
        circleNode(20, 26, 3, { fill: colour, opacity: 0.75 }),
      );
      break;
    }
    case "autumn": {
      parts.push(
        node("path", {
          d: "M20 44 L20 32 M20 35 L13 40 M20 35 L27 40",
          stroke: "#7a4b12",
          "stroke-width": 1.6,
          "stroke-linecap": "round",
        }),
        node("path", {
          d: "M20 6 L23 15 L32 12 L27 20 L34 26 L24 27 L20 36 L16 27 L6 26 L13 20 L8 12 L17 15 Z",
          fill: colour,
          stroke: "#8a4b10",
          "stroke-width": 1,
        }),
        node("path", {
          d: "M20 15 L20 29 M14 22 L26 22",
          stroke: "#8a4b10",
          "stroke-width": 1,
        }),
      );
      break;
    }
    case "winter": {
      for (let ray = 0; ray < 6; ray++) {
        const angle = (Math.PI * 2 * ray) / 6;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        parts.push(
          node("line", {
            x1: 20 + cos * 2,
            y1: 26 + sin * 2,
            x2: 20 + cos * 15,
            y2: 26 + sin * 15,
            stroke: colour,
            "stroke-width": 1.8,
            "stroke-linecap": "round",
          }),
          node("line", {
            x1: 20 + cos * 9,
            y1: 26 + sin * 9,
            x2: 20 + Math.cos(angle + 0.7) * 12,
            y2: 26 + Math.sin(angle + 0.7) * 12,
            stroke: colour,
            "stroke-width": 1.5,
            "stroke-linecap": "round",
          }),
          node("line", {
            x1: 20 + cos * 9,
            y1: 26 + sin * 9,
            x2: 20 + Math.cos(angle - 0.7) * 12,
            y2: 26 + Math.sin(angle - 0.7) * 12,
            stroke: colour,
            "stroke-width": 1.5,
            "stroke-linecap": "round",
          }),
        );
      }
      parts.push(circleNode(20, 26, 2.2, { fill: colour }));
      break;
    }
  }
  return group(...parts);
}

/**
 * Draw `key` into an existing SVG. Returns false (and draws a question mark)
 * when the key has no face, which the gallery test rules out for every
 * canonical key.
 */
export function drawTileFace(svg, key) {
  const face = faceFor(key);
  if (face === null) {
    svg.append(
      textNode("?", {
        x: 20,
        y: 34,
        "text-anchor": "middle",
        "font-size": 20,
        fill: INK,
      }),
    );
    return false;
  }

  switch (face.kind) {
    case "characters":
      svg.append(
        cjk(face.numeral, {
          x: 20,
          y: 25,
          "font-size": 18,
          fill: face.numeralColour,
        }),
        cjk("萬", {
          x: 20,
          y: 49,
          "font-size": 20,
          fill: face.markColour,
        }),
      );
      break;
    case "circles":
      for (const dot of face.dots) svg.append(dotNode(dot, CIRCLE));
      break;
    case "bamboo":
      if (face.bird) {
        svg.append(birdNode());
      } else {
        for (const stick of face.sticks) svg.append(stickNode(stick));
      }
      break;
    case "wind":
      svg.append(
        cjk(face.glyph, {
          x: 20,
          y: 39,
          "font-size": 32,
          fill: INK,
        }),
      );
      break;
    case "dragon":
      if (face.glyph === null) {
        svg.append(
          group(
            node("rect", {
              x: 8,
              y: 13,
              width: 24,
              height: 30,
              rx: 2,
              fill: "none",
              stroke: DRAGON_WHITE,
              "stroke-width": 2.2,
            }),
            node("rect", {
              x: 13,
              y: 18,
              width: 14,
              height: 20,
              rx: 1,
              fill: "none",
              stroke: DRAGON_WHITE,
              "stroke-width": 1.4,
            }),
          ),
        );
      } else {
        svg.append(
          cjk(face.glyph, {
            x: 20,
            y: 39,
            "font-size": face.dragon === "G" ? 29 : 32,
            fill: face.dragon === "R" ? DRAGON_RED : DRAGON_GREEN,
          }),
        );
      }
      break;
    case "flower":
    case "season": {
      svg.append(flowerNode(face));
      svg.append(
        textNode(String(face.index), {
          x: 35,
          y: 53,
          "text-anchor": "middle",
          "font-size": 8,
          "font-weight": 700,
          "font-family": CJK,
          fill: face.kind === "flower" ? FLOWER : SEASON,
        }),
      );
      break;
    }
  }
  return true;
}
