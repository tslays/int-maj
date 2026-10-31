# Notes: source problems and transcription decisions

The catalogue covers both columns of the Full Synopsis (book pp. 56-61) and
every hand that appears only on a scanned catalogue page: **85 canonical
patterns, 6 provisional, 0 unresolvable compositions**. The synopsis's printed
Winning/Fishing values are transcribed; `calculate` hands keep a null value.

## Source limitations

- `rules/companion-ocr.txt` is an OCR index. It keeps the prose but loses the
  tile diagrams; composition always comes from the page renders.
- The synopsis is a spread: the left page 56 carries pages 9-19, the right
  page 57 pages 20-30; likewise 58/59 and 60/61. Both pages were read with
  Vision bounding boxes because the right page is easy to miss on a first
  pass.
- The scan files are two-page spreads (p07 = pages 10-11 through p29 = 54-55,
  then p30 = 56-57, p31 = 58-59, p32 = 60-61). Both facing pages are present;
  the right page was initially missed, not absent. Only page 9 (the first RUNS
  page) is outside the spread range; those three hands rely on the short list
  and synopsis.
- The owner confirmed that the right margin of pp. 4 and 30-32 trims only a
  letter or two and that nothing substantive is missing there. Clipped words
  on those pages are read normally.
- The synopsis prints a **Winning** and a **Fishing** value for every row:
  half 500/200, limit 1000/400, middle 1500/600, double 2000/800, and
  "Calculate" for three hands. Page 4's separate scoring block agrees with
  these per-tier figures.
- The scan is a partial excerpt: printed page numbers run to 60, and the short
  list cites pages up to 54. Page references in the table use printed book
  pages, not scan PNG numbers.

## Dedupe and variant decisions

One canonical id keeps every printed page:

| Canonical id | Printed pages | Decision |
|---|---|---|
| `wriggly-snake` | 10, 27 | Two printings, one shape. |
| `hachi-ban` | 10, 25, 30, 32 | The winds-pair and dragons-pair forms are one shape family. |
| `dragon's-tail` | 12, 40 | Dragon's Tail 1 & 2 are the two orientations; one predicate accepts either. |
| `gerties-garter` | 14, 20, 50 | Three printings, one shape. |
| `yin-yang` | 14, 50 | Two printings, one shape. |
| `windy-chow` | 18, 26 | Two printings, one shape. |
| `chop-suey` | 18, 26 | Two printings, one shape. |
| `chow-mein` | 18, 26 | Two printings, one shape. |
| `moon-at-bottom-of-well` | 15, 60 | Two printings, one shape. |
| `knitting` | 20, 50 | Two printings, one shape. |
| `triple-knitting` | 20, 51 | Two printings, one shape. |
| `all-pair-honours` | 22, 44 | Two printings, one shape. |
| `all-pair-jade` | 23, 32, 52 | Three printings, one shape. |
| `all-pair-ruby-jade` | 23, 32, 53 | Three printings, one shape. |
| `imperial-jade` | 36, 52 | Two printings, one shape. |
| `lily-of-the-valley` | 36, 52 | Two printings, one shape. |
| `lillypilly` | 36, 60 | Two printings, one shape. |
| `green-jade` | 35, 53 | Two printings, one shape. |
| `red-coral` | 35, 60 | Two printings, one shape. |
| `white-opal` | 35, 60 | Two printings, one shape. |
| `ruby-jade` | 37, 54 | Two printings, one shape. |
| `red-lily` | 37, 54 | Two printings, one shape. |
| `royal-ruby` | 37, 54 | Two printings, one shape. |
| `heads-and-tails` | 45, 51 | Two printings, one shape. |
| `windy-ones` | 28, 45 | Two printings, one shape. |
| `windy-nines` | 28, 45 | Two printings, one shape. |
| `sparrows-sanctuary` | 21, 49, 53 | Three printings, one shape. |
| `heavenly-twins` | 21, 48 | Two printings, one shape. |
| `gates-of-heaven` | 9, 49 | Two printings, one shape. |
| `run-pung-pair` | 9, 49 | Two printings, one shape. |
| `dragons-breath` | 24, 31 | Two printings, one shape. |
| `golden-gates` | 25, 34 | Two printings, one shape. |
| `windy-dragons` | 25, 46 | Two printings, one shape. |
| `hovering-angel` | 17, 41 | Two printings, one shape. |
| `dragonette` | 24, 39 | Two printings, one shape. |
| `dragons-teeth` | 12, 33, 60 | Characters and Circles are suit variants of one hand. |

