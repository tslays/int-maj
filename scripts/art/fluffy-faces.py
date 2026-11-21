"""Vendor one of FluffyStuff's riichi tile sets as faces for the 3D table.

riichi-mahjong-tiles by FluffyStuff (CC0, https://github.com/FluffyStuff/riichi-mahjong-tiles)
draws each tile face in a 300 x 400 view box. This copies the 34 play tiles
of one variant under the table's canonical keys (b/c/o 1-9, winds, dragons)
and tidies them: XML comments, the Inkscape and Sodipodi elements and
attributes (named view, guides, path effects), the RDF metadata and the
namespaces only they used are removed. Geometry, colours and the view box are
not changed. The red-five dora tiles, Front, Back and Blank are not used.

    python3 scripts/art/fluffy-faces.py UPSTREAM/Black app/assets/faces/riichi-dark

The Riichi set in app/assets/faces/riichi/ was vendored from `Regular/` the
same way by hand (it also dropped unused path effects and markers).
"""
import os, re, sys
from xml.dom import minidom

SOURCE, OUT = sys.argv[1], sys.argv[2]

NAMES = {
    **{f"b{n}": f"Sou{n}.svg" for n in range(1, 10)},
    **{f"o{n}": f"Pin{n}.svg" for n in range(1, 10)},
    **{f"c{n}": f"Man{n}.svg" for n in range(1, 10)},
    "wE": "Ton.svg", "wS": "Nan.svg", "wW": "Shaa.svg", "wN": "Pei.svg",
    "dR": "Chun.svg", "dG": "Hatsu.svg", "dW": "Haku.svg",
}

EDITOR = ("inkscape:", "sodipodi:", "rdf:", "cc:", "dc:", "osb:")


def walk(node):
    yield node
    for child in list(node.childNodes):
        yield from walk(child)


def tidy(text):
    doc = minidom.parseString(text)
    svg = doc.documentElement
    for node in list(walk(svg)):
        if node.nodeType == node.COMMENT_NODE:
            node.parentNode.removeChild(node)
        elif node.nodeType == node.ELEMENT_NODE:
            if node.tagName == "metadata" or node.tagName.startswith(EDITOR):
                node.parentNode.removeChild(node)
                continue
            for attr in list(node.attributes.keys()):
                if attr.startswith(EDITOR) or attr.startswith("xmlns:") and attr != "xmlns:xlink":
                    node.removeAttribute(attr)
    out = svg.toxml()
    out = re.sub(r">\s+<", "><", out)
    out = re.sub(r"[ \t]*\n[ \t]*", " ", out)
    return out.replace("><", ">\n<") + "\n"


os.makedirs(OUT, exist_ok=True)
for key, name in NAMES.items():
    with open(os.path.join(SOURCE, name), encoding="utf-8") as f:
        text = f.read()
    with open(os.path.join(OUT, f"{key}.svg"), "w", encoding="utf-8") as f:
        f.write(tidy(text))
    print(key, name)
