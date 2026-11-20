"""Draw the app icon (app/assets/icons/icon.svg) and cut the title font (app/assets/fonts/).

The icon is one letter in two colours: the italic "i" of the title, gold on the
table's felt teal, its dot a mahjong tile set down at a slight angle. The stem
is the title font's own dotless i; the tile has a tile's proportions (1 : 1.36),
leans with the italic and turns a further 8 degrees.

The title screen sets "int-maj" in the same font, so icon and title share their
letters on every device: Inter Display Black Italic (SIL OFL 1.1, no Reserved
Font Name). The script writes the letter into the SVG as an outline and writes a
small WOFF2 subset (Basic Latin) for the page.

Needs Python 3 with fonttools, uharfbuzz and brotli (pip install fonttools
uharfbuzz brotli) and the Inter Display Black Italic OTF, from
https://github.com/rsms/inter or a system package such as Debian's fonts-inter:

    python3 scripts/art/app-icon.py [path/to/InterDisplay-BlackItalic.otf]

Then rasterise the PNG icons: node scripts/art/app-icon-png.ts
"""

import math
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONT = Path(sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf")

FELT, GOLD = "#134e4c", "#ffd968"
SIZE = 512
HEIGHT = 330  # the letter, dot to baseline
TILE = 1.36  # a tile's height to its width, as on the 3D table
DOT = 1.3  # the tile's width to the stem's
GAP = 0.36  # the gap under the tile, in tile widths
TURN = 8  # degrees the tile turns beyond the italic
SLANT = 0.17  # the font's italic, as a skew (about 9.7 degrees)


def letter() -> tuple[str, list[tuple[float, float]], float, float, float, float]:
    """The dotless i placed for the icon: its path, its outline points, and the tile's centre and width."""
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    dotless, dotted = cmap[0x131], cmap[ord("i")]
    bounds = BoundsPen(glyphs)
    glyphs[dotless].draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds
    stem_height = y_max - max(y_min, 0)
    stem_width = x_max - x_min - stem_height * SLANT
    scale = HEIGHT / (stem_height + stem_width * DOT * TILE + GAP * stem_width * DOT)
    width = stem_width * scale * DOT
    height, gap = width * TILE, GAP * width
    top = SIZE / 2 - (stem_height * scale + gap + height) / 2
    base = top + height + gap + stem_height * scale
    origin = SIZE / 2 - (x_max - x_min) * scale / 2 - x_min * scale
    transform = (scale, 0, 0, -scale, origin, base)
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    glyphs[dotless].draw(TransformPen(pen, transform))
    # The tile stands where the font puts the dot, nudged along the italic.
    record = RecordingPen()
    glyphs[dotted].draw(record)
    contours, current = [], []
    for op, args in record.value:
        current.extend(args)
        if op in ("closePath", "endPath"):
            contours.append(current)
            current = []
    dot = max(contours, key=lambda points: min(y for _, y in points))
    dot_x = (min(x for x, _ in dot) + max(x for x, _ in dot)) / 2
    dot_y = min(y for _, y in dot)
    centre_y = top + height / 2
    centre_x = origin + dot_x * scale + (base - centre_y - dot_y * scale) * SLANT * 0.25
    outline = BoundsPen(glyphs)
    glyphs[dotless].draw(TransformPen(outline, transform))
    ox0, oy0, ox1, oy1 = outline.bounds
    return pen.getCommands(), [(ox0, oy0), (ox1, oy1)], centre_x, centre_y, width, height


def tile_corners(cx: float, cy: float, w: float, h: float) -> list[tuple[float, float]]:
    """The tile's corners after its skew and turn, as SVG applies them."""
    turn, skew = math.radians(TURN), math.tan(-math.radians(SLANT * 57.3))
    points = []
    for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        x += skew * y
        points.append((cx + x * math.cos(turn) - y * math.sin(turn), cy + x * math.sin(turn) + y * math.cos(turn)))
    return points


def icon() -> str:
    path, outline, cx, cy, w, h = letter()
    points = outline + tile_corners(cx, cy, w, h)
    xs, ys = [x for x, _ in points], [y for _, y in points]
    dx, dy = SIZE / 2 - (min(xs) + max(xs)) / 2, SIZE / 2 - (min(ys) + max(ys)) / 2
    tile = (
        f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({TURN}) skewX({-SLANT * 57.3:.1f}) translate({-cx:.1f} {-cy:.1f})">'
        f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{w * 0.2:.1f}" fill="{GOLD}"/></g>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">\n'
        "  <!-- App icon, drawn by scripts/art/app-icon.py: the title's italic i (Inter Display Black Italic,\n"
        "       SIL OFL 1.1, as an outline), its dot a mahjong tile. -->\n"
        f'  <rect width="{SIZE}" height="{SIZE}" fill="{FELT}"/>\n'
        f'  <g transform="translate({dx:.1f} {dy:.1f})">\n    <path d="{path}" fill="{GOLD}"/>\n    {tile}\n  </g>\n</svg>\n'
    )


def title_font() -> None:
    """A Basic Latin WOFF2 subset of the font, plus the dotless i the title's tile stands on."""
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = ["*"]
    font = subset.load_font(str(FONT), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[*range(0x20, 0x7F), 0x131])
    subsetter.subset(font)
    out = ROOT / "app/assets/fonts/InterDisplay-BlackItalic.woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(out), options)


if __name__ == "__main__":
    (ROOT / "app/assets/icons/icon.svg").write_text(icon())
    title_font()
