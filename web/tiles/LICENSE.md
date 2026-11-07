# Tile art

The 43 SVGs in this directory are original artwork drawn for this project.
No tile art is vendored from an external set any more; the earlier
CC BY-SA 4.0 illustrations from Cangjie6's Chinese mahjong set were replaced
in the 2026-11-07 art pass.

## Canvas

Every file is a flat 2D sprite on a `0 0 300 400` viewBox (`width="300"`,
`height="400"`), so the face keeps the 3:4 aspect the table expects. The
tile body, bevel and rim are drawn inside the SVG: a warm ivory face with a
vertical gradient, a light top-left / shaded bottom-right bevel, a dark rim
and a soft inner shadow. `back.svg` uses the same body with a lacquered green
lattice panel.

## Palette

Faces use four inks on ivory: red `#ad3126`, green `#146a41`, blue `#26457f`
and a near-black `#24282c` for eyes and centres. The tile body uses the ivory
gradient `#fffdf4` → `#e8d7b3` with the bevel `#fbf3dd` → `#b09769` and a
`#55411f` rim. The back panel runs `#1e7149` → `#0a3a28`.

## Symbols

Characters and winds use a local serif CJK stack (`Songti SC`, `Noto Serif
CJK SC`, `STSong`); no font is downloaded. Bamboo, circles, flowers and
seasons are geometry only. `web/tiles.js` maps each canonical key to a file
name; the mapping is unchanged by the redraw.
