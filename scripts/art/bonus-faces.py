"""Draw the eight flower and season faces for the 3D table (original art).

Each face is a picture a player recognises without reading Chinese - four
plants for the flowers, four emblems of the year for the seasons - drawn in
the inks and flat, outlined style of the riichi set the other faces come from
(see `app/assets/faces/LICENSE.md`). Like the tiles printed in *The Game of
Mah Jong Illustrated* (p. 9), the number sits in the top-left corner (the
table adds it, `app/src/tiles.js`) and a small kanji in the top-right; the
book's usual colouring numbers flowers in red and seasons in green, and the
kanji follow the number's ink.

The kanji are outlines from `bonus-glyphs.json` (see `bonus-glyphs.py`), not
live text, so the faces look the same on every device.

    python3 scripts/art/bonus-faces.py app/assets/faces
"""
import json, math, os, sys

OUT = sys.argv[1]
GLYPHS = json.load(open(os.path.join(os.path.dirname(__file__), "bonus-glyphs.json"), encoding="utf-8"))

# The riichi set's inks.
RED, GREEN, NAVY, BLUE, WHITE = "#b93c3c", "#004900", "#000037", "#19328c", "#ffffff"
LEAF, AMBER, GOLD, EARTH = "#2f7a32", "#cf6a1f", "#e0a526", "#6b3e1f"
FLOWER_INK, SEASON_INK = RED, GREEN

# Small kanji in the top-right corner, opposite the table's number.
KANJI_CENTRE, KANJI_SIZE = (246, 46), 64
# The picture sits centred below that header row, with a margin all round.
CX, CY = 150, 236


def kanji(char, colour):
    g = GLYPHS["kanji"][char]
    x0, y0, x1, y1 = g["bounds"]
    scale = KANJI_SIZE / max(x1 - x0, y1 - y0)
    tx = KANJI_CENTRE[0] - (x0 + x1) / 2 * scale
    ty = KANJI_CENTRE[1] + (y0 + y1) / 2 * scale  # font y runs up
    return f'<path d="{g["d"]}" fill="{colour}" transform="translate({tx:.1f} {ty:.1f}) scale({scale:.4f} {-scale:.4f})"/>'


def pt(x, y):
    return f"{x:.1f},{y:.1f}"


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def poly(points, fill, stroke=NAVY, width=5):
    return f'<polygon points="{" ".join(pt(*p) for p in points)}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linejoin="round"/>'


def circle(x, y, r, fill, stroke=NAVY, width=5):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>'


def path(d, fill="none", stroke=NAVY, width=5, cap="round"):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}" stroke-linecap="{cap}" stroke-linejoin="round"/>'


def leaf(x, y, length, deg, width, fill=LEAF, vein=True):
    """A pointed leaf from its base (x, y) along `deg`."""
    tx, ty = polar(x, y, length, deg)
    l1 = polar(x, y, length * 0.5, deg - 90)
    m1 = polar(*polar(x, y, length * 0.45, deg), width, deg - 90)
    m2 = polar(*polar(x, y, length * 0.45, deg), width, deg + 90)
    d = f"M{pt(x, y)} Q{pt(*m1)} {pt(tx, ty)} Q{pt(*m2)} {pt(x, y)}Z"
    out = path(d, fill, NAVY, 4)
    if vein:
        vx, vy = polar(x, y, length * 0.8, deg)
        out += path(f"M{pt(x, y)} L{pt(vx, vy)}", stroke=WHITE, width=2.5)
    return out


# --- Flowers ---------------------------------------------------------------

def blossom(x, y, r, fill=RED):
    """A five-petalled plum blossom."""
    out = ""
    for k in range(5):
        px, py = polar(x, y, r * 0.6, -90 + 72 * k)
        out += circle(px, py, r * 0.5, fill, NAVY, 5)
    for k in range(5):
        px, py = polar(x, y, r * 0.6, -90 + 72 * k)
        out += circle(px, py, r * 0.5 - 2.5, fill, fill, 0)
    out += circle(x, y, r * 0.3, GOLD, NAVY, 4)
    for k in range(5):
        sx, sy = polar(x, y, r * 0.52, -54 + 72 * k)
        out += circle(sx, sy, 3.5, NAVY, NAVY, 0)
    return out


def plum():
    branch = path("M64 396 C74 340 96 300 124 266 C150 232 154 196 146 150", stroke=NAVY, width=30)
    branch += path("M124 266 C156 254 196 240 226 204", stroke=NAVY, width=20)
    branch += path("M64 396 C74 340 96 300 124 266 C150 232 154 196 146 150", stroke=EARTH, width=20)
    branch += path("M124 266 C156 254 196 240 226 204", stroke=EARTH, width=11)
    buds = circle(186, 240, 13, RED, NAVY, 5) + circle(96, 196, 12, RED, NAVY, 5)
    flowers = blossom(142, 136, 62) + blossom(228, 196, 50) + blossom(90, 300, 48)
    return branch + buds + flowers


