"""Draw the eight flower and season faces for the 3D table (original art).

Layout after a classic Western set: the number is printed by the table in the
top-left corner, the Chinese name sits top-right, a botanical drawing fills the
middle and the English name runs along the bottom. Inks match the riichi faces.
"""
import math, sys
OUT = sys.argv[1]
RED, GREEN, NAVY, LEAF = "#b93c3c", "#0f5a2a", "#1d2f6b", "#2f7d3a"
CJK = "'Songti SC','STSong','Noto Serif CJK SC','Noto Serif CJK','Source Han Serif SC',serif"
LATIN = "'Helvetica Neue','Arial Narrow',Arial,sans-serif"

def leaf(x, y, angle, length, width, fill=LEAF, vein=True):
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    tx, ty = x + dx * length, y + dy * length
    c1 = (x + dx * length * 0.35 + nx * width, y + dy * length * 0.35 + ny * width)
    c2 = (x + dx * length * 0.35 - nx * width, y + dy * length * 0.35 - ny * width)
    d = f"M{x:.1f},{y:.1f} Q{c1[0]:.1f},{c1[1]:.1f} {tx:.1f},{ty:.1f} Q{c2[0]:.1f},{c2[1]:.1f} {x:.1f},{y:.1f}Z"
    out = f'<path d="{d}" fill="{fill}" stroke="{GREEN}" stroke-width="3.5" stroke-linejoin="round"/>'
    if vein:
        out += f'<path d="M{x:.1f},{y:.1f} L{x + dx * length * 0.85:.1f},{y + dy * length * 0.85:.1f}" stroke="#d9ead3" stroke-width="2.2" stroke-linecap="round"/>'
    return out

def petal(cx, cy, angle, length, width, fill=RED, stroke="#8e2626"):
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    tx, ty = cx + dx * length, cy + dy * length
    c1 = (cx + dx * length * 0.6 + nx * width, cy + dy * length * 0.6 + ny * width)
    c2 = (cx + dx * length * 0.6 - nx * width, cy + dy * length * 0.6 - ny * width)
    return (f'<path d="M{cx:.1f},{cy:.1f} C{c1[0]:.1f},{c1[1]:.1f} {tx + nx*width*0.5:.1f},{ty + ny*width*0.5:.1f} {tx:.1f},{ty:.1f} '
            f'C{tx - nx*width*0.5:.1f},{ty - ny*width*0.5:.1f} {c2[0]:.1f},{c2[1]:.1f} {cx:.1f},{cy:.1f}Z" fill="{fill}" stroke="{stroke}" stroke-width="2.5" stroke-linejoin="round"/>')

def stem(d, width=6, colour=GREEN):
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'

def blossom(cx, cy, petals, length, width, rotate=0, centre=True, fill=RED):
    out = "".join(petal(cx, cy, rotate + i * 360 / petals, length, width, fill) for i in range(petals))
    if centre:
        out += f'<circle cx="{cx}" cy="{cy}" r="{length*0.22:.1f}" fill="#f4d35e" stroke="#8e2626" stroke-width="2.5"/>'
        for i in range(petals):
            a = math.radians(rotate + 180 / petals + i * 360 / petals)
            out += f'<circle cx="{cx + math.cos(a)*length*0.32:.1f}" cy="{cy + math.sin(a)*length*0.32:.1f}" r="2.6" fill="#8e2626"/>'
    return out

def tile(name, label, character, char_colour, art):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <!-- {name}: drawn for this project (original art). -->
  <text x="272" y="78" text-anchor="end" font-family="{CJK}" font-size="66" font-weight="700" fill="{char_colour}">{character}</text>
  <g transform="translate(150 212) scale(1.24) translate(-150 -222)">{art}</g>
  <text x="150" y="380" text-anchor="middle" font-family="{LATIN}" font-size="{40 if len(label) <= 6 else 34}" font-weight="800" letter-spacing="3" fill="{RED}">{label}</text>
