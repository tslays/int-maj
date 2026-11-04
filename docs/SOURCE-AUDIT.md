# Primary-source audit

Goal: make the implementation follow the owner-designated primary scan
(`rules/SOURCE.md`) exactly, with a page citation for every rule and every
hand. The existing catalogue and engine stay labelled unverified until each
statement here is checked off.

## Ground material

| What | Where |
|---|---|
| Primary source | `scans/The Game of Mah Jong Illustrated - trimmed.pdf` (33 spreads) |
| Page renders | `rules/primary-pages/pNN.png` (1800 px, crop boxes applied) |
| OCR aid | `rules/primary-ocr-1.txt`, `rules/primary-ocr-2.txt` (navigation only) |
| Re-render | `swift rules/primary-pages.swift "<pdf>" rules/primary-pages <out>.txt FROM TO` |

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
Every conflict with `rules/PLAY.md`, `rules/ASSUMPTIONS.md` or the engine goes
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

Change code and tests to the audited rules, one group per commit, each commit
citing its audit entry. Recognition and scoring stay separate layers.

*Acceptance:* the specific rule or hand changed has a test that fails before
the change and passes after; `npm test` green on the committed tree; the
changed behavior is named in the commit message with its page.

## Milestone D — docs and UI text

`README.md`, `docs/UI.md`, `rules/PLAY.md` and `rules/ASSUMPTIONS.md` describe
the audited rules only; superseded text is replaced, not appended to.

## Evidence rules

- The PDF page is the evidence. OCR only finds text; it never settles wording,
  a score figure or a tile diagram.
- Read numeric columns and tile diagrams visually from the render.
- If the source is ambiguous, record both literal readings with the page and
  choose the narrowest one as an assumption; never choose silently.
- A previous owner decision does not survive a page that says otherwise.
