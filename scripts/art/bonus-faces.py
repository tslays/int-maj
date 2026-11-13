"""Draw the eight flower and season faces for the 3D table (original art).

Each face is a small painting a player recognises without reading Chinese:
four plants for the flowers (plum, orchid, chrysanthemum, bamboo) and four
pictures of the year for the seasons (a seedling with a butterfly, the sun,
maple leaves, a snowflake). The shapes are shaded with gradients and outlined
in a darker tone of their own colour, and each picture sits on a card of its
own colour (`tiles` below), so the eight are told apart by colour first. The table prints
the number in the top-left corner (`app/src/tiles.js`), red for flowers and
green for seasons, the colouring *The Game of Mah Jong Illustrated* calls
usual (p. 9); the art keeps that corner clear.

Only gradients are used, no SVG filters, so the faces draw the same in every
browser when the table paints them onto a canvas.

    python3 scripts/art/bonus-faces.py app/assets/faces
"""
import math, sys

OUT = sys.argv[1]

# The coloured card each picture sits on: below the table's corner number,
# and the picture is scaled to fit inside it.
PANEL = (4, 46, 292, 350)
ART_SCALE = 0.9


# --- Drawing helpers -------------------------------------------------------

def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def pt(x, y):
    return f"{f(x)},{f(y)}"


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


class Face:
    """One face: its gradient definitions and its shapes."""

    def __init__(self):
        self.defs, self.body = [], []

    def add(self, svg):
        self.body.append(svg)

    def _stops(self, stops):
        out = ""
        for s in stops:
            op = f' stop-opacity="{s[2]}"' if len(s) > 2 else ""
            out += f'<stop offset="{s[0]}" stop-color="{s[1]}"{op}/>'
        return out

    def lin(self, stops, x1=0, y1=0, x2=1, y2=0):
        gid = f"g{len(self.defs)}"
        self.defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{self._stops(stops)}</linearGradient>')
        return f"url(#{gid})"

    def rad(self, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None, user=False):
        gid = f"g{len(self.defs)}"
        units = ' gradientUnits="userSpaceOnUse"' if user else ""
        focus = f' fx="{f(fx)}" fy="{f(fy)}"' if fx is not None else ""
        self.defs.append(f'<radialGradient id="{gid}" cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"{focus}{units}>{self._stops(stops)}</radialGradient>')
        return f"url(#{gid})"

    def svg(self, name, theme):
        light, mid, dark = theme
        card = self.rad([(0, light), (0.55, mid), (1, dark)], 0.5, 0.45, 0.75)
        panel = (f'<rect x="{PANEL[0]}" y="{PANEL[1]}" width="{PANEL[2]}" height="{PANEL[3]}" rx="28" fill="{card}"/>'
                 f'<rect x="{PANEL[0] + 8}" y="{PANEL[1] + 8}" width="{PANEL[2] - 16}" height="{PANEL[3] - 16}" rx="21" '
                 f'fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.7"/>')
        x, y, w, h = PANEL
        fit = f"translate({f(x + w / 2)} {f(y + h / 2)}) scale({ART_SCALE}) translate(-150 -200)"
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">\n'
                f'  <!-- {name}: drawn for this project (original art). -->\n'
                f'  <defs>{"".join(self.defs)}<clipPath id="card"><rect x="{x + 3}" y="{y + 3}" width="{w - 6}" height="{h - 6}" rx="25"/></clipPath></defs>\n'
                f'  {panel}\n  <g clip-path="url(#card)"><g transform="{fit}">\n  ' + "\n  ".join(self.body) + "\n  </g></g>\n</svg>\n")


def shape(d, fill, stroke="none", width=0, extra=""):
    s = f' stroke="{stroke}" stroke-width="{f(width)}" stroke-linejoin="round" stroke-linecap="round"' if stroke != "none" else ""
    return f'<path d="{d}" fill="{fill}"{s}{extra}/>'


def line(d, stroke, width, opacity=1):
    op = f' stroke-opacity="{opacity}"' if opacity != 1 else ""
    return f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{f(width)}" stroke-linecap="round" stroke-linejoin="round"{op}/>'


