"""Draw the eight flower and season faces for the 3D table (original art).

Each face is one large brush kanji, like the dragons and winds of the riichi
set, with its English name in capitals along the bottom for players who do not
read Chinese. Flowers print in red and seasons in blue, the inks of the corner
number the table adds at the top left (`app/src/tiles.js`).

Kanji and letters are outlines from `bonus-glyphs.json` (see
`bonus-glyphs.py`), not live text, so the faces look the same on every device.

    python3 scripts/art/bonus-faces.py app/assets/faces
"""
import json, os, sys

OUT = sys.argv[1]
GLYPHS = json.load(open(os.path.join(os.path.dirname(__file__), "bonus-glyphs.json"), encoding="utf-8"))
RED, BLUE = "#b93c3c", "#1f4f8f"

# The kanji sits in the upper part of the face, clear of the corner number.
KANJI_CENTRE, KANJI_SIZE = (156, 168), 236
# The name runs along the bottom at one cap height; a long name is narrowed.
LABEL_BASELINE, CAP_HEIGHT, LABEL_WIDTH, TRACKING = 372, 48, 250, 0.06


def kanji(char, colour):
    g = GLYPHS["kanji"][char]
    x0, y0, x1, y1 = g["bounds"]
    scale = KANJI_SIZE / max(x1 - x0, y1 - y0)
    tx = KANJI_CENTRE[0] - (x0 + x1) / 2 * scale
    ty = KANJI_CENTRE[1] + (y0 + y1) / 2 * scale  # font y runs up
    return f'<path d="{g["d"]}" fill="{colour}" transform="translate({tx:.1f} {ty:.1f}) scale({scale:.4f} {-scale:.4f})"/>'


def label(text, colour):
    letters = [GLYPHS["latin"][c] for c in text]
    cap = GLYPHS["latin"]["H"]["bounds"][3]
    scale = CAP_HEIGHT / cap
    track = TRACKING * letters[0]["upm"]
    width = sum(g["advance"] for g in letters) + track * (len(letters) - 1)
    squeeze = min(1.0, LABEL_WIDTH / (width * scale))
    x, parts = 0.0, []
    for g in letters:
        parts.append(f'<path d="{g["d"]}" transform="translate({x:.1f} 0)"/>')
        x += g["advance"] + track
    left = 150 - width * scale * squeeze / 2
    return (f'<g fill="{colour}" transform="translate({left:.1f} {LABEL_BASELINE}) '
            f'scale({scale * squeeze:.4f} {-scale:.4f})">{"".join(parts)}</g>')


def tile(name, char, text, colour):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <!-- {name}: drawn for this project (original art; glyphs from Ma Shan Zheng and Oswald, SIL OFL 1.1). -->
  {kanji(char, colour)}
  {label(text, colour)}
</svg>
'''


tiles = {
    "f1": ("Plum", "梅", "PLUM"), "f2": ("Orchid", "兰", "ORCHID"),
    "f3": ("Chrysanthemum", "菊", "CHRYS."), "f4": ("Bamboo", "竹", "BAMBOO"),
    "s1": ("Spring", "春", "SPRING"), "s2": ("Summer", "夏", "SUMMER"),
    "s3": ("Autumn", "秋", "AUTUMN"), "s4": ("Winter", "冬", "WINTER"),
}
for key, (name, char, text) in tiles.items():
    colour = RED if key.startswith("f") else BLUE
    with open(f"{OUT}/{key}.svg", "w", encoding="utf-8") as out:
        out.write(tile(name, char, text, colour))
print("wrote", len(tiles))
