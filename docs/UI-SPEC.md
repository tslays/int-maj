# UI spec — the quiet table

Written before any styling change, so the visual work is judged against words
rather than against screenshots of three different games. When this file and a
reference image disagree, this file wins; when this file is silent, keep the
simplest thing that works.

## Principles

1. **Subtract first.** A full-featured client shows something for every feature
   it has. We show only what the current decision needs. If an element does not
   change what the player does next, it is not on the board.
2. **One decision per screen.** The board has at most one place to click. Turn,
   claim and win never compete for attention.
3. **Quiet by default, loud only when it matters.** Resting state is near
   monochrome; colour is reserved for a claim, a win, and a warning.
4. **No second language.** No avatars, emotes, timers, gacha, riichi furniture,
   emotive copy, or decorative dividers. One typeface, one accent.
5. **Numbers are derived, never guessed.** Every size comes from the tile unit
   or the spacing scale in `web/app.css`; no hand-tuned pixel magic.

## Regions

One board, five regions, in this reading order:

| Region | Contents | Never |
|---|---|---|
| Hand (bottom) | Your concealed tiles, drawn tile offset, declared melds at the left end | Other players' tiles, score text |
| River (centre) | Four discard rows meeting in the middle, newest last | Colour per seat, tile shadows beyond one step |
| Centre | Round wind, wall count, the current seat's name | Scores, timers, chat |
| Seats (edges) | Each opponent: name, wind, meld count, tile count | Their concealed tiles, avatars, emotes |
| Controls (one row) | Only the actions legal right now, in one row | Disabled buttons for illegal actions |

The scoreboard, when present, is one line per seat in the centre; never a panel.

## Geometry

- Tile width = board width × `--hand-row-frac`, height = width × `--hand-aspect`.
  Everything else is a ratio of that unit, as today's tokens do.
- Gaps between groups are 0.25 tile; between melds 0.4 tile; the drawn tile sits
  0.4 tile clear of the hand.
- Rivers are six tiles wide and stop one tile short of the centre mark.
- Minimum legibility: a tile face must be at least 26 px wide at 1280×800.
- The layout proof (`npm run test:layout`) is the referee: no overlapping
  rectangles, no element outside its region.

## Per-state content

| State | Board shows | Controls show |
|---|---|---|
| turn | Hand, four rivers, centre with wall count, seats with counts | Discard (and nothing else) |
| claim | The claiming tile lifted in the river, the shape it would complete shown in the hand | Claim, and Pass — no other buttons |
| wait | Hand with the wait highlighted in place; declared melds dimmed | Nothing; a single line naming the wait |
| fishing | The announced wait marked once, in the hand and in the rail | Nothing new; fishing is a state, not a mode |
| win | The winning tile marked, the hand sorted into groups, the arithmetic line (ground × 2^doubles → paid) | Next hand |
| drawn | The reason in one line, no payments | Next hand |
| result | The score line per seat and the before/after difference | Next hand |

## Type and colour

- Two sizes only: body and one heading. Tile faces carry the information.
- Resting board: felt or paper at low saturation, tiles ivory, ink near-black,
  one accent for the active element.
- Colour is used for exactly three things: a pending claim, a win, and a
  warning. Everything else is greyscale on felt.

## Motion

Only where it explains a change: the discard travels from hand to river, a
claim lifts, the win settles. 140–220 ms, ease-out, and nothing at all under
`prefers-reduced-motion`. No idle animation, no breathing, no glow.

## The three variants to judge

The same mid-game `?state=turn` board, differing only in these knobs. Nothing
else changes between them.

| Knob | A — Felt | B — Paper | C — Mat |
|---|---|---|---|
| Surface | Existing felt texture, vignette | Flat off-white, tiles outlined | Flat dark mat, no texture, no vignette |
| Seats | Wind + name + meld/tile count | Wind + tile count only | Wind only |
| Table extras | Centre box with wall count and round wind | Wall count as a single number at the top edge | Wall count in the centre seat label |
| Chrome | Existing thin rails | None; rivers float | One hairline frame |

Verdict is per row: keep A, B or C for each knob, and the spec above absorbs
the answers.

## Acceptance for the spike

- Three variants render the same board at 1440×900 and 1280×800 with no console
  error and no overlap under the layout proof.
- The variant switch is a query parameter (`?variant=a|b|c`), defaulting to the
  current look, and costs one CSS block plus one class.
- No engine or test change.

## Geometry is computed, not eyeballed

No position, gap or size may be guessed from a picture. Each one derives from
one number - the board box - through the spacing scale:

    tile_w   = round(board_w * hand_row_fraction)      // one unit for the table
    tile_h   = round(tile_w * tile_aspect)
    gap      = round(tile_w * 0.25)                     // the only gap scale
    inset    = gap                                      // every region is inset by the same gap
    rack     = tile_w * 0.73 x tile_h * 0.96            // a face-down tile
    centre_w = board_w - 2 * (river_w + inset)
    centre_h = board_h - 2 * (river_h + inset) - hand_band_h

