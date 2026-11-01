# The table's interface

North star: the clarity and physicality of Mahjong Soul / Riichi City's board — every element in its place, tiles that feel like objects, one obvious next action — **without** the anime, gacha or decorative clutter. Clean, modern, quiet. The board should read at a glance from across a desk.

This is a design brief, not a wish list: each phase has acceptance criteria that can be seen in a screenshot.

## What is wrong today

- The board is a 3x3 grid capped at 980px, so four seats, a wall, a status line and an action bar fight for the same space.
- Hand tiles are 60x80 and the rest 30x40; nothing dominates, so the eye has no entry point.
- State is *text* ("Your turn: draw a tile") rather than *position* — you must read to know whose turn it is.
- Legal moves are listed as strings; there is no primary action, no keycap, no disabled state.
- Discards, melds and bonus tiles are three undifferentiated rows; the table has no depth, no shadow, no motion.

## Design language

- **Surface**: deep jade felt with a soft vignette; tiles are warm ivory, 2px bevel, 1px rim, drop shadow `0 1px 2px rgba(0,0,0,.45)`. Nothing else is skeuomorphic.
- **Colour**: felt `#123a29`, ivory `#f7f2e2`, ink `#101a14`, accent (turn / primary action) `#e7c65b`, danger `#e06c5a`, seat tints subtle (E gold, S teal, W violet, N blue) used only as 2px edge marks and name chips.
- **Type**: one sans (system UI) at three sizes only — 13 label, 15 body, 18 heading — plus tabular numerals for scores. No letter-spaced all-caps beyond labels.
- **Motion**: 140 ms ease-out for lifts and slides, 220 ms for the hand entering; `prefers-reduced-motion` kills all of it. Nothing bounces, nothing spins.
- **Focus**: every interactive tile is a real button with a visible focus ring; keyboard alone must play a hand.

## Borrowed from the north star, concretely

The north star here is **only** how the table looks and where the elements sit while playing — board proportions, where each seat, river, hand, wall and action cluster lives, and the visual hierarchy between them. Not their rules, features, progression or art.

What Mahjong Soul and Riichi City get right about that layout:

- **The hand is the hero.** A wide, bottom-centred row of large tiles, always the brightest thing on screen; everything else steps back in contrast and size.
- **One river per seat, six to a row.** Discards sit in a fixed grid belonging to each seat, in throw order, so you can read who discarded what without a log. Melds sit beside the river, not mixed into it, and a claimed tile is visibly absent from the river.
- **Seat HUDs are compact and identical**, one per corner/edge: wind, name, points, dealer dot, and their melds. Nothing per-seat is a different shape from the others.
- **Turn is positional.** The active seat's area lights up (edge glow + slightly raised hand or rack), so you know whose turn it is before you read a word.
- **Actions are a fixed low cluster**, always in the same place, big enough to hit without aiming, with a keycap legend; one primary action is visually dominant. A claim window has exactly two decisions, Claim and Dismiss.
- **The wall is a quiet counter**, a number and a shrinking ring in the middle, never a table.
- **Results are an overlay with deltas**, showing each seat's change against its previous points, then a single primary "next hand".
- **Selection is physical**: hover lifts a tile a few px, selecting raises it further and dims the rest of the hand slightly, so what you are about to throw is unmistakable.

Do **not** copy: avatars, emotes, sound, backgrounds, gacha frames, decorative animation, or any of their rules and features. Our surface is felt, our type is system sans, our only ornament is the tiles.

## Layout (target)

Full viewport, no max-width box. Three bands:

1. **Board** (fills the window): the three bots on the top, left and right edges, seated on the felt. Each shows: name chip with seat wind and points, a rack of tile backs (concealed count), its melds, and a 6-column discard grid. The centre holds the wall count, the round wind and the dealer badge — small, quiet, never competing with the hand.
2. **Own hand** (bottom, full width): tiles 84x112 (SVG art scales), sorted by suit then rank with honours last, 6px gaps, hover lift 6px and brighten, click selects and lifts 10px, Enter/click discards. The just-drawn tile sits one extra gap apart from the 13; no dot is needed. Melds sit to the right of the hand, kongs showing all four. Bonus tiles sit in a small tray at the far right.
3. **Rail** (right, 260px, collapsible): scorecard (four rows: seat, wind, points, dealer dot), a turn indicator that is a moving highlight rather than a sentence, the wait panel ("waiting on b6 - 3 left"), and a collapsible event log.

### The reserved river grid

Every seat owns a discard board of **six columns by six rows, 36 slots**, reserved before the first draw. A slot is always in the layout, so a river never grows, reflows or moves another element:

- tiles fill slots left to right, then top to bottom, in throw order;
- empty slots are invisible but keep their space;
- the four boards are named items in **one board grid**, not absolutely placed boxes: `seat-left / seat-top / seat-right` columns and `river-top / centre / river-bottom` rows are explicit tracks derived from `--tile-w`, `--tile-h` and `--tile-gap`;
- the side seats span the full height of their own columns, so a rack or a meld can never reach a river;
- your own river occupies the board's bottom row and shares its centre column with the wall; the hand band is a separate row of the app grid.

The board is a CSS grid, not per-seat absolute positioning: the four boards cannot be pushed around by a long river, and the layout checker (`tools/check-layout.ts`) measures the rectangles at 1440x900 and 1280x800 with 0, 13 and 36 discards.

## Affordances both clients have that we should match

Taken from how these tables read in play (AJ Martinez, worldsbe.st, on Mahjong Soul and Riichi City), each is a small, quiet signal rather than a new panel:

- **Wait preview** — while you hold 13 tiles, the tiles that would finish you are always visible (our wait panel), not something you open.
- **Selected-tile highlight** — the tile you are about to throw is unmistakable: raised, and the rest of the hand steps back in contrast.
- **Just-drawn marker** — the tile you drew this turn is marked (a small dot or a lift), so you can see what is new before you throw it. If you discard it untouched, it is plainly the drawn tile that went down.
- **Wall always visible** — the remaining wall is a first-class counter the whole hand (Riichi City shows the whole wall; we need only the count and a shrinking ring).
- **Our equivalents of their dora/furiten warnings**: the bonus tiles you hold are shown in the tray at all times, and an announced fishing wait is highlighted where it sits in the rail.

## Where the game design comes from

The rules, the hands and the scoring are the Companion's and nothing else: no riichi yaku, no dora, no furiten, no riichi sticks. What may be borrowed from Riichi City and Mahjong Soul is **interface and game-feel** — the shape of a turn, how a claim is offered, how a result is presented, how the table waits for you, what the player can see at a glance. Research those clients (public screenshots, articles, wikis) for interaction patterns, then translate them onto our rules. When the two disagree about a rule, the Companion wins; when they disagree about how something *feels*, the reference wins.

## Prefer Tenhou's plainness for the arrangement

Of the two references, Tenhou is the closer model for us because it carries no decoration at all, and its arrangement is simpler to hit:

- No avatars or portrait panels. Each seat is its wind and name, set into the felt in its own corner, nothing else.
- Racks live on the edges, one line per seat: top horizontal, left and right vertical, the concealed backs slightly inset from the border.
- Wall on the edge: one row of face-down tiles along the felt above your hand; for us a quiet counter is enough.
- Rivers in the middle, six per row, each turned to face its own player, the four blocks meeting around the centre.
- Centre carries only the round and hand, the wall count and the four scores at the sides.
- Hand at the very bottom: one plain row, drawn tile apart, no meld mixing, no ornament.
- Two plain action buttons bottom-right with their key hints, on the felt.

So: take scale and tile proportion from Mahjong Soul, and structure, spacing and plainness from Tenhou.

## The geometry to copy (measured off a Mahjong Soul board)

Copying their *layout* is fine; copying their art is not. These are the proportions that make that board read, expressed against one hand tile as 1 unit:

- **Hand tile** = 1.0 unit wide (about 7% of the viewport width, 13 tiles plus the drawn tile across the bottom edge).
- **River tile** = 0.62 unit; a river is six per row, rows stacked flush, the block centred in front of its seat.
- **Concealed back** = 0.33 unit; the top seat shows one horizontal line of them, the side seats one vertical line each, set in from the edge.
- **Table frame**: a one-tile-wide band of felt inside a thin lighter outline, inset about 3% from the sides and 12% from the top, marking the play area.
- **Centre panel** = about 1.9 units wide, sitting dead centre, with the round and wall in the middle and the four scores in its corners, the dealer's corner marked.
- **Meld row** sits outside the hand, on the side away from the drawn tile.
- **Two large action pills** at the bottom right, on the felt, not over the hand.

Everything else in that screenshot (avatars, emotes, gacha frames, dora, sticks, timers) is theirs and stays out.

## How the reference arranges tiles (from the Mahjong Soul board)

Looking at a live Mahjong Soul table, the arrangement rules that make it read instantly — adopt these:

- **A river is a compact block, not a scatter.** Each seat's discards are six to a row with the tiles *touching* (1px, no gaps between them), rows stacked flush, and the whole block aligned toward the centre of the table.
- **Each river faces its own player.** The top seat's river is turned 180 degrees, the side seats' rivers 90 degrees, so every player reads their own river left to right, top to bottom. Ours may keep one orientation if rotation is too costly, but the compact 6-wide block and the centre alignment are not optional.
- **The drawn tile sits apart.** Your hand is 13 tiles with a small gap before the tile you just drew, so "this is new" needs no marker.
- **Melds live at the right end of the hand**, outside the 13, never mixed into the river.
- **The centre is a small panel**, not empty felt: round, wall count and the four scores, with the dealer marked. Everything else stays quiet.
- **Tile size is the budget**: about fourteen tiles across for the hand, about six across for a river, and the seat panels never larger than a tile's width pair.