def orchid_bloom(x, y, r, tilt=0):
    out = ""
    for k, length in ((0, 1.0), (1, 0.85), (2, 0.85), (3, 1.0), (4, 1.0)):
        deg = tilt + [-90, -22, -158, 38, 142][k]
        tx, ty = polar(x, y, r * length, deg)
        a1 = polar(x, y, r * 0.5, deg - 32)
        a2 = polar(x, y, r * 0.5, deg + 32)
        out += path(f"M{pt(x, y)} Q{pt(*a1)} {pt(tx, ty)} Q{pt(*a2)} {pt(x, y)}Z", RED, NAVY, 5)
    lx, ly = polar(x, y, r * 0.36, tilt + 90)
    out += f'<ellipse cx="{lx:.1f}" cy="{ly:.1f}" rx="{r * 0.3:.1f}" ry="{r * 0.24:.1f}" fill="{WHITE}" stroke="{NAVY}" stroke-width="4.5"/>'
    out += circle(x, y, r * 0.16, GOLD, NAVY, 3.5)
    return out


def orchid():
    pot = poly([(80, 330), (220, 330), (202, 396), (98, 396)], NAVY, NAVY, 5)
    pot += path("M90 346 L210 346", stroke=WHITE, width=4)
    leaves = ""
    for d in ("M136 332 C100 250 58 214 14 198 C70 236 106 276 118 332Z",
              "M150 332 C156 240 128 170 98 112 C150 172 176 250 170 332Z",
              "M160 332 C200 262 242 230 288 222 C246 252 214 290 184 332Z",
              "M126 332 C102 296 70 288 30 300 C78 296 104 312 112 332Z",
              "M176 332 C200 296 232 290 272 304 C232 304 206 316 194 332Z"):
        leaves += path(d, LEAF, NAVY, 5)
    stem = path("M164 330 C176 270 192 226 204 160", stroke=NAVY, width=11)
    stem += path("M164 330 C176 270 192 226 204 160", stroke=GREEN, width=5)
    blooms = orchid_bloom(204, 150, 56, 5) + orchid_bloom(92, 186, 46, -15)
    return leaves + stem + pot + blooms


def chrysanthemum():
    stem = path("M150 250 C146 300 152 340 150 398", stroke=NAVY, width=17)
    stem += path("M150 250 C146 300 152 340 150 398", stroke=LEAF, width=9)
    leaves = leaf(146, 340, 112, 200, 36) + leaf(154, 316, 112, -20, 36)
    head = ""
    x, y = 150, 182
    for count, length, width, fill, offset in ((20, 124, 20, RED, 0), (16, 88, 17, "#d4574f", 11), (12, 54, 14, RED, 4)):
        for k in range(count):
            deg = offset + 360 * k / count
            tx, ty = polar(x, y, length, deg)
            a1 = polar(*polar(x, y, length * 0.6, deg), width, deg - 90)
            a2 = polar(*polar(x, y, length * 0.6, deg), width, deg + 90)
            head += path(f"M{pt(x, y)} Q{pt(*a1)} {pt(tx, ty)} Q{pt(*a2)} {pt(x, y)}Z", fill, NAVY, 4)
    head += circle(x, y, 20, GOLD, NAVY, 5)
    return stem + leaves + head


def bamboo_plant():
    out = ""
    for x0, x1, top in ((108, 96, 104), (190, 204, 136)):
        out += path(f"M{x0} 398 L{x1} {top}", stroke=NAVY, width=40, cap="butt")
        out += path(f"M{x0} 396 L{x1} {top + 3}", stroke=LEAF, width=28, cap="butt")
        for k in range(1, 5):
            t = k / 5
            nx, ny = x0 + (x1 - x0) * t, 398 + (top - 398) * t
            out += path(f"M{nx - 19:.1f} {ny:.1f} L{nx + 19:.1f} {ny:.1f}", stroke=NAVY, width=7)
        out += path(f"M{x0 - 6} 386 L{x1 - 6} {top + 16}", stroke="#7fbf6a", width=5)
    for x, y, deg in ((100, 160, 205), (100, 160, 235), (102, 220, -25), (102, 220, -55),
                      (200, 190, -15), (200, 190, -50), (194, 270, 195), (194, 270, 160),
                      (96, 112, -70), (204, 144, -105)):
        out += leaf(x, y, 108, deg, 22)
    return out


# --- Seasons ---------------------------------------------------------------