def placed(svg, x, y, deg=0, sx=1, sy=1):
    scale = f" scale({f(sx)} {f(sy)})" if (sx, sy) != (1, 1) else ""
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(deg)}){scale}">{svg}</g>'


def petal_d(length, w, tip="round"):
    """A petal from its base at the origin along +x, half-width w."""
    L = length
    if tip == "point":
        return f"M0,0 C{pt(.3*L, -w)} {pt(.7*L, -.75*w)} {pt(L, 0)} C{pt(.7*L, .75*w)} {pt(.3*L, w)} 0,0Z"
    if tip == "notch":
        return (f"M0,0 C{pt(.05*L, -.9*w)} {pt(.7*L, -1.2*w)} {pt(.96*L, -.45*w)} "
                f"Q{pt(.99*L, -.08*w)} {pt(.86*L, 0)} Q{pt(.99*L, .08*w)} {pt(.96*L, .45*w)} "
                f"C{pt(.7*L, 1.2*w)} {pt(.05*L, .9*w)} 0,0Z")
    return f"M0,0 C{pt(.1*L, -.9*w)} {pt(.55*L, -1.1*w)} {pt(.88*L, -.75*w)} Q{pt(1.04*L, 0)} {pt(.88*L, .75*w)} C{pt(.55*L, 1.1*w)} {pt(.1*L, .9*w)} 0,0Z"


def bezier(p0, p1, p2, p3, n=36):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def tapered(pts, w0, w1):
    """A filled stroke along `pts` whose width runs from w0 to w1."""
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        ax, ay = pts[max(i - 1, 0)]
        bx, by = pts[min(i + 1, len(pts) - 1)]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        w = (w0 + (w1 - w0) * i / (len(pts) - 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    ring = left + right[::-1]
    return "M" + " L".join(pt(*p) for p in ring) + "Z"


def leaf_d(length, w, lobes=0):
    """A leaf from its base at the origin along +x; lobes give a toothed edge."""
    top, bottom = [], []
    n = 40
    for i in range(n + 1):
        t = i / n
        env = w * math.sin(math.pi * min(t * 1.08, 1)) ** 0.75 * (1 - 0.15 * t)
        if lobes:
            env *= 1 - 0.32 * abs(math.sin(lobes * math.pi * t)) ** 1.5
        top.append((length * t, -env))
        bottom.append((length * t, env))
    ring = top + bottom[::-1]
    return "M" + " L".join(pt(*p) for p in ring) + "Z"


# Leaf colours: light top edge to dark bottom edge.
LEAF_STOPS = [(0, "#9fd36b"), (0.45, "#4f9a3a"), (1, "#1d5a26")]
LEAF_EDGE = "#14401b"


def leaf(face, x, y, length, deg, w, lobes=0, stops=LEAF_STOPS, edge=LEAF_EDGE, veins=True):
    fill = face.lin(stops, 0, 0, 0, 1)
    out = shape(leaf_d(length, w, lobes), fill, edge, 2.6)
    if veins:
        out += line(f"M{pt(length * .04, 0)} Q{pt(length * .5, -w * .08)} {pt(length * .9, 0)}", "#e8f5c8", 2.2, 0.75)
        for t in (0.3, 0.5, 0.7):
            out += line(f"M{pt(length * t, 0)} L{pt(length * (t + .12), -w * .55)}", "#e8f5c8", 1.3, 0.45)
            out += line(f"M{pt(length * t, 0)} L{pt(length * (t + .12), w * .55)}", LEAF_EDGE, 1.3, 0.35)
    return placed(out, x, y, deg)


def ground_shadow(face, x, y, rx, ry):
    fill = face.rad([(0, "#3a2a18", 0.28), (1, "#3a2a18", 0)])
    return f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"/>'


# --- Flowers ---------------------------------------------------------------

def plum_blossom(face, x, y, r, turn=0):
    petal = face.lin([(0, "#8a0a3a"), (0.35, "#d81e5b"), (0.8, "#f75f8f"), (1, "#ff9ab8")])
    out = ""
    for k in range(5):
        out += placed(shape(petal_d(r, r * 0.5, "notch"), petal, "#6a0c1e", 2.6), x, y, turn - 90 + 72 * k)
    for k in range(5):
        a = turn - 90 + 72 * k
        out += line(f"M{pt(*polar(x, y, r * .2, a))} L{pt(*polar(x, y, r * .6, a))}", "#ffd2d2", 1.6, 0.5)
    for k in range(14):
        a = turn + k * 360 / 14
        tip = polar(x, y, r * (0.42 if k % 2 else 0.52), a)
        out += line(f"M{pt(x, y)} L{pt(*tip)}", "#7a1020", 1.6)
        out += f'<circle cx="{f(tip[0])}" cy="{f(tip[1])}" r="{f(r * .06)}" fill="#ffd54a" stroke="#9a6a00" stroke-width="1"/>'
    centre = face.rad([(0, "#fff3a6"), (1, "#e09a14")])
    out += f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * .16)}" fill="{centre}" stroke="#8a5200" stroke-width="1.6"/>'
    return out


