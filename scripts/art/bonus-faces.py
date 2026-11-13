"""Cut the eight flower and season faces for the 3D table from Cangjie6's tiles.

The faces are the traditional bonus tiles of a standard set (梅蘭菊竹 and
春夏秋冬, each with its plant or picture and its number) from Wikimedia Commons
user Cangjie6's "SVG Oblique illustrations of Mahjong tiles", CC BY-SA 4.0
(see app/assets/faces/LICENSE.md). Those drawings show a whole tile, body and
all; the table models the body itself (app/src/tiles.js), so this keeps only
what is printed on the front: it drops the body group, the Illustrator
leftovers and anything they alone used, and crops the view box to the front
face, widened to the faces' 3:4 shape. The artwork itself is not changed.

Run it on a folder holding the source files under the names used by
vitaly4uk/mahjong (static/game/tiles/, the same Commons files with Adobe
metadata stripped):

    python3 scripts/art/bonus-faces.py SOURCE_DIR app/assets/faces
"""
import os, re, sys
from xml.dom import minidom

SOURCE, OUT = sys.argv[1], sys.argv[2]

# Canonical key: (source file, Commons file name). Flowers MJh5-8, seasons MJh1-4.
FACES = {
    "f1": ("Plum.svg", "MJh5-.svg"),
    "f2": ("Orchid.svg", "MJh6-.svg"),
    "f3": ("Chrysanthemum.svg", "MJh7-.svg"),
    "f4": ("Bamboo.svg", "MJh8-.svg"),
    "s1": ("Spring.svg", "MJh1-.svg"),
    "s2": ("Summer.svg", "MJh2-.svg"),
    "s3": ("Autumn.svg", "MJh3-.svg"),
    "s4": ("Winter.svg", "MJh4-.svg"),
}

# The tile's front face in the source coordinates (the same in all eight,
# measured with the browser's getBoundingClientRect): x -178.7..-29.3,
# y 346.5..535.8. Keep its width and centre and make the box 3:4 like the
# other faces, so the art is not stretched.
FACE_X, FACE_W = -178.7, 149.4
FACE_CY = (346.5 + 535.8) / 2
FACE_H = FACE_W * 4 / 3
VIEW_BOX = f"{FACE_X:g} {FACE_CY - FACE_H / 2:.2f} {FACE_W:g} {FACE_H:.2f}"

# The body's groups: the tile drawing and an empty group beside it.
BODY_IDS = {"g4630", "g4146"}


def elements(node):
    return [c for c in node.childNodes if c.nodeType == c.ELEMENT_NODE]


def walk(node):
    yield node
    for child in elements(node):
        yield from walk(child)


def cut(text, commons):
    doc = minidom.parseString(text)
    svg = doc.documentElement
    for node in list(walk(svg)):
        if node.getAttribute("id") in BODY_IDS or node.tagName.endswith("pgf"):
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
        if attr.startswith("xmlns:") and attr not in ("xmlns:xlink",) or attr in ("style", "x", "y", "xml:space", "id", "version"):
            svg.removeAttribute(attr)
    svg.setAttribute("viewBox", VIEW_BOX)
    svg.setAttribute("width", "300")
    svg.setAttribute("height", "400")
    note = doc.createComment(
        f" {commons} by Cangjie6, Wikimedia Commons, CC BY-SA 4.0"
        " (https://creativecommons.org/licenses/by-sa/4.0/); tile body removed,"
        " cropped to the face. See LICENSE.md. "
    )
    svg.insertBefore(note, svg.firstChild)
    out = svg.toxml()
    out = re.sub(r">\s+<", "><", out)
    out = re.sub(r"[ \t]*\n[ \t]*", " ", out)
    return out.replace("><", ">\n<") + "\n"


for key, (name, commons) in FACES.items():
    with open(os.path.join(SOURCE, name), encoding="utf-8") as f:
        text = f.read()
    with open(os.path.join(OUT, f"{key}.svg"), "w", encoding="utf-8") as f:
        f.write(cut(text, commons))
    print(key, name)
