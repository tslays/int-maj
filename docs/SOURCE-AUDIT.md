# Primary-source audit

Goal: make the implementation follow the owner-designated primary scan
(`rules/SOURCE.md`) exactly, with a page citation for every rule and every
hand. The existing catalogue and engine stay labelled unverified until each
statement here is checked off.

## Ground material

| What | Where |
|---|---|
| Primary source | `scans/The Game of Mah Jong Illustrated - trimmed.pdf` (33 spreads) |
| Page renders | `rules/.generated/primary-pages/pNN.png` (1800 px, crop boxes applied) |
| OCR aid | `rules/.generated/primary-ocr-1.txt`, `rules/.generated/primary-ocr-2.txt` (navigation only) |
| Re-render | `swift rules/tools/primary-pages.swift "<pdf>" rules/.generated/primary-pages <out>.txt FROM TO` |

Each PDF page is an open-book spread (two printed pages). Spread map, from the
opening lines of each render:

| PDF page | Content |
|---:|---|
| 1 | Cover: title, authors, Kangaroo Press |
| 2 | Acknowledgements and copyright |
| 3 | Introduction |
| 4 | The Set, number of tiles |
| 5-6 | Wind tiles, wind discs |
| 7 | Design variations |
| 8 | The Scoring Groups (Pung, Kong, Chow, Pair) |
| 9 | Background to the Game |
| 10 | Seat selection |
| 11 | Building the wall |
| 12 | Courtesies |
| 13-14 | Scoring, worked example (West goes Mah Jong) |
| 15 | Newcomers / the Chinese game |
| 16 | Special hands: introduction and list |
| 17 | How to use the illustrations |
| 18-30 | Numbered special-hand illustrations with scores |
| 31 | Synopsis of Special Hands (score table) |
| 32 | The Game in Brief (summary of play) |
| 33 | Index |

## Deliverable

`rules/RULES.md` is the single normative framework. It has three parts: Part I
general play (done, Milestone A), Part II the Illustrated special-hand catalogue
(Milestone B), Part III the Companion's extensions (Milestone B2: only the hands
and tiers the primary book does not print, each tagged `[C p.N]`). The engine
follows it only when `rules/AUDIT.md` is closed out (Milestone C).

## Milestone A — general play rules

Pages 3-17 and 32. Write `rules/PRIMARY-RULES.md`: one numbered statement per
rule, each with its page and, where it matters, the printed wording. Cover at
minimum: tile set and counts; flowers and seasons; seating and winds; the wall
and dealing; drawing and discarding; pungs, kongs, chows and pairs; what may be
called and from whom; precedence of claims; kong replacement; winning and
Mah Jong; scoring (tiers, doubling, wind of the round, seat wind, flowers,
payments); courtesies; and whether "fishing" exists at all.

Anything the source does not state is listed as **not stated**, not filled in.
Every conflict with `rules/archive/PLAY.md`, `rules/archive/ASSUMPTIONS.md` or the engine goes
in `rules/AUDIT.md` with both readings and the page.

*Acceptance:* every general rule used by the engine either cites a page or is
recorded as an assumption with proof that the page is silent; no statement is
carried over from the Companion without re-reading the primary page.

## Milestone B — hands and scores

Pages 16-31. Write `rules/PRIMARY-HANDS.md`: one row per printed hand with its
number, name, score lines exactly as printed (Limit / Half Limit / Calculate,
concealed and exposed where printed), its exact composition read from the
illustration and caption, and its page. Then classify every entry in
`src/core/patterns/table.ts` as verified, corrected, missing or not in the
book, with the change list in `rules/AUDIT.md`.

*Acceptance:* every hand printed in the book appears exactly once; every score
figure was read from the render, not from OCR; no pattern in the table lacks a
source page or an explicit "not printed in this book" note.

## Milestone B2 — Companion extensions

Only after Part II: list what *The Mah Jong Player's Companion* adds that the
Illustrated book does not print — extra hands and the middle-limit tier with its
fishing figure. Each entry carries `[C p.N]`, states the Illustrated alternative
where one exists, and may not contradict Part I.

## Milestone C — engine reconciliation

The owner asked that the rules be finished before any UI work starts. Work in
these slices, in order, one commit each, tests green at every commit
(`npm test`), and mark the audit rows resolved in `rules/AUDIT.md` as they land.