def plum_bud(face, x, y, r, deg):
    fill = face.rad([(0, "#f98a8c"), (0.6, "#d0324a"), (1, "#7d0f26")], 0.4, 0.35, 0.7)
    bud = f'<ellipse cx="{f(r * .9)}" cy="0" rx="{f(r)}" ry="{f(r * .8)}" fill="{fill}" stroke="#6a0c1e" stroke-width="2.4"/>'
    sepal = face.lin([(0, "#5a2a14"), (1, "#8a4a22")])
    bud += shape(f"M0,0 Q{pt(r * .5, -r * .9)} {pt(r * .9, -r * .55)} Q{pt(r * .5, 0)} {pt(r * .9, r * .55)} Q{pt(r * .5, r * .9)} 0,0Z", sepal, "#3a1a0a", 1.8)
    return placed(bud, x, y, deg)


def branch(face, pts, w0, w1):
    bark = face.lin([(0, "#9a6a46"), (0.45, "#5d3820"), (1, "#2e1a0c")], 0, 0, 1, 1)
    out = shape(tapered(pts, w0, w1), bark, "#24130a", 2.6)
    hi = [(x - 2, y - 2) for x, y in pts[2:-4]]
    out += line("M" + " L".join(pt(*p) for p in hi[::2]), "#c79a72", max(w1 * .35, 1.5), 0.55)
    return out


def plum():
    face = Face()
    face.add(branch(face, bezier((40, 402), (60, 320), (138, 290), (146, 210)), 30, 15))
    face.add(branch(face, bezier((146, 212), (150, 160), (196, 130), (214, 84)), 15, 5))
    face.add(branch(face, bezier((118, 300), (170, 290), (226, 272), (262, 222)), 13, 4))
    face.add(branch(face, bezier((146, 220), (116, 196), (92, 164), (70, 136)), 10, 3))
    face.add(branch(face, bezier((74, 360), (110, 360), (140, 356), (168, 344)), 9, 3))
    for x, y in ((92, 330), (134, 250)):
        face.add(f'<ellipse cx="{x}" cy="{y}" rx="7" ry="4" fill="#24130a" opacity="0.6" transform="rotate(-40 {x} {y})"/>')
    face.add(plum_bud(face, 214, 84, 13, -70))
    face.add(plum_bud(face, 262, 222, 12, -50))
    face.add(plum_bud(face, 168, 344, 11, -15))
    face.add(plum_bud(face, 206, 150, 10, -10))
    face.add(plum_blossom(face, 146, 176, 68, 8))
    face.add(plum_blossom(face, 222, 268, 56, -14))
    face.add(plum_blossom(face, 80, 124, 46, 20))
    face.add(plum_blossom(face, 104, 334, 42, -8))
    return face


