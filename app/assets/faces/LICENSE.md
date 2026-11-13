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

The upstream set has no flowers or seasons. `f1.svg`-`f4.svg` (plum, orchid,
chrysanthemum, bamboo) and `s1.svg`-`s4.svg` (spring, summer, autumn, winter)
are original faces drawn for this project by `scripts/art/bonus-faces.py`:
small shaded paintings a player recognises without reading Chinese - a plum
branch, a potted orchid, a chrysanthemum and a bamboo grove; a seedling with a
butterfly, the sun over the sea, maple leaves and a snowflake. They use
gradients only (no SVG filters), so they paint the same onto the table's
canvas in every browser. The table prints the number in the top-left corner,
red for flowers and green for seasons, the colouring *The Game of Mah Jong
Illustrated* calls usual (p. 9).

Rerun the script to change the faces:

```sh
python3 scripts/art/bonus-faces.py app/assets/faces
```