def spring():
    """A seedling with a swallow overhead."""
    out = path("M18 398 C60 340 240 340 282 398Z", EARTH, NAVY, 6)
    out += path("M150 366 C150 300 146 262 150 226", stroke=NAVY, width=17)
    out += path("M150 366 C150 300 146 262 150 226", stroke=LEAF, width=9)
    out += leaf(150, 280, 118, 200, 44) + leaf(150, 246, 122, -25, 46)
    out += leaf(150, 230, 64, -95, 20)
    # Swallow: a forked tail and swept wings, flying right.
    swallow = ("M120 128 C150 104 190 102 226 116 C200 120 186 126 176 136 C196 150 210 168 214 190 "
               "C196 168 176 156 160 150 C150 160 124 174 92 176 C110 164 120 152 126 142 "
               "C100 146 76 140 58 126 C80 130 102 130 120 128Z")
    bird = path(swallow, NAVY, NAVY, 4)
    bird += path("M226 116 C236 112 244 114 252 120 C242 120 234 122 226 124Z", RED, NAVY, 3)
    bird += circle(214, 116, 4, WHITE, WHITE, 0)
    out += f'<g transform="translate(150 140) scale(1.3) translate(-158 -140)">{bird}</g>'
    return out


def summer():
    """The sun."""
    x, y = CX, CY - 12
    out = ""
    for k in range(12):
        deg = -90 + 30 * k
        r = 142 if k % 2 == 0 else 122
        out += poly([polar(x, y, 80, deg - 12), polar(x, y, r, deg), polar(x, y, 80, deg + 12)],
                    GOLD if k % 2 else RED, NAVY, 5)
    out += circle(x, y, 86, RED, NAVY, 7)
    out += circle(x, y, 64, "#d4574f", "#d4574f", 0)
    out += path(f"M{x - 44} {y - 26} A52 52 0 0 1 {x + 8} {y - 58}", stroke=WHITE, width=8)
    return out


def autumn():
    """A maple leaf."""
    x, y = CX, CY - 10
    # Lobes (direction, length), from the lower left round to the lower right.
    lobes = [(162, 96), (-142, 140), (-90, 160), (-38, 140), (18, 96)]
    pts = [polar(x, y, 30, 118)]
    for i, (deg, r) in enumerate(lobes):
        pts += [polar(x, y, r * 0.55, deg - 20), polar(x, y, r * 0.72, deg - 14), polar(x, y, r * 0.62, deg - 9),
                polar(x, y, r, deg),
                polar(x, y, r * 0.62, deg + 9), polar(x, y, r * 0.72, deg + 14), polar(x, y, r * 0.55, deg + 20)]
        if i < len(lobes) - 1:
            pts.append(polar(x, y, r * 0.32, deg + 26))
    pts.append(polar(x, y, 30, 62))
    out = path(f"M{x} {y + 20} C{x + 4} {y + 60} {x + 14} {y + 100} {x + 32} {y + 150}", stroke=NAVY, width=17)
    out += path(f"M{x} {y + 20} C{x + 4} {y + 60} {x + 14} {y + 100} {x + 32} {y + 150}", stroke=EARTH, width=8)
    out += poly(pts, AMBER, NAVY, 6)
    for deg, r in lobes:
        vx, vy = polar(x, y, r * 0.8, deg)
        out += path(f"M{x} {y + 10} L{vx:.1f} {vy:.1f}", stroke=RED, width=5)
    return out


def winter():
    """A snowflake."""
    out = ""
    x, y = CX, CY - 12
    arms = ""
    for k in range(6):
        deg = -90 + 60 * k
        tip = polar(x, y, 134, deg)
        arms += f"M{x} {y} L{pt(*tip)}"
        for at, length in ((0.42, 46), (0.7, 34)):
            bx, by = polar(x, y, 134 * at, deg)
            arms += f" M{pt(bx, by)} L{pt(*polar(bx, by, length, deg - 45))} M{pt(bx, by)} L{pt(*polar(bx, by, length, deg + 45))} "
    out += path(arms, stroke=NAVY, width=22)
    out += path(arms, stroke=BLUE, width=11)
    for k in range(6):
        out += circle(*polar(x, y, 134, -90 + 60 * k), 10, BLUE, NAVY, 5)
    out += poly([polar(x, y, 28, 30 + 60 * k) for k in range(6)], WHITE, NAVY, 6)
    return out


def tile(name, char, colour, art):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <!-- {name}: drawn for this project (original art; glyph from Ma Shan Zheng, SIL OFL 1.1). -->
  <g transform="translate(150 258) scale(0.82) translate(-150 -244)">{art}</g>
  {kanji(char, colour)}
</svg>
'''


tiles = {
    "f1": ("Plum", "梅", plum), "f2": ("Orchid", "兰", orchid),
    "f3": ("Chrysanthemum", "菊", chrysanthemum), "f4": ("Bamboo", "竹", bamboo_plant),
    "s1": ("Spring", "春", spring), "s2": ("Summer", "夏", summer),
    "s3": ("Autumn", "秋", autumn), "s4": ("Winter", "冬", winter),
}
for key, (name, char, draw) in tiles.items():
    colour = FLOWER_INK if key.startswith("f") else SEASON_INK
    with open(f"{OUT}/{key}.svg", "w", encoding="utf-8") as out:
        out.write(tile(name, char, colour, draw()))
print("wrote", len(tiles))