def orchid_bloom(face, x, y, r, tilt=0):
    petal = face.lin([(0, "#ffffff"), (0.45, "#f4e8ff"), (0.85, "#c08af0"), (1, "#8f4ad8")])
    edge = "#4a167f"
    out = ""
    for deg, length, w in ((-90, 1.0, .34), (148, .95, .32), (32, .95, .32), (-152, .78, .3), (-28, .78, .3)):
        out += placed(shape(petal_d(r * length, r * w, "point"), petal, edge, 2.4), x, y, tilt + deg)
        out += placed(line(f"M{pt(r * .1, 0)} L{pt(r * length * .8, 0)}", "#7a1450", 1.4, 0.35), x, y, tilt + deg)
    lip = face.rad([(0, "#ffffff"), (0.6, "#e6c8ff"), (1, "#a86ae8")], 0.5, 0.3, 0.7)
    lx, ly = polar(x, y, r * .34, tilt + 90)
    out += placed(shape(f"M{pt(-r * .3, -r * .1)} C{pt(-r * .42, r * .3)} {pt(-r * .1, r * .42)} 0,{f(r * .4)} "
                        f"C{pt(r * .1, r * .42)} {pt(r * .42, r * .3)} {pt(r * .3, -r * .1)} Z", lip, edge, 2.2), lx, ly - r * .12, tilt)
    for dx, dy in ((-.12, .05), (.1, .08), (0, .18), (-.06, .26), (.08, .24), (.16, .14), (-.18, .16)):
        sx, sy = lx + dx * r, ly + dy * r - r * .05
        out += f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(r * .035)}" fill="#6a1fb0"/>'
    column = face.lin([(0, "#fff7b0"), (1, "#e6b326")], 0, 0, 0, 1)
    cx, cy = polar(x, y, r * .08, tilt + 90)
    out += f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * .1)}" ry="{f(r * .14)}" fill="{column}" stroke="#8a6200" stroke-width="1.6"/>'
    return out


def orchid():
    face = Face()
    face.add(ground_shadow(face, 150, 392, 112, 10))
    blade = face.lin([(0, "#2a6a2c"), (0.5, "#5aa648"), (1, "#1c4f22")], 0, 0, 1, 0)
    for p in (((140, 324), (110, 250), (60, 214), (14, 216)),
              ((146, 324), (130, 230), (96, 160), (70, 98)),
              ((160, 324), (200, 250), (250, 220), (290, 230)),
              ((134, 324), (100, 290), (60, 280), (24, 298)),
              ((166, 324), (196, 292), (240, 286), (278, 304)),
              ((152, 324), (164, 260), (190, 200), (236, 160))):
        face.add(shape(tapered(bezier(*p), 15, 1.5), blade, LEAF_EDGE, 2.4))
        face.add(line("M" + " L".join(pt(x - 1, y - 1) for x, y in bezier(*p, n=12)[1:-3]), "#c8eaa0", 1.6, 0.5))
    stem = face.lin([(0, "#7fbf5a"), (1, "#3f7f2a")])
    for p in (((156, 322), (170, 260), (190, 200), (198, 150)), ((150, 322), (140, 260), (112, 220), (96, 196)),
              ((160, 322), (186, 290), (214, 262), (226, 250))):
        face.add(shape(tapered(bezier(*p), 6, 3.5), stem, "#2e5a20", 1.6))
    face.add(orchid_bloom(face, 232, 250, 42, 22))
    face.add(orchid_bloom(face, 92, 184, 54, -14))
    face.add(orchid_bloom(face, 196, 132, 64, 6))
    # A blue-and-white pot.
    body = face.lin([(0, "#c8b6e6"), (0.3, "#ffffff"), (0.6, "#efe8fa"), (1, "#a890d4")])
    face.add(shape("M62,324 L238,324 C236,350 226,378 206,396 L94,396 C74,378 64,350 62,324Z", body, "#3a1470", 3))
    band = face.lin([(0, "#9a5ad8"), (1, "#6a2ab0")], 0, 0, 0, 1)
    face.add(shape("M68,344 L232,344 C230,354 228,362 224,370 L76,370 C72,362 70,354 68,344Z", band, "#3a1470", 2))
    for k in range(6):
        cx = 86 + k * 26
        face.add(line(f"M{cx - 10},363 Q{cx - 5},350 {cx},357 Q{cx + 5},364 {cx + 10},351", "#ffffff", 3))
    rim = face.lin([(0, "#ffffff"), (1, "#b8a4dc")], 0, 0, 0, 1)
    face.add(f'<rect x="54" y="314" width="192" height="16" rx="6" fill="{rim}" stroke="#3a1470" stroke-width="3"/>')
    face.add(line("M84,382 Q90,352 80,374", "#ffffff", 4, 0.0))
    return face


