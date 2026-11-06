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
    claim     = the row's other end: mirrors the throw, same footprint, never a
                slab across the board
    claim row = [table.x, controls.y, controls.x + controls.w - table.x, control_h]

`control_h` is the reserved height, so a control's box must equal it rather
than the hand-rolled button height - a 37 px button in a 34 px row leaks 1.5 px
into the hand band. A claim fills that one row from the table's left rim to the
throw's own right edge: Dismiss at the left end, the claim in the throw's slot
at the right, each the size of a normal button (measured: the claim is never
wider than the row minus 20 px). A chow offer with several runs scrolls
sideways inside the left half rather than pushing the claim out of its slot.

### Bare felt (2026-11-05)

The board carries no labels for now. Removed: the wind letters and their tile
counts at all four seats (including the `E 14` marker beside the hand), the
round/hand meta and the wall dial in the middle, the centre score corners, and
the thin rectangle that framed the play area. What is left is the felt, your
hand, and the action row above it - the rivers and the face-down racks stay
because they are the game state, not chrome. The audit fails if any of those
markers comes back or if `.playfield` regains a border.

### Breathing room (2026-11-05)

Nothing touches the screen edge. The felt still fills the window, but every
region is solved inside a rim:

    inset = clamp(8, 24, round(min(width, height) * 0.022))

The solver lays the whole table out in `width - 2*inset x height - 2*inset` and
then shifts every region by `inset`, so the hand, the three walls, the rivers
and the action row all sit a breath away from the edge. `layout.inset` is
exported; the board box stays full-bleed because the felt is the background.

### One round heap (2026-11-05)

There are no rivers: discards go into one heap in the middle. It is a heap, not
a pattern:

    tile      = min(board_tile, sqrt(pi * r^2 * 0.55 / (40 * 2.18)))   // r = the heap's radius
    spots     = a jittered grid inside the pile's ellipse, ordered from the centre
    angle     = random +-26 degrees, trying a few turns per spot
    fit       = rotated-rectangle (SAT) test with a half-pixel gap
    seat side = top -90deg, right 0deg, bottom +90deg, left 180deg

Each throw takes the innermost free spot on its own side (widening only when
that side is full), so the heap builds from the middle and each player's tiles
stay on their side: yours south, the right-hand player's east, the left-hand
player's west, the far seat's north. A tile may lie at any angle; no two discs
ever overlap, and the audit proves it with a rotated-rectangle test.

A tile never moves once it has landed: each throw takes the innermost free spot
from the spots still open, and the heap is left exactly as it was. If a window
is too short to hold the whole hand at the solver's size, the heap is rebuilt
once, smaller, rather than let two tiles touch or drop a throw.

Your own throw animates too: it leaves the hand, flies to its spot and clacks.

### The discard rhythm (2026-11-05)
### The discard rhythm (2026-11-05)
### The hand's reading order (2026-11-06)

The tile you just drew is the rightmost tile of the hand, whatever its rank,
until you discard; only then does it sort back into the wall. `displayHand()`
moves `lastDraw.tile` to the end and the last tile carries `is-drawn` and the
`just drawn` label. The audit fails if the fresh tile is not the rightmost one
on screen.

### A call is public (2026-11-06)

A CPU pung, kong or chow appears in that seat's band as soon as it is made:
the rack keeps its face-down backs and the call sits beside them in the rack's
own tile size (`--layout-back-w/h`), stacked down the band on a side seat and
run along it on the top seat. Thirteen tiles still fit the band - a call
replaces as many backs as it exposes - so the call never leaves its band, and
the audit measures that, plus that no call covers the hand or a discard.

The call is also announced: the seat's meld row lights up for 950 ms (a
brightness/scale pulse; a 2 px outline instead when the user prefers reduced
motion) and a two-knock cue plays, distinct from the single tile clack and from
the two-note claim offer. History is never cued: a review state or a resumed
game arrives with the whole log, and only a live `claims` line lights a seat.

### The walls are turned (2026-11-06)

A wall shows its tiles from that player's side of the table, so each seat has
an angle:

    seat-top   180deg   (its tiles face away from you)
    seat-left  270deg   (its tiles lie on their side)
    seat-right  90deg
    hand         0deg   (yours)

A turned tile takes its own box: on a side seat a back is one tile height
across and one tile width down, so the solver sizes the side bands that way
(`sideSeatWidth = rackHeight`, `sideSeatHeight = 13 * rackWidth + 12`) and the
top band stays thirteen tile widths long. The faces in a side wall's melds turn
with its backs. `--tile-turn` carries the angle and every seat image rotates by
it.

The back art (`web/tiles/back.svg`) is a bone body with a glazed green diamond
lattice, a bone rim and two bevel strips: at 30 px it reads as a woven tile back
rather than a flat card, and the light/dark strips give a turned wall a top and
a bottom.

### Every call is spoken (2026-11-06)

A pung, kong, chow, fishing declaration or a win is announced once, as one
word in capitals - PUNG, KONG, CHOW, FISHING, MAHJONG - for 720 ms, in front of
the wall of the seat that called it: under the top wall, beside the side walls,
above your hand. Every anchor is a solver rect (`--layout-seat-*`,
`--layout-hand-*`) and the word never takes pointer events. It is sized from
the wall's own tile (`0.62 * --layout-back-h`), so it is legible on a phone.

The word is a beat of the table, not a toast: while it is up nothing else moves
(`callHeld` blocks the beat, the automatic draw, the step loop and taps), and
the announce timer resumes the table itself. The caller's meld row lights at
the same moment and the two-knock cue plays, so the word, the meld and the
sound are one event. History never speaks: a review state or a resumed game
carries the whole log, and only live events announce.

Timing, for one round with a claim on your throw:

    your throw lands        0 ms
    settle                 380 ms
    claim answered         ~385 ms   word + meld light + cue
    word clears            1105 ms
    table answers          ~1110 ms  (the claimer's next decision)
    next throw lands       2110 ms

### Wall tiles are as big as the table allows (2026-11-06)

The back was sized from the hand's tile, which left an 18 px back on a phone.
It is now derived from three limits, whichever binds first:

    wall_tile_w = floor(min(
      (board_w - 12) / 13,     // thirteen fit across the top wall
      hand_tile_w * 0.85,      // never bigger than your own tiles
      board_h * 0.06,          // a wall never dominates the table
    ))
    wall_tile_h = round(wall_tile_w / 0.75)

then clamped so thirteen of them still stack down a side seat, and floored to a
whole pixel so the bands and the artwork agree (`seats` and `--layout-back-*`
are built from the same rounded numbers). Desktop 45x60 (was 33x44), phone
portrait 26x35 (was 18.7x25); a phone in landscape is still capped by thirteen
tiles in about 200 px of height.