| Slice | Audit rows | What it changes | Acceptance |
|---|---|---|---|
| C1 Scoring | A1, A5, A23, A26 | Ground score table, doubles, limit cap, terminal-as-honour, flower/season points, no middle tier on Illustrated hands | An ordinary hand scores ground × 2^doubles capped by the limit; a printed hand scores its printed tier; both tested |
| C2 Payments | A2, A3, A7, A16, A24, A27 | Everyone pays the winner, East doubles, losers settle differences, rounding to 100, settlement levels, careless-discard liability | A worked hand reproduces the book's 84 × 2^5 = 2688, East 2000 / others 1000; ledger sums to zero |
| C3 Deal and wall | A9, A10, A18 | Four-tile rounds, East starts at 14 and discards first, loose tiles at the break, bonus and kong replacement from loose tiles, dice seat assignment | A seeded deal produces 14/13/13/13 with the printed order; loose tiles are consumed and replaced |
| C4 Calls and turns | A19, A20, A21, A22 | Kong from an exposed pung on your own draw, robbing the kong, chow only by the discarder's right-hand player or to win, chow-to-win precedence | Each case has positive and negative tests |
| C5 Fishing | A4, A6, A8 | Fishing is the state of needing one tile, announced, any discard may be taken for the win; figures are fractions of the limit; the payer question stays an explicit assumption | Fishing settlement matches the printed figures; claiming while fishing works |
| C6 Rounds and penalties | A11, A13, A14, A15, A17, A25 | Wind of the Round progression, dealer repeat, drawn hand, goulash, kitty, penalties, reshuffle, special hands optional | A four-round game with correct winds; each penalty path tested |
| C7 Catalogue | 12 corrections, 3 additions, C1-C9 | Fix compositions and tiers; add Buried Treasure, All Kong, Mixed Pung; remove the Companion tiers the Illustrated book overrides | Catalogue fixtures for every corrected/added hand |
| C8 Chinese variant | A12 | 136 tiles, dead wall of 14, mixed suits, any number of chows, as a variant profile | A Chinese-game test proves the dead wall is never drawn and mixed-suit hands match |
| C9 Text sweep | — | README, docs/UI.md and every comment describe the framework, not the old rules | grep finds no stale rule claim |

**Milestone C status: done.** All nine slices are committed; C9 is the text
sweep. Deferred rows and their reasons are in `rules/AUDIT.md`: A13 (Goulash
exchange tile choice not printed), A15 (hand-size/false-Mah-Jong penalties
have no reachable legal action), A17 (reshuffle has no printed deal
algorithm), A25 (tournament hand-count/repeat history is table bookkeeping),
plus A16/A24/A27 from C2.

### The bar for every C slice

1. **Test first.** A behaviour change starts with a test that fails on the old
   code; the commit message names it.
2. **Reproduce the book.** Every worked example the pages print is a test with
   the printed figures, not a rounded approximation.
3. **Invariants, not just cases.** Payments sum to zero across the table; a
   higher doubling count never scores less before the cap; a capped hand never
   exceeds the limit; a hand scores the same however its tiles are ordered; a
   seat's view never contains another seat's concealed tiles.
4. **No orphan paths.** If a rule is replaced, the old branch, flag or constant
   is deleted in the same commit — no dead `if` left behind for safety.
5. **Close the row.** Each audit row is closed in `rules/AUDIT.md` with the
   commit hash and the test that proves it; a row that cannot be closed says why.
6. **Self-review the diff.** Read your own `git diff` before committing: no
   commented-out code, no TODOs, no rule applied "just in case".

Change code and tests to the audited rules, one group per commit, each commit
citing its audit entry. Recognition and scoring stay separate layers.

*Acceptance:* the specific rule or hand changed has a test that fails before
the change and passes after; `npm test` green on the committed tree; the
changed behavior is named in the commit message with its page.

## Milestone D — docs and UI text

`README.md`, `docs/UI.md` and every comment in `src/**` describe the audited
rules in `rules/RULES.md` only; `rules/archive/` stays historical audit
material. Superseded text is replaced, not appended to.

## Evidence rules

- The PDF page is the evidence. OCR only finds text; it never settles wording,
  a score figure or a tile diagram.
- Read numeric columns and tile diagrams visually from the render.
- If the source is ambiguous, record both literal readings with the page and
  choose the narrowest one as an assumption; never choose silently.
- A previous owner decision does not survive a page that says otherwise.