def chrysanthemum():
    face = Face()
    stem = face.lin([(0, "#3f7f2a"), (0.5, "#7fbf5a"), (1, "#2e5a20")])
    face.add(shape(tapered(bezier((150, 240), (146, 300), (156, 350), (150, 400)), 10, 14), stem, "#1f4016", 2.2))
    face.add(leaf(face, 150, 340, 116, 198, 34, lobes=3))
    face.add(leaf(face, 152, 304, 112, -22, 32, lobes=3))
    face.add(leaf(face, 150, 380, 84, -38, 24, lobes=2))
    x, y = 150, 168
    head = ""
    rings = ((26, 122, 10, 0, ("#d86a00", "#ffb000", "#ffe14a", "#fff6b0")),
             (22, 100, 10, 7, ("#cc6000", "#ffa800", "#ffdc3e", "#fff2a0")),
             (18, 76, 9.5, 3, ("#a84a06", "#e88314", "#ffc634", "#ffd96a")),
             (14, 52, 9, 11, ("#9a4204", "#df7810", "#fbbb2c", "#ffd25a")),
             (10, 30, 8, 5, ("#8a3a02", "#d06a0c", "#f2aa24", "#ffc94a")))
    for count, length, w, offset, cols in rings:
        fill = face.lin([(0, cols[0]), (0.35, cols[1]), (0.8, cols[2]), (1, cols[3])])
        for k in range(count):
            deg = offset + 360 * k / count
            p = shape(petal_d(length, w, "round"), fill, "#7a3a02", 1.8)
            p += line(f"M{pt(length * .25, 0)} L{pt(length * .8, 0)}", "#fff2b0", 1.4, 0.5)
            head += placed(p, x, y, deg)
    centre = face.rad([(0, "#ffe27a"), (0.6, "#e08a12"), (1, "#a85006")])
    head += f'<circle cx="{x}" cy="{y}" r="15" fill="{centre}" stroke="#7a3a02" stroke-width="2"/>'
    face.add(f'<g transform="translate({x} {y}) scale(1 0.94) translate(-{x} -{y})">{head}</g>')
    return face


def culm(face, x, y, height, w, deg, segments):
    body = face.lin([(0, "#1f5a22"), (0.22, "#4f9a3a"), (0.42, "#a8dc78"), (0.62, "#5aa646"), (1, "#18461c")])
    out, seg = "", height / segments
    for i in range(segments):
        top = -(i + 1) * seg
        out += f'<rect x="{f(-w / 2)}" y="{f(top + 2)}" width="{f(w)}" height="{f(seg - 4)}" rx="{f(w * .18)}" fill="{body}" stroke="#123a16" stroke-width="2.4"/>'
    node = face.lin([(0, "#2c6a2a"), (0.45, "#cdeaa0"), (1, "#204e20")])
    for i in range(1, segments):
        out += f'<rect x="{f(-w / 2 - 3)}" y="{f(-i * seg - 4)}" width="{f(w + 6)}" height="8" rx="4" fill="{node}" stroke="#123a16" stroke-width="2.2"/>'
    cut = face.rad([(0, "#2a4a18"), (0.7, "#5f8a3a"), (1, "#cfe8a0")])
    out += f'<ellipse cx="0" cy="{f(-height + 2)}" rx="{f(w / 2)}" ry="{f(w * .2)}" fill="{cut}" stroke="#123a16" stroke-width="2.2"/>'
    return placed(out, x, y, deg)


def spray(face, x, y, deg, n=3, length=86):
    out = ""
    for k in range(n):
        out += leaf(face, x, y, length - 10 * k, deg + (k - (n - 1) / 2) * 26, 13)
    return out