## The arrangement reference

The composition to match is the Riichi City table screenshot the owner nominated: <https://worldsbe.st/content/images/2022/11/riichicity.jpg> (1920x1080). Match its **proportions and positions**, never its art:

- own hand: one large centred row along the bottom edge, occupying roughly the bottom sixth of the frame;
- own river: directly above the hand, six to a row, growing away from you toward the centre;
- opponents' rivers: the same six-wide pattern in front of each seat, feeding the centre from top, left and right;
- seat chips: a compact identical block at each seat's own edge (wind, name, points), never a shared table in a corner;
- wall and round: the quiet centre;
- actions: a fixed cluster low on the right, adjacent to the hand, not across the board.

What we take from that picture is exactly three things: **the viewing angle** (a slight top-down perspective with the hand angled toward the player, not a flat diagram), **the arrangement** of elements above, and **the crispness** — every tile and label sharp at any size, generous but tight spacing, nothing blurred by effects.

What we do not take: riichi-only furniture (dora indicators, riichi sticks, furiten warnings, seat boxes, round/timer bars, avatars) and none of the flash — no glow, no gradients on the felt, no character art, no orchestrated animation. Ours is quieter than the reference on purpose.


## Rivers are reserved, not grown

The discard area of every seat is allocated **before the first discard**: a fixed 6-wide grid of 36 slots (six rows), sized from the tile size, and it never reflows, grows, shrinks or moves for the rest of the hand. Thrown tiles fill the slots in throw order — left to right, then top to bottom — and empty slots are invisible but still occupy their space, so the board's geometry is decided once and nothing ever jumps.

Consequences: no absolute positioning of a seat, river or the centre, no per-discard layout pass, no overlap with the hand band, the centre panel or a seat chip, and the same rule for all four seats. Overlays (the action cluster, the claim bar and the result modal) are the only floating pieces.

## Claims are two decisions, not four

A claim window offers exactly two choices, by keyboard and by mouse:

- **Enter / the Claim button** takes the claim. If the claim has variants (a chow can be more than one run), Enter takes the obvious best one and the variants remain clickable tile groups under the row for the mouse.
- **Space / the Dismiss button** lets it go.

There are no per-meld keys (no `p`, `c`, `k`, `m`) and no scattered meld buttons: two labelled buttons, fixed in place, always in the same spot, never shifting the board.

## The claim prompt gets a sound

When a claim window opens for you, play **one short, quiet cue** — enough to notice if you looked away, never a jingle. Constraints: synthesised with the Web Audio API (no audio files, no dependency), a two-note tick of 170 ms at low gain, played once per claim window (not on every re-render), only after the browser allows audio (the first user gesture), silenced by a mute toggle (`m`, remembered in `localStorage`). `prefers-reduced-motion: reduce` starts muted until `m` says otherwise. No sounds anywhere else for now.

## Interaction contract

- Exactly one primary action is emphasised at any moment; secondary ones are inline with keycaps (Enter, Space, F).
- Claims appear as a fixed bottom-centre bar that pushes nothing else around: exactly two decisions, **Claim** (Mahjong, else pung/kong/chow) and **Dismiss**. Enter takes Claim, Space takes Dismiss, and multiple chow runs appear as clickable tile groups under the row. There are no p/c/k/m claim shortcuts.
- Illegal actions are absent, not greyed out, except during a claim window where Pass is always present.
- The hand's keyboard focus is a cursor you can move with arrows; 1-9 jumps to a tile.
- End of hand: a panel over the felt, not a new page — winner, the pattern that scored with its tier, the composed tiles, each fishing settlement and the four deltas, then "Next hand" as the primary action.
- Never move the hand, the board's centre or the rail when a claim or a result appears: layout shifts are the main reason the current table feels unstable.

## Phases and acceptance

**Phase 1 — the board.** New layout (full-bleed, three bands), hand at 84x112 with selection/hover, melds and discards in their own racks, centre wall/round panel, seat chips with points, one primary action with keycaps. *Accept:* screenshot at 1440x900 and at 1280x800 shows a readable hand of 14 tiles at a glance, four identifiable seats, and one obvious action.

**Phase 2 — the table's states.** Turn highlight, claim bar with chow variants, wait panel, click-to-discard with selection, keyboard cursor, result panel with scoring and payments. *Accept:* a full hand can be played keyboard-only; a discard win and a self-drawn win both show a correct breakdown.

**Phase 3 — polish.** Tile entry/exit motion, discard slide, draw lift, reduced-motion path, focus rings, aria-live for turn changes, contrast checked in light and dark themes, 1024x700 still playable.

Nothing in any phase may add a dependency, a build step or a bitmap: the art is the SVG set in `web/tiles/`, the client is plain ES modules.
