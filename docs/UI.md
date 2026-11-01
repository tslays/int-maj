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
- **Actions are a fixed low cluster**, always in the same place, big enough to hit without aiming, with a keycap legend; the primary one (Mahjong, then Pung/Kong, then Chow, then Pass) is visually dominant and the rest follow in a strict order.
- **The wall is a quiet counter**, a number and a shrinking ring in the middle, never a table.
- **Results are an overlay with deltas**, showing each seat's change against its previous points, then a single primary "next hand".
- **Selection is physical**: hover lifts a tile a few px, selecting raises it further and dims the rest of the hand slightly, so what you are about to throw is unmistakable.

Do **not** copy: avatars, emotes, sound, backgrounds, gacha frames, decorative animation, or any of their rules and features. Our surface is felt, our type is system sans, our only ornament is the tiles.

## Layout (target)

Full viewport, no max-width box. Three bands:

1. **Board** (fills the window): the three bots on the top, left and right edges, seated on the felt. Each shows: name chip with seat wind and points, a rack of tile backs (concealed count), its melds, and a 6-column discard grid. The centre holds the wall count, the round wind and the dealer badge — small, quiet, never competing with the hand.
2. **Own hand** (bottom, full width): tiles 84x112 (SVG art scales), sorted by suit then rank with honours last, 6px gaps, hover lift 6px and brighten, click selects and lifts 10px, Enter/click discards. Melds sit to the right of the hand, kongs showing all four. Bonus tiles sit in a small tray at the far right.
3. **Rail** (right, 260px, collapsible): scorecard (four rows: seat, wind, points, dealer dot), a turn indicator that is a moving highlight rather than a sentence, the wait panel ("waiting on b6 - 3 left"), and a collapsible event log.

## Affordances both clients have that we should match

Taken from how these tables read in play (AJ Martinez, worldsbe.st, on Mahjong Soul and Riichi City), each is a small, quiet signal rather than a new panel:

- **Wait preview** — while you hold 13 tiles, the tiles that would finish you are always visible (our wait panel), not something you open.
- **Selected-tile highlight** — the tile you are about to throw is unmistakable: raised, and the rest of the hand steps back in contrast.
- **Just-drawn marker** — the tile you drew this turn is marked (a small dot or a lift), so you can see what is new before you throw it. If you discard it untouched, it is plainly the drawn tile that went down.
- **Wall always visible** — the remaining wall is a first-class counter the whole hand (Riichi City shows the whole wall; we need only the count and a shrinking ring).
- **Our equivalents of their dora/furiten warnings**: the bonus tiles you hold are shown in the tray at all times, and an announced fishing wait is highlighted where it sits in the rail.

## Interaction contract

- Exactly one primary action is emphasised at any moment; secondary ones are inline with keycaps (D, 1-9, Enter, Space).
- Claims appear as a bottom-centre bar that pushes nothing else around: Pung, Chow (a second row to pick the variant), Kong, Mahjong, Pass — all reachable by key and by click.
- Illegal actions are absent, not greyed out, except during a claim window where Pass is always present.
- The hand's keyboard focus is a cursor you can move with arrows; 1-9 jumps to a tile.
- End of hand: a panel over the felt, not a new page — winner, the pattern that scored with its tier, the composed tiles, each fishing settlement and the four deltas, then "Next hand" as the primary action.
- Never move the hand, the board's centre or the rail when a claim or a result appears: layout shifts are the main reason the current table feels unstable.

## Phases and acceptance

**Phase 1 — the board.** New layout (full-bleed, three bands), hand at 84x112 with selection/hover, melds and discards in their own racks, centre wall/round panel, seat chips with points, one primary action with keycaps. *Accept:* screenshot at 1440x900 and at 1280x800 shows a readable hand of 14 tiles at a glance, four identifiable seats, and one obvious action.

**Phase 2 — the table's states.** Turn highlight, claim bar with chow variants, wait panel, click-to-discard with selection, keyboard cursor, result panel with scoring and payments. *Accept:* a full hand can be played keyboard-only; a discard win and a self-drawn win both show a correct breakdown.

**Phase 3 — polish.** Tile entry/exit motion, discard slide, draw lift, reduced-motion path, focus rings, aria-live for turn changes, contrast checked in light and dark themes, 1024x700 still playable.

Nothing in any phase may add a dependency, a build step or a bitmap: the art is the SVG set in `web/tiles/`, the client is plain ES modules.