def bamboo_plant():
    face = Face()
    face.add(ground_shadow(face, 150, 394, 110, 9))
    face.add(culm(face, 150, 396, 200, 20, 2, 4))
    face.add(culm(face, 106, 398, 320, 32, -4, 5))
    face.add(culm(face, 196, 398, 260, 28, 5, 4))
    twig = "#2e5a20"
    for x0, y0, x1, y1 in ((96, 206, 70, 180), (112, 140, 150, 112), (206, 200, 234, 172), (212, 150, 190, 120), (98, 268, 72, 252)):
        face.add(line(f"M{x0},{y0} L{x1},{y1}", twig, 4))
    face.add(spray(face, 70, 180, 160, 3, 74))
    face.add(spray(face, 150, 112, 22, 3, 80))
    face.add(spray(face, 234, 172, 40, 3, 68))
    face.add(spray(face, 190, 120, 205, 3, 70))
    face.add(spray(face, 72, 252, 150, 2, 62))
    face.add(spray(face, 96, 80, -60, 2, 58))
    return face


# --- Seasons ---------------------------------------------------------------

def butterfly(face, x, y, s, deg):
    wing = face.rad([(0, "#fff3a0"), (0.5, "#ffc93a"), (0.85, "#f08a18"), (1, "#c45a0a")], 0.3, 0.7, 0.9)
    low = face.rad([(0, "#fff3a0"), (0.6, "#ffb02e"), (1, "#c45a0a")], 0.3, 0.2, 0.9)
    edge = "#3a1c08"
    out = ""
    for side in (-1, 1):
        up = f"M0,-4 C{pt(side * 20, -60)} {pt(side * 80, -66)} {pt(side * 82, -30)} C{pt(side * 84, -6)} {pt(side * 40, 4)} 0,2Z"
        lo = f"M0,4 C{pt(side * 46, 6)} {pt(side * 64, 34)} {pt(side * 48, 54)} C{pt(side * 32, 70)} {pt(side * 6, 44)} 0,8Z"
        out += shape(lo, low, edge, 2.6) + shape(up, wing, edge, 2.6)
        out += line(f"M{pt(side * 62, -58)} C{pt(side * 84, -48)} {pt(side * 86, -20)} {pt(side * 70, -8)}", edge, 6, 0.85)
        for cx, cy, r in ((70, -44, 4), (78, -26, 3.5), (52, 50, 3.5)):
            out += f'<circle cx="{f(side * cx)}" cy="{cy}" r="{r}" fill="#ffffff" stroke="{edge}" stroke-width="1"/>'
        out += f'<circle cx="{f(side * 38)}" cy="-26" r="9" fill="#f08a18" stroke="{edge}" stroke-width="1.8"/>'
        out += line(f"M0,-14 Q{pt(side * 10, -40)} {pt(side * 22, -48)}", edge, 2)
        out += f'<circle cx="{f(side * 22)}" cy="-48" r="3" fill="{edge}"/>'
    body = face.lin([(0, "#6a4022"), (0.5, "#2a160a"), (1, "#120802")])
    out += f'<ellipse cx="0" cy="6" rx="5.5" ry="30" fill="{body}"/>'
    out += '<circle cx="0" cy="-20" r="7" fill="#2a160a"/>'
    return placed(out, x, y, deg, s, s)


def daisy(face, x, y, r):
    petal = face.lin([(0, "#f4d7e6"), (1, "#ffffff")])
    out = ""
    for k in range(10):
        out += placed(shape(petal_d(r, r * .24, "round"), petal, "#b88aa8", 1.4), x, y, k * 36)
    centre = face.rad([(0, "#fff3a0"), (1, "#e8a414")])
    return out + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * .3)}" fill="{centre}" stroke="#9a6a00" stroke-width="1.4"/>'