</svg>
'''

arts = {}
# Spring: a full blossom (peony) with leaves.
arts["s1"] = (stem("M150,300 C148,270 152,240 150,205", 8)
    + leaf(150, 250, 205, 70, 18) + leaf(150, 238, -25, 72, 18) + leaf(150, 290, 160, 52, 14) + leaf(150, 285, 20, 52, 14)
    + blossom(150, 180, 6, 52, 24, rotate=-90) + blossom(150, 180, 6, 32, 15, rotate=-60, centre=True))
# Summer: lotus on its pads.
arts["s2"] = (stem("M150,300 L150,215", 7)
    + f'<path d="M70,295 Q110,250 150,282 Q190,250 230,295 Q150,322 70,295Z" fill="{LEAF}" stroke="{GREEN}" stroke-width="3"/>'
    + stem("M150,282 L150,300", 3, "#d9ead3")
    + "".join(petal(150, 205, a, 62, 17) for a in (-90, -125, -55, -160, -20))
    + "".join(petal(150, 205, a, 40, 12, fill="#e06666") for a in (-108, -72)))
# Autumn: grasses and a broad leaf.
arts["s3"] = (stem("M150,305 C140,240 160,190 175,130", 7) + stem("M150,305 C135,250 110,200 95,160", 6)
    + stem("M150,305 C165,255 200,225 215,195", 5)
    + leaf(150, 300, -60, 100, 32) + leaf(150, 300, -120, 95, 30) + leaf(150, 300, -95, 80, 22) + leaf(150, 300, -30, 70, 20) + leaf(150, 300, -150, 66, 18)
    + "".join(f'<ellipse cx="{x}" cy="{y}" rx="7" ry="12" fill="{RED}" transform="rotate({r} {x} {y})"/>' for x, y, r in ((172,140,20),(178,160,30),(100,170,-30),(94,152,-25),(210,200,40))))
# Winter: a four-petal flower between paired leaves.
arts["s4"] = (stem("M150,305 C150,270 150,240 150,215", 6)
    + leaf(150, 150, -125, 44, 13) + leaf(150, 150, -55, 44, 13) + leaf(150, 280, 200, 58, 15) + leaf(150, 280, -20, 58, 15)
    + blossom(150, 195, 4, 46, 26, rotate=-45))
# Plum: a crooked branch with five-petal blossoms.
arts["f1"] = (stem("M90,310 C120,270 115,230 150,205 C175,185 185,160 200,140", 8, "#5b3a1e")
    + stem("M150,205 C130,180 120,160 105,140", 5, "#5b3a1e")
    + leaf(118, 268, 160, 40, 11) + leaf(182, 168, -10, 34, 10)
    + blossom(150, 190, 5, 40, 22, rotate=-90) + blossom(200, 140, 5, 24, 13, rotate=-80) + blossom(104, 138, 5, 22, 12, rotate=-100))
# Orchid: long arching leaves and small blooms.
arts["f2"] = (stem("M150,310 C120,240 80,200 60,150", 9, LEAF) + stem("M150,310 C175,230 215,190 240,170", 9, LEAF)
    + stem("M150,310 C150,240 140,180 120,120", 9, LEAF) + stem("M150,310 C160,250 175,200 195,140", 8, LEAF)
    + stem("M150,310 C110,270 95,250 70,245", 8, LEAF)
    + "".join(petal(x, y, a, 30, 13) for x, y, a in ((125,185,-120),(125,185,-60),(125,185,-170),(175,215,-70),(175,215,-10),(175,215,-130)))
    + f'<circle cx="125" cy="185" r="5" fill="#f4d35e"/><circle cx="175" cy="215" r="5" fill="#f4d35e"/>')
# Chrysanthemum: a many-rayed bloom with toothed leaves.
arts["f3"] = (stem("M150,310 C152,270 148,240 150,200", 7)
    + leaf(150, 260, 200, 70, 22) + leaf(150, 245, -20, 72, 22) + leaf(150, 295, 155, 50, 15) + leaf(150, 292, 25, 50, 15)
    + "".join(petal(150, 170, i * 15, 50, 7) for i in range(24))
    + "".join(petal(150, 170, i * 22.5 + 7, 30, 6, fill="#e06666") for i in range(16))
    + f'<circle cx="150" cy="170" r="11" fill="#f4d35e" stroke="#8e2626" stroke-width="2.5"/>')
# Bamboo: a jointed stalk with sprays of narrow leaves.
joints = "".join(f'<path d="M140,{y} L160,{y}" stroke="#d9ead3" stroke-width="3"/>' for y in (150, 205, 260))
arts["f4"] = (f'<rect x="139" y="125" width="22" height="185" rx="8" fill="{LEAF}" stroke="{GREEN}" stroke-width="3"/>' + joints
    + stem("M150,205 C180,190 200,175 218,158", 4) + stem("M150,150 C128,140 110,130 95,118", 4)
    + "".join(leaf(x, y, a, 46, 9) for x, y, a in ((218,158,-150),(218,158,-100),(218,158,-40),(95,118,-70),(95,118,-140),(95,118,10),(150,262,165),(150,262,15))))

tiles = {
    "s1": ("Spring", "SPRING", "春"), "s2": ("Summer", "SUMMER", "夏"), "s3": ("Autumn", "AUTUMN", "秋"), "s4": ("Winter", "WINTER", "冬"),
    "f1": ("Plum", "PLUM", "梅"), "f2": ("Orchid", "ORCHID", "蘭"), "f3": ("Chrysanthemum", "CHRYS.", "菊"), "f4": ("Bamboo", "BAMBOO", "竹"),
}
for key, (name, label, char) in tiles.items():
    colour = RED if key.startswith("s") else NAVY
    open(f"{OUT}/{key}.svg", "w").write(tile(name, label, char, colour, arts[key]))
print("wrote", len(tiles))