The river is sized from its own region, never from the hand or board tile:

    river_grid = 6 columns x 4 rows desktop
                 5 x 5 phone landscape
                 4 x 6 phone portrait
    river_region = space between the hand band/controls, the centre and the seat bands
    river_tile = min(board_tile,
                     region_w / columns,
                     region_h / rows,
                     aspect_correct_bound)
    river_tile_h = river_tile * 4 / 3

`aspect_correct_bound` is `region_h * 3 / (4 * rows)` for a flat river and
`region_w * 3 / (4 * columns)` for a rotated side river, so the 3:4 face fits
both axes. Each river reserves `columns * rows` slots (24 on desktop, 25 on a
landscape phone, 24 on a portrait phone) and every discard must sit inside its
region.

Every region is then a rectangle computed from those values, in this order:
hand band, centre, four rivers, four seat bands, controls. A seat badge is
placed at `rack_edge +/- gap` and centred on the rack's midpoint - the same
formula for all four seats, which is what makes them consistent.

The implementation must expose the computed rects (a `layout` object on the
view) so a test can assert, at any viewport:

- no two region rects intersect;
- each badge's gap to its rack equals `gap` and its centre offset is 0;
- `tile_w >= 26` on desktop and `>= 18` on a phone;
- no discard intersects the hand band, the centre or a seat band at full
  river capacity;
- `river_tile <= region_w / columns` and `<= region_h / rows`, with a 3:4
  face (`+/- 0.02`), and the first discard of every seat sits inside its own
  river region;
- nothing is placed outside the board box;
- the reserved control row holds one block at a time and nothing grows out of
  it: your throw is flush with its right edge, the calls the table offers you
  start at its left edge, and both sit inside its height (`+/- 1 px`).

### The action row

The row directly above the hand is the only place a control may appear:

    controls  = full board width x control_h, sitting on top of the hand band
    throw     = last child of the row, flush right (margin-left: auto)
    calls     = the same row, filled from the left edge
    claim     = the same row, so a claim cannot open a second overlay

`control_h` is the reserved height, so a control's box must equal it rather
than the hand-rolled button height - a 37 px button in a 34 px row leaks 1.5 px
into the hand band. On a phone a chow offer plus its variants is wider than the
screen: the row keeps its height and scrolls sideways instead of painting over
the felt, so the primary `Claim` and `Dismiss` stay visible without scrolling.

### Bare felt (2026-11-05)

The board carries no labels for now. Removed: the wind letters and their tile
counts at all four seats (including the `E 14` marker beside the hand), the
round/hand meta and the wall dial in the middle, the centre score corners, and
the thin rectangle that framed the play area. What is left is the felt, your
hand, and the action row above it - the rivers and the face-down racks stay
because they are the game state, not chrome. The audit fails if any of those
markers comes back or if `.playfield` regains a border.

### The hand is never hidden

The hand is the one thing that must always be on screen. There is no
collapse control, no arrow, nothing that hides, shrinks away or scrolls the
hand band at any viewport - if something has to give, it gives elsewhere. The
geometry audit fails if a `.hand-toggle` element exists, if `hand-collapsed` is
set, or if the hand band measures zero.

Screenshots judge taste only. If taste and the computed rects disagree, the
rects win until the formula changes.

## Responsive targets

| Target | Size | Board rule |
|---|---|---|
| Desktop | 1440x900, 1280x800, 1024x768 | As above; hand band 12% of height |
| Tablet | 1024x768, 834x1112 | Same formulas; hand band 14% |
| Phone landscape | 844x390, 932x430 | Board fills the height; 5x5 river grid; 14 touching hand tiles across the width, controls above the hand |
| Phone portrait | 390x844, 430x932 | Rotate the table; 4x6 river grid; 14 touching hand tiles across the width, controls full width above the hand |

Portrait is a real target, not a fallback: the same formulas must hold with
`river_columns` as a breakpoint variable instead of a constant.

## Phone: hand fills the width, board keeps its own scale

Owner rule (2026-11-04): on a phone the hand row shows all 14 tiles at once,
none clipped, with **no gap between tiles**. Hand tile width is
`floor(screenWidth / 14)`; the drawn tile is marked by a lift or outline, never
by a gap, and stays in its ordered position at the right end. No horizontal
scrolling in the hand.

The board keeps an independent scale so it still fits the viewport with no
overlaps: rivers, walls and centre are sized by board scale, the hand by screen
width. Measured: 27 px per hand tile at 390 wide, 60 px at 844.

Tests assert `handScrollWidth == clientWidth`, 14 hand tiles, zero gap between
adjacent tiles, and tile width == floor(width / 14) at 390x844 and 844x390.