def spring():
    face = Face()
    soil = face.rad([(0, "#9a6a42"), (0.7, "#6b4224"), (1, "#4a2a14")], 0.5, 0.3, 0.7)
    face.add(shape("M14,402 C40,344 260,344 286,402Z", soil, "#2e1a0c", 3))
    grass = face.lin([(0, "#2f7a26"), (1, "#8fcf5a")], 0, 1, 0, 0)
    for x, h, lean in ((40, 40, -10), (60, 30, 8), (236, 36, 10), (258, 44, -6), (110, 24, -8), (192, 26, 6)):
        face.add(shape(f"M{x - 5},{390} Q{x + lean / 2},{390 - h / 2} {x + lean},{390 - h} Q{x + lean / 2 + 4},{390 - h / 2} {x + 5},{390}Z", grass, "#1d4a18", 1.6))
    stem = face.lin([(0, "#3f8a2a"), (0.5, "#9fd36b"), (1, "#2e6a20")])
    face.add(shape(tapered(bezier((150, 368), (152, 320), (144, 290), (150, 244)), 12, 8), stem, "#1d4a18", 2.2))
    fresh = [(0, "#d8f59a"), (0.5, "#7cc44a"), (1, "#2f7a26")]
    face.add(leaf(face, 148, 266, 112, 196, 42, stops=fresh))
    face.add(leaf(face, 152, 250, 118, -24, 44, stops=fresh))
    face.add(leaf(face, 150, 246, 56, -98, 17, stops=fresh))
    face.add(daisy(face, 72, 364, 17))
    face.add(daisy(face, 228, 366, 15))
    face.add(butterfly(face, 168, 128, 0.95, 14))
    return face


def summer():
    face = Face()
    x, y = 150, 200
    for k in range(16):
        deg = -90 + k * 22.5
        long = k % 2 == 0
        L, w = (150, 22) if long else (124, 18)
        fill = face.lin([(0, "#e8400c"), (0.5, "#ff7a14"), (1, "#ffb21e")] if long else [(0, "#d42a10"), (1, "#ff5a1a")])
        ray = f"M60,{f(-w)} Q{f(L * .75)},{f(-w * .5)} {f(L)},0 Q{f(L * .75)},{f(w * .5)} 60,{f(w)}Z"
        face.add(placed(shape(ray, fill, "#9a3a06", 2.4), x, y, deg))
    disc = face.rad([(0, "#fff4c0"), (0.35, "#ffc21e"), (0.75, "#ff8a12"), (1, "#f0500c")], 0.42, 0.4, 0.62)
    face.add(f'<circle cx="{x}" cy="{y}" r="84" fill="{disc}" stroke="#9a3a06" stroke-width="4"/>')
    face.add(line(f"M{x - 58},{y - 24} A64 64 0 0 1 {x - 8},{y - 66}", "#ffffff", 8, 0.6))
    return face


def maple(face, x, y, size, deg, stops, edge, vein):
    lobes = [(162, .62), (-142, .9), (-90, 1.0), (-38, .9), (18, .62)]
    pts = [polar(0, 0, size * .18, 118)]
    for i, (a, r) in enumerate(lobes):
        r *= size
        pts += [polar(0, 0, r * .5, a - 22), polar(0, 0, r * .66, a - 17), polar(0, 0, r * .6, a - 13),
                polar(0, 0, r * .8, a - 10), polar(0, 0, r * .74, a - 6), polar(0, 0, r, a),
                polar(0, 0, r * .74, a + 6), polar(0, 0, r * .8, a + 10), polar(0, 0, r * .6, a + 13),
                polar(0, 0, r * .66, a + 17), polar(0, 0, r * .5, a + 22)]
        if i < len(lobes) - 1:
            pts.append(polar(0, 0, r * .3, a + 26))
    pts.append(polar(0, 0, size * .18, 62))
    fill = face.rad(stops, 0.5, 0.62, 0.62)
    out = line(f"M0,{f(size * .1)} C4,{f(size * .45)} {f(size * .1)},{f(size * .7)} {f(size * .24)},{f(size * .95)}", edge, 7)
    out += line(f"M0,{f(size * .1)} C4,{f(size * .45)} {f(size * .1)},{f(size * .7)} {f(size * .24)},{f(size * .95)}", "#a8521a", 3.5)
    out += shape("M" + " L".join(pt(*p) for p in pts) + "Z", fill, edge, 3)
    for a, r in lobes:
        out += line(f"M0,{f(size * .06)} L{pt(*polar(0, 0, r * size * .82, a))}", vein, 2.6, 0.75)
        for t in (.35, .6):
            bx, by = polar(0, 0, r * size * t, a)
            out += line(f"M{pt(bx, by)} L{pt(*polar(bx, by, r * size * .18, a - 30))}", vein, 1.4, 0.55)
            out += line(f"M{pt(bx, by)} L{pt(*polar(bx, by, r * size * .18, a + 30))}", vein, 1.4, 0.55)
    return placed(out, x, y, deg)


