"""Extract the glyph outlines the flower and season faces are drawn from.

The faces print their kanji as outlines, not live text, so they look the same
on every device whatever fonts it has. This script reads the brush font Ma Shan
Zheng (SIL Open Font License) from its npm package @fontsource/ma-shan-zheng
and writes the outlines `bonus-faces.py` needs to `scripts/art/bonus-glyphs.json`.

Run from a scratch directory (needs `pip install fonttools brotli`):

    npm pack @fontsource/ma-shan-zheng
    for f in fontsource-*.tgz; do mkdir -p "${f%.tgz}"; tar xzf "$f" -C "${f%.tgz}"; done
    python3 <repo>/scripts/art/bonus-glyphs.py . <repo>/scripts/art/bonus-glyphs.json
"""
import glob, json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT, OUT = sys.argv[1], sys.argv[2]
KANJI = "梅兰菊竹春夏秋冬"

def extract(pattern, chars):
    found = {}
    for path in sorted(glob.glob(f"{ROOT}/{pattern}")):
        font = TTFont(path)
        cmap, glyphs, metrics = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
        for c in chars:
            if c in found or ord(c) not in cmap:
                continue
            name = cmap[ord(c)]
            pen, bounds = SVGPathPen(glyphs), BoundsPen(glyphs)
            glyphs[name].draw(pen)
            glyphs[name].draw(bounds)
            found[c] = {"d": pen.getCommands(), "bounds": [round(v, 1) for v in bounds.bounds],
                        "advance": metrics[name][0], "upm": font["head"].unitsPerEm}
    missing = [c for c in chars if c not in found]
    if missing:
        sys.exit(f"missing glyphs {missing} in {pattern}")
    return found

data = {
    "kanji": extract("fontsource-ma-shan-zheng-*/package/files/*-400-normal.woff2", KANJI),
}
json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("wrote", len(data["kanji"]), "kanji")
