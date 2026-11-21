# Tile face licence: Riichi Dark

## Suits, winds and dragons

The 34 play-tile faces in this directory are the dark variant of
**riichi-mahjong-tiles** by FluffyStuff: light ink drawn for a dark tile face.
The 3D table (`app/src/tiles.js`) models the tile body and prints each face,
with a corner index, onto a dark front.

- Source: <https://github.com/FluffyStuff/riichi-mahjong-tiles>
- Licence: [CC0 1.0 Universal (public domain dedication)](https://creativecommons.org/publicdomain/zero/1.0/), as stated in the project README and LICENSE.md.
- Vendored: 2026-11-21, from the `master` branch, directory `Black/`.
- Modifications: renamed to the canonical keys; XML comments, Inkscape and
  Sodipodi elements and attributes, the RDF metadata and their namespaces
  were removed. Geometry, colours and the `0 0 300 400` view box are unchanged.
  `Haku.svg` is blank; the table draws the white dragon's frame.

The file mapping is the same as in `../riichi/LICENSE.md` (`Sou` bamboo `b`,
`Pin` circles `o`, `Man` characters `c`, `Ton Nan Shaa Pei` winds `wE wS wW wN`,
`Chun Hatsu Haku` dragons `dR dG dW`). Rerun with the upstream folder:

```sh
python3 scripts/art/fluffy-faces.py UPSTREAM/Black app/assets/faces/riichi-dark
```

## Flowers and seasons

The upstream set has no flowers or seasons. `f1.svg`-`f4.svg` and
`s1.svg`-`s4.svg` are cut from **SVG Oblique illustrations of Mahjong tiles**
by Wikimedia Commons user **Cangjie6**, exactly as described in
`../chinese/LICENSE.md` (same source files, same Commons names `MJh5-`-`MJh8-`
for the flowers and `MJh1-`-`MJh4-` for the seasons).

- Licence: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  These eight files, as derivatives, stay under CC BY-SA 4.0; each one names
  its source and licence in a comment.
- Modifications: the drawn tile body is removed and the view box cropped to
  the face, and the inks are recoloured to the light palette of the dark set
  (blue to white, red to `#ff3737`, green to gold `#f0a023`, orange to
  `#ff5c00`, uncoloured strokes to white) so they read on a dark front. The
  drawing itself is unchanged.

```sh
python3 scripts/art/cangjie-faces.py SOURCE_DIR app/assets/faces
```
