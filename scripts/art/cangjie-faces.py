"""Cut tile faces for the 3D table from Cangjie6's mahjong tiles.

Wikimedia Commons user Cangjie6's "SVG Oblique illustrations of Mahjong tiles"
(CC BY-SA 4.0, see app/assets/faces/chinese/LICENSE.md) draw a whole tile,
body and all, in the traditional Chinese style, flowers and seasons included.
The table models the body itself (app/src/tiles.js), so this keeps only what
is printed on the front: it drops the body group, the Illustrator leftovers
and anything they alone used, and crops the view box to the front face,
widened to the faces' 3:4 shape. The drawings themselves are not changed.

It writes three folders under OUT_ROOT:

- chinese/: all 42 faces (suits, winds, dragons, flowers, seasons), inks as drawn.
- riichi/ and riichi-dark/: the eight flowers and seasons only, for the two
  FluffyStuff riichi sets, which have none. Their inks are recoloured to that
  set's palette so they sit with its suits; nothing else is changed.

Run it on a folder holding the source files under the names used by
vitaly4uk/mahjong (static/game/tiles/, the same Commons files with Adobe
metadata stripped):

    python3 scripts/art/cangjie-faces.py SOURCE_DIR app/assets/faces
"""
import os, re, sys
from xml.dom import minidom

SOURCE, OUT_ROOT = sys.argv[1], sys.argv[2]

# Canonical key: (source file, Commons file name).
PLAY = {
    **{f"c{n}": (f"Man{n}.svg", f"MJw{n}-.svg") for n in range(1, 10)},
    **{f"o{n}": (f"Pin{n}.svg", f"MJt{n}-.svg") for n in range(1, 10)},
    **{f"b{n}": (f"Sou{n}.svg", f"MJs{n}-.svg") for n in range(1, 10)},
    "wE": ("Ton.svg", "MJf1-.svg"),
    "wS": ("Nan.svg", "MJf2-.svg"),
    "wW": ("Shaa.svg", "MJf3-.svg"),
    "wN": ("Pei.svg", "MJf4-.svg"),
    "dR": ("Chun.svg", "MJd1-.svg"),
    "dG": ("Hatsu.svg", "MJd2-.svg"),
    "dW": ("Haku.svg", "MJd3-.svg"),
}
# Flowers MJh5-8 (梅蘭菊竹), seasons MJh1-4 (春夏秋冬).
BONUS = {
    "f1": ("Plum.svg", "MJh5-.svg"),
    "f2": ("Orchid.svg", "MJh6-.svg"),
    "f3": ("Chrysanthemum.svg", "MJh7-.svg"),
    "f4": ("Bamboo.svg", "MJh8-.svg"),
    "s1": ("Spring.svg", "MJh1-.svg"),
    "s2": ("Summer.svg", "MJh2-.svg"),
    "s3": ("Autumn.svg", "MJh3-.svg"),
    "s4": ("Winter.svg", "MJh4-.svg"),
}

# Cangjie6's four inks (blue, red, green, orange) in each riichi set's own
# palette, taken from FluffyStuff's drawings: Regular prints navy, red and
# green on ivory; Black prints white, red and gold on a dark face.
INKS = ("#2A3B92", "#BF3718", "#038249", "#D37F11")
# A few strokes carry no ink class and print in the default black; `None`
# leaves them black, a colour gives them that ink instead.
PALETTES = {
    "riichi": (dict(zip(INKS, ("#000037", "#b93c3c", "#004900", "#ff5c00"))), None),
    "riichi-dark": (dict(zip(INKS, ("#ffffff", "#ff3737", "#f0a023", "#ff5c00"))), "#ffffff"),
}

# The tile's front face in the source coordinates (the same in all files whose
# view box starts at -192 293.9, measured with the browser's
# getBoundingClientRect): x -178.7..-29.3, y 346.5..535.8. Keep its width and
# centre and make the box 3:4 like the other faces, so the art is not stretched.
ORIGIN = (-192, 293.9)
FACE_X, FACE_W = -178.7, 149.4
FACE_CY = (346.5 + 535.8) / 2
FACE_H = FACE_W * 4 / 3