`big-robert-mixed` is the only `variantOf`: the book scores the same-numbers
form at limit and every other form at half limit, and the two predicates are
mutually exclusive.

## Provisional readings

`provisional: true` means the composition or its structural reading is an
inference, not a transcribed diagram. The reasoning is repeated in
`rules/ASSUMPTIONS.md`.

| Hand | Reading | Why |
|---|---|---|
| Moon at Bottom of Well | Four Circle chows + Circle pair; the chows include 123, 456 and 789. | The p. 15 hand page is visible; "three in ascending order" is read as the three ascending chows, not three consecutive starts. |
| Crazy Chows | Four mixed chows + a mixed pair (same number, two suits). | The four chows are clear on p. 16; "Mixed Pr" is read as the Knitting pair. |
| Imperial Jade | Green Dragon set + three green-Bamboo sets (at most one 2-3-4 chow) + green Bamboo pair. | The synopsis says "Three P/K (or a Chow)"; p. 36 illustrates three pungs. A green-Bamboo chow can only be 2-3-4. |
| White Elephant | White Dragon set + three Circle pungs + even-Circle pair. | The synopsis says only "Three P/K"; the Circle Suit context and the even pair give the conservative reading. |
| Driven Snow | White Dragon set + three Character pungs + odd-Character pair. | Same reasoning as White Elephant, in Characters. |
| Dragon's Scales | Red Dragon set + three Character pungs + even-Character pair. | Same reasoning as White Elephant, in Characters. |

## Resolved ambiguities

- **Exposed labels**: "(Concealed)" with no exposed half means concealed-only
  (`exposedTier: null`); "(Concealed) HALF LIMIT (Exposed)" means limit/half;
  "(Exposed)" means the exposed value equals the printed winning value.
  Little Brother is HALF LIMIT (Concealed), not limit.
- **Dragon's Run** (p. 59): a distinct hand from Wriggly Dragon: GRW + wind
  pair + run 1-9, 1500/600 versus Wriggly Dragon's 1000/400.
- **Synopsis right page**: it is the facing page of the spread, not a
  continuation of the left table. It supplied the printed Winning/Fishing values, Seven Brothers, Three
  Sisters, Up You Go, Down You Go, Numbers in Parallel, Numbers Doubled and
  Chinese Odds.
- **Seven Twins vs Heavenly Twins**: Seven Twins is seven pairs of anything,
  all tiles from the wall including the last (concealed-only, self-drawn).
  Heavenly Twins is seven pairs in one suit with no honours. They are
  different hands and both are in the table.
- **Wriggly Snake**: "any tile paired" is one extra tile duplicating any of
  the thirteen already present (run tile or wind), not a fifteenth tile.
- **Hachi Ban**: "Three Pairs Winds or Dragons" is three distinct pairs of
  winds or the three dragon pairs; a kong is not used because the run plus
  three pairs must total 14.
- **Big Robert**: the pair is a wind or dragon pair; the three four-tile runs
  are one per suit. Same numbers scores limit, otherwise half.
- **All Honour Hand**: the p. 44 diagram uses terminals from more than one
  suit, so the short list ("Winds, Dragons, 1s and/or 9s") is read without a
  one-suit restriction.
- **All Pair Honours**: terminals and honours may be combined; "Pairs of 1s &
  9s only, Winds & Dragons only, or all combined" on p. 44.
- **All Pair Ruby Jade**: the red and green Bamboo sets together cover every
  Bamboo rank, so the five Bamboo pairs may use any rank.
- **Civil War**: the synopsis prints 1861 and 1865, not two identical 1861
  sets.
- **Dragonette**: the synopsis prints "GRW (one paired)", so the extra tile is
  a dragon, not an arbitrary tile.
- **Windvane**: the synopsis prints "ESWN + P/K in each suit + any Wind
  paired", confirming the 14th tile.
- **Odds & Evens / Robin**: the printed lines are complete; the readings are
  5+5+4 and 1/2/1 chows + pair.

## Still unresolved (not composition)

- Tier/exposed labels on hand pages 7-29 are cropped; the synopsis Winning
  column supplies the base value, and the exposed value is inferred from the
  hand-page label or the book's usual split.
- The page 34 prose (claims, dead-tile rule, edge cases) is half cut; the
  fishing declaration rule is implemented from the owner's authoritative
  explanation, not from the prose.
- Who pays fishing points, and whether a fishing player may still claim, are
  open in `rules/PLAY.md`.
- No synopsis hand is left without a pattern.