def autumn():
    face = Face()
    face.add(maple(face, 224, 112, 82, 28, [(0, "#fff0a0"), (0.5, "#f6c43a"), (1, "#d88a12")], "#7a4a06", "#a86a0a"))
    face.add(maple(face, 70, 330, 60, -32, [(0, "#d84a2a"), (0.5, "#a81e12"), (1, "#6a0e08")], "#3a0604", "#ff9a6a"))
    face.add(maple(face, 146, 210, 150, -6, [(0, "#fff4a8"), (0.35, "#ffc832"), (0.75, "#ff8a1a"), (1, "#e8561a")], "#5a1a06", "#b0400a"))
    return face


def winter():
    face = Face()
    x, y = 150, 200
    ice = face.lin([(0, "#ffffff"), (0.55, "#eef8ff"), (1, "#a8d4ff")], 0, 0, 0, 1)
    edge = "#0a2a78"

    def rod(length, w):
        return shape(f"M0,0 L{f(w * .6)},{f(-w / 2)} L{f(length - w * .6)},{f(-w / 2)} L{f(length)},0 "
                     f"L{f(length - w * .6)},{f(w / 2)} L{f(w * .6)},{f(w / 2)}Z", ice, edge, 2.4) \
            + line(f"M{f(w * .6)},0 L{f(length - w * .6)},0", "#ffffff", 1.6, 0.8)

    for k in range(6):
        a = -90 + 60 * k
        arm = rod(132, 22)
        for at, length in ((50, 46), (88, 34), (114, 18)):
            arm += placed(rod(length, 14), at, 0, -50) + placed(rod(length, 14), at, 0, 50)
        tip = ('<polygon points="132,0 144,-9 156,0 144,9" fill="' + ice + f'" stroke="{edge}" stroke-width="2.4" stroke-linejoin="round"/>')
        face.add(placed(arm + tip, x, y, a))
    hexa = face.rad([(0, "#ffffff"), (0.6, "#e6f4ff"), (1, "#9cccff")])
    face.add(f'<polygon points="{" ".join(pt(*polar(x, y, 30, 30 + 60 * k)) for k in range(6))}" fill="{hexa}" stroke="{edge}" stroke-width="3"/>')
    face.add(f'<polygon points="{" ".join(pt(*polar(x, y, 14, 60 * k)) for k in range(6))}" fill="none" stroke="{edge}" stroke-width="1.8" stroke-opacity="0.6"/>')
    for sx, sy, r in ((40, 60, 7), (262, 56, 6), (256, 352, 8), (40, 350, 6), (214, 384, 5), (92, 386, 5)):
        face.add(f'<circle cx="{sx}" cy="{sy}" r="{r}" fill="#ffffff" stroke="{edge}" stroke-width="1.6"/>')
    return face


# Each face has a colour of its own, light at the centre to strong at the edge,
# so a player knows it by its colour before reading the picture.
tiles = {
    "f1": ("Plum", plum, ("#ffeef5", "#ffa6c9", "#e0457f")),
    "f2": ("Orchid", orchid, ("#f6eeff", "#c49af5", "#7a3fd0")),
    "f3": ("Chrysanthemum", chrysanthemum, ("#fff2e0", "#ffad5a", "#ec6a0c")),
    "f4": ("Bamboo", bamboo_plant, ("#e4fbf6", "#7ddccd", "#0f9a8c")),
    "s1": ("Spring", spring, ("#f2fde0", "#aee67e", "#3a9e2c")),
    "s2": ("Summer", summer, ("#fffbe2", "#ffe45e", "#f2b200")),
    "s3": ("Autumn", autumn, ("#ffeee6", "#ff9580", "#d42a2a")),
    "s4": ("Winter", winter, ("#eaf5ff", "#86c2ff", "#2a64dc")),
}
for key, (name, draw, theme) in tiles.items():
    with open(f"{OUT}/{key}.svg", "w", encoding="utf-8") as out:
        out.write(draw().svg(name, theme))
print("wrote", len(tiles))
