# Tile art licence

The 34 play tiles and the eight bonus marks are vendored from **Cangjie6's
Chinese mahjong tile set** on Wikimedia Commons; `back.svg` is a derived work
in the same style and under the same licence (see below):

- Author: [Cangjie6](https://commons.wikimedia.org/wiki/User:Cangjie6)
- Source: <https://commons.wikimedia.org/wiki/Category:SVG_Oblique_illustrations_of_Mahjong_tiles>
- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
  (CC BY-SA 4.0), as stated on each file page.
- Vendored: 2026-11-01.

**Share-alike:** these files are licensed under CC BY-SA 4.0. The vendored
copies remain under that licence; redistributing them (or modified versions)
requires the same licence and the attribution below. This notice satisfies
the attribution requirement.

## The back

`back.svg` is not vendored: it is drawn here, on the same 300x400 canvas, with
the set's own palette and its oblique body, so a wall reads as tiles at 30 px.
It carries the same CC BY-SA 4.0 licence and attribution as the faces it sits
beside; changing it keeps the rest of the set under that licence.

## File mapping

Each upstream file was downloaded from
`https://commons.wikimedia.org/wiki/Special:FilePath/<upstream name>`.

| Upstream file | Vendored | Canonical key |
| --- | --- | --- |
| `MJs1-.svg` | `b1.svg` | bamboo 1 — the sparrow (麻雀), the design the owner chose from the set's several 1-bamboo variants |
| `MJs2-.svg` … `MJs9-.svg` | `b2.svg` … `b9.svg` | bamboo 2–9 |
| `MJt1-.svg` … `MJt9-.svg` | `o1.svg` … `o9.svg` | circles 1–9 |
| `MJw1-.svg` … `MJw9-.svg` | `c1.svg` … `c9.svg` | characters 1–9 (一萬 … 九萬) |
| `MJf1-.svg` | `wE.svg` | east wind (東) |
| `MJf2-.svg` | `wS.svg` | south wind (南) |
| `MJf3-.svg` | `wW.svg` | west wind (西) |
| `MJf4-.svg` | `wN.svg` | north wind (北) |
| `MJd1-.svg` | `dR.svg` | red dragon (中) |
| `MJd2-.svg` | `dG.svg` | green dragon (發) |
| `MJd3-.svg` | `dW.svg` | white dragon (blank framed tile) |
| `MJh5-.svg` | `f1.svg` | plum flower (梅) |
| `MJh6-.svg` | `f2.svg` | orchid flower (蘭) |
| `MJh7-.svg` | `f3.svg` | chrysanthemum flower (菊) |
| `MJh8-.svg` | `f4.svg` | bamboo flower (竹) |
| `MJh1-.svg` | `s1.svg` | spring (春) |
| `MJh2-.svg` | `s2.svg` | summer (夏) |
| `MJh3-.svg` | `s3.svg` | autumn (秋) |
| `MJh4-.svg` | `s4.svg` | winter (冬) |
| `MJback.svg` | `back.svg` | opponent tile back |

## Modifications

Geometry, colours and drawing are unchanged. To put every tile on the same
3:4 canvas the table expects:

- renamed to the canonical keys above;
- added `width="300"` and `height="400"`, and replaced the source `viewBox`
  with `0 0 300 400`;
- wrapped the original artwork in a single `<g transform="…">` that scales
  the source canvas uniformly and centres it in the 3:4 canvas. The tile art
  itself is untouched.

The back's source canvas is 75 × 95; it is scaled and centred the same way.
Its face was also recoloured from white to green (and the stripe from dark
green to a lighter green) so that face-down tiles read as backs beside the
green-bordered faces; the drawing itself is unchanged.
