# Tile face licence

The 34 play-tile faces in this directory are vendored from
**riichi-mahjong-tiles** by FluffyStuff. They are the faces of the 3D table
table (`app/src/tiles.js`), which models the tile body itself and prints each
face, with a corner index, onto it. The app icon (`app/assets/icons/`) is drawn from
`dR.svg` too:

- Source: <https://github.com/FluffyStuff/riichi-mahjong-tiles>
- Licence: [CC0 1.0 Universal (public domain dedication)](https://creativecommons.org/publicdomain/zero/1.0/), as stated in the project README.
- Vendored: 2026-11-01, from the `master` branch, directory `Regular/`.
- Modifications: renamed to the canonical keys below; XML comments, Inkscape
  metadata, the editor named view and unused path-effect/marker definitions
  were removed. Geometry, colours and the `0 0 300 400` view box are unchanged.

## File mapping

| Upstream `Regular/` | Vendored | Canonical key |
| --- | --- | --- |
| `Sou1.svg` … `Sou9.svg` | `b1.svg` … `b9.svg` | bamboo 1–9 |
| `Pin1.svg` … `Pin9.svg` | `o1.svg` … `o9.svg` | circles 1–9 |
| `Man1.svg` … `Man9.svg` | `c1.svg` … `c9.svg` | characters 1–9 |
| `Ton.svg` | `wE.svg` | east wind |
| `Nan.svg` | `wS.svg` | south wind |
| `Shaa.svg` | `wW.svg` | west wind |
| `Pei.svg` | `wN.svg` | north wind |
| `Chun.svg` | `dR.svg` | red dragon (中) |
| `Hatsu.svg` | `dG.svg` | green dragon (發) |
| `Haku.svg` | `dW.svg` | white dragon (白 — the set draws it blank) |

`Front.svg`, `Back.svg`, `Blank.svg` and the red-five dora tiles are not
used: the 3D table models the body and back, and this variant has no dora
tiles. `Haku.svg` is blank; the prototype draws the white dragon's frame.

## Flowers and seasons

The upstream set has no flowers or seasons. `f1.svg`-`f4.svg` and
`s1.svg`-`s4.svg` are the traditional bonus tiles of a standard set, cut from
**SVG Oblique illustrations of Mahjong tiles** by Wikimedia Commons user
**Cangjie6**:

- Source: <https://commons.wikimedia.org/wiki/Category:SVG_Oblique_illustrations_of_Mahjong_tiles>
  (author: <https://commons.wikimedia.org/wiki/User:Cangjie6>), taken from the
  copies in <https://github.com/vitaly4uk/mahjong> (`static/game/tiles/`),
  which only strip the Adobe Illustrator metadata.
- Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  These eight files, as derivatives, stay under CC BY-SA 4.0; each one names
  its source and licence in a comment.
- Vendored: 2026-11-13.
- Modifications: the drawn tile body is removed (the 3D table models its own)
  and the view box is cropped to the tile's front face, widened to 3:4 like
  the other faces; unused styles, gradients and filters are dropped. The
  artwork itself is unchanged.

| Commons | Vendored | Tile |
| --- | --- | --- |
| `MJh5-.svg` … `MJh8-.svg` | `f1.svg` … `f4.svg` | flowers 梅 plum, 蘭 orchid, 菊 chrysanthemum, 竹 bamboo |
| `MJh1-.svg` … `MJh4-.svg` | `s1.svg` … `s4.svg` | seasons 春 spring, 夏 summer, 秋 autumn, 冬 winter |

Each face prints its own number and character, so the table adds no corner
index to them. Rerun the cut with the source files in a folder:

```sh
python3 scripts/art/bonus-faces.py SOURCE_DIR app/assets/faces
```