# The body: an empty group, and the shapes of the tile drawing (its edge,
# sides, face, face gradient and highlights). In most files the printed art is
# a sibling of the body's group; in the circles it sits inside it, so only these
# shapes go, never their group.
BODY_IDS = {"g4146", "rect4031", "rect3767", "rect3861", "rect3765", "path3932", "path3936", "path3882"}
BODY_PREFIXES = ("rect3008",)


def is_body(node):
    name = node.getAttribute("id")
    return name in BODY_IDS or name.startswith(BODY_PREFIXES)


def elements(node):
    return [c for c in node.childNodes if c.nodeType == c.ELEMENT_NODE]


def walk(node):
    yield node
    for child in elements(node):
        yield from walk(child)


def view_box(svg):
    # One file (MJt1-) is drawn from 0 0; shift the face box with its origin.
    x, y = (float(v) for v in svg.getAttribute("viewBox").split()[:2])
    dx, dy = x - ORIGIN[0], y - ORIGIN[1]
    return f"{FACE_X + dx:g} {FACE_CY - FACE_H / 2 + dy:.2f} {FACE_W:g} {FACE_H:.2f}"


def recolour(css, inks):
    for ink, colour in inks.items():
        css = re.sub(re.escape(ink), colour, css, flags=re.IGNORECASE)
    return css


def cut(text, commons, palette):
    doc = minidom.parseString(text)
    svg = doc.documentElement
    box = view_box(svg)
    for node in list(walk(svg)):
        if is_body(node) or node.tagName.endswith("pgf"):
            node.parentNode.removeChild(node)
    for node in walk(svg):
        if node.hasAttribute("i:extraneous"):
            node.removeAttribute("i:extraneous")
    # Drop the classes nothing left uses, then the gradients and filters
    # nothing left refers to.
    for style in svg.getElementsByTagName("style"):
        css = style.firstChild.data
        used = svg.toxml()
        rules = [r for r in re.findall(r"\.(st\d+)\{[^}]*\}", css) if f'class="{r}"' in used]
        kept = "".join(re.search(r"\." + r + r"\{[^}]*\}", css).group(0) for r in rules)
        style.firstChild.data = kept
    body = svg.toxml()
    for node in list(walk(svg)):
        name = node.getAttribute("id")
        if node.tagName in ("filter", "linearGradient", "radialGradient") and f"#{name})" not in body.replace(node.toxml(), ""):
            node.parentNode.removeChild(node)
    for attr in list(svg.attributes.keys()):
        if attr.startswith("xmlns:") and attr not in ("xmlns:xlink",) or attr in ("style", "x", "y", "xml:space", "id", "version", "enable-background"):
            svg.removeAttribute(attr)
    svg.setAttribute("viewBox", box)
    if palette and palette[1]:
        svg.setAttribute("fill", palette[1])
    svg.setAttribute("width", "300")
    svg.setAttribute("height", "400")
    changed = "tile body removed, cropped to the face" + (", inks recoloured" if palette else "")
    note = doc.createComment(
        f" {commons} by Cangjie6, Wikimedia Commons, CC BY-SA 4.0"
        f" (https://creativecommons.org/licenses/by-sa/4.0/); {changed}. See LICENSE.md. "
    )
    svg.insertBefore(note, svg.firstChild)
    out = svg.toxml()
    if palette:
        # Inks sit in the style sheet and in a few fill attributes alike.
        out = recolour(out, palette[0])
    out = re.sub(r">\s+<", "><", out)
    out = re.sub(r"[ \t]*\n[ \t]*", " ", out)
    return out.replace("><", ">\n<") + "\n"


def write(folder, faces, palette=None):
    out = os.path.join(OUT_ROOT, folder)
    os.makedirs(out, exist_ok=True)
    for key, (name, commons) in faces.items():
        with open(os.path.join(SOURCE, name), encoding="utf-8") as f:
            text = f.read()
        with open(os.path.join(out, f"{key}.svg"), "w", encoding="utf-8") as f:
            f.write(cut(text, commons, palette))
        print(folder, key, name)


write("chinese", {**PLAY, **BONUS})
for folder, palette in PALETTES.items():
    write(folder, BONUS, palette)
