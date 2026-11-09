"""Draw the eight flower and season faces for the 3D table (original art).

Each face is one large brush kanji filling the face, like the dragons and
winds of the riichi set. Flowers print in red and seasons in blue, the inks of
the corner number the table adds at the top left (`app/src/tiles.js`), which
is what a player who does not read Chinese goes by.

The kanji are outlines from `bonus-glyphs.json` (see
`bonus-glyphs.py`), not live text, so the faces look the same on every device.

    python3 scripts/art/bonus-faces.py app/assets/faces
"""
import json, os, sys

OUT = sys.argv[1]
GLYPHS = json.load(open(os.path.join(os.path.dirname(__file__), "bonus-glyphs.json"), encoding="utf-8"))
RED, BLUE = "#b93c3c", "#1f4f8f"

# The kanji fills the face, a little right of centre to clear the corner number.
KANJI_CENTRE, KANJI_SIZE = (154, 206), 272


def kanji(char, colour):
    g = GLYPHS["kanji"][char]
    x0, y0, x1, y1 = g["bounds"]
    scale = KANJI_SIZE / max(x1 - x0, y1 - y0)
    tx = KANJI_CENTRE[0] - (x0 + x1) / 2 * scale
    ty = KANJI_CENTRE[1] + (y0 + y1) / 2 * scale  # font y runs up
    return f'<path d="{g["d"]}" fill="{colour}" transform="translate({tx:.1f} {ty:.1f}) scale({scale:.4f} {-scale:.4f})"/>'


def tile(name, char, colour):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <!-- {name}: drawn for this project (original art; glyph from Ma Shan Zheng, SIL OFL 1.1). -->
  {kanji(char, colour)}
</svg>
'''


tiles = {
    "f1": ("Plum", "梅"), "f2": ("Orchid", "兰"), "f3": ("Chrysanthemum", "菊"), "f4": ("Bamboo", "竹"),
    "s1": ("Spring", "春"), "s2": ("Summer", "夏"), "s3": ("Autumn", "秋"), "s4": ("Winter", "冬"),
}
for key, (name, char) in tiles.items():
    colour = RED if key.startswith("f") else BLUE
    with open(f"{OUT}/{key}.svg", "w", encoding="utf-8") as out:
        out.write(tile(name, char, colour))
print("wrote", len(tiles))
