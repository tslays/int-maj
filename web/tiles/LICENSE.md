# Tile art licence

The 34 play-tile faces and the tile back in this directory are vendored from
**riichi-mahjong-tiles** by FluffyStuff:

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
| `Back.svg` | `back.svg` | opponent tile back |

`Front.svg`, `Blank.svg` and the red-five dora tiles are not used: the table
supplies the tile body in CSS, and this variant has no dora tiles.

## Bonus marks

The upstream set has no flowers or seasons. `f1.svg`–`f4.svg` (plum, orchid,
chrysanthemum, bamboo) and `s1.svg`–`s4.svg` (spring, summer, autumn, winter)
were drawn for this project on the same `0 0 300 400` canvas and in the same
visual language: transparent face art, flat fills, white outlines and no tile
body.
