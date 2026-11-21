# Tile face licence: Classic Chinese

All 42 faces in this directory (suits, winds, dragons, flowers and seasons)
are cut from **SVG Oblique illustrations of Mahjong tiles** by Wikimedia
Commons user **Cangjie6**, a traditional Chinese set drawn in one hand:

- Source: <https://commons.wikimedia.org/wiki/Category:SVG_Oblique_illustrations_of_Mahjong_tiles>
  (author: <https://commons.wikimedia.org/wiki/User:Cangjie6>; the Commons
  page of `MJt1-.svg` also credits it as a remake of Jerry Crimson Mann's
  original, vectorised by Dewclouds), taken from the copies
  in <https://github.com/vitaly4uk/mahjong> (`static/game/tiles/`), which only
  strip the Adobe Illustrator metadata.
- Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  These files, as derivatives, stay under CC BY-SA 4.0; each one names its
  Commons source and licence in a comment.
- Vendored: 2026-11-21.
- Modifications: the drawn tile body (edge, sides, face and highlights) is
  removed, since the 3D table models its own, and the view box is cropped to
  the tile's front face, widened to 3:4 like the other face sets; unused
  styles, gradients and filters are dropped. The artwork and its colours are
  unchanged.

## File mapping

| Commons | Vendored | Tile |
| --- | --- | --- |
| `MJw1-.svg` … `MJw9-.svg` | `c1.svg` … `c9.svg` | characters 1–9 (萬) |
| `MJt1-.svg` … `MJt9-.svg` | `o1.svg` … `o9.svg` | circles 1–9 (筒) |
| `MJs1-.svg` … `MJs9-.svg` | `b1.svg` … `b9.svg` | bamboo 1–9 (索) |
| `MJf1-.svg` … `MJf4-.svg` | `wE`, `wS`, `wW`, `wN` | winds 東 南 西 北 |
| `MJd1-.svg`, `MJd2-.svg`, `MJd3-.svg` | `dR`, `dG`, `dW` | dragons 中 發 白 |
| `MJh5-.svg` … `MJh8-.svg` | `f1.svg` … `f4.svg` | flowers 梅 plum, 蘭 orchid, 菊 chrysanthemum, 竹 bamboo |
| `MJh1-.svg` … `MJh4-.svg` | `s1.svg` … `s4.svg` | seasons 春 spring, 夏 summer, 秋 autumn, 冬 winter |

Rerun the cut with the source files in a folder (it also writes the
recoloured flowers and seasons of the two riichi sets):

```sh
python3 scripts/art/cangjie-faces.py SOURCE_DIR app/assets/faces
```
