# mahjong

Pure, deterministic core for the Thompson & Maloney "Chinese/Australian"
variant. Zero runtime dependencies; TypeScript runs directly on Node 24+ via
type stripping.

## Status

The hand-pattern catalogue is complete: 85 canonical patterns covering every
hand in the Full Synopsis (both columns of book pp. 56-61) plus the hands that
appear only on a scanned catalogue page. Every pattern has a positive and a
near-miss negative test. Repeated printings are deduped into one canonical id
with all page references; `big-robert-mixed` is the only `variantOf` scoring
variant. The synopsis's printed Winning/Fishing values are transcribed;
`calculate` hands keep a null point value.

- Engine: tile model, 144-tile wall, seeded RNG, hand/meld model, normalised
  shape, standard decomposition, declared fishing state, generic matcher,
  precedence scorer.
- Not started: turn engine, claims/precedence, UI, persistence.
- Sources: `rules/companion-ocr.txt` (index only), page renders in
  `rules/pages/` (tile diagrams), assumptions in `rules/ASSUMPTIONS.md`,
  unresolved/provisional notes in `rules/NOTES.md`.

## Coverage

| Book group | Patterns | Provisional | Unresolved |
|---|---:|---:|---:|
| Runs (p. 9) | 3 | 0 | 0 |
| Long Runs with Honours (pp. 10-13) | 13 | 0 | 0 |
| Short Runs (p. 14) | 4 | 0 | 0 |
| Chows (pp. 15-19) | 12 | 2 | 0 |
| Pairs (p. 20) | 2 | 0 | 0 |
| Pairs with Honours (pp. 22-24) | 6 | 0 | 0 |
| Pungs of Dragons (pp. 34-36) | 9 | 1 | 0 |
| Winds, one of each, with Pungs (pp. 28-29) | 5 | 0 | 0 |
| Winds, Pairs & Pungs (p. 30) | 4 | 0 | 0 |
| Dragons, two or more (p. 32) | 2 | 0 | 0 |
| Winds and/or Dragons with suits (pp. 38-43) | 6 | 0 | 0 |
| All Honours (pp. 44-46) | 5 | 0 | 0 |
| One Suit (pp. 48-49) | 3 | 0 | 0 |
| Three Suits (p. 60) | 2 | 0 | 0 |
| Bamboo Suit (p. 52) | 1 | 0 | 0 |
| Bamboos with Dragons (p. 54) | 3 | 0 | 0 |
| Circle Suit (p. 60) | 2 | 1 | 0 |
| Character Suit (p. 60) | 2 | 2 | 0 |
| Dragons synopsis (p. 31) | 1 | 0 | 0 |
| **Total** | **85** | **6** | **0** |

The groups that only repeat an earlier printing (Winds one-of-each with
Chows, Two Suits) add no new patterns; their page references were folded into
the canonical entries. The book's "over 120 hands" counts repeated printings
and suit-specific illustrations; this table is the unique-shape count.

## Fishing

Fishing is a **declaration**, not a way of winning: announce when one tile
from mah jong, fix the wait, and score the per-tier fishing value if another
player wins. `src/core/fishing.ts` models the declaration, the dead-tile
legality check, and settlement independent of the winner. The synopsis prints
the figures: half 200, limit 400, middle 600, double 800; `calculate` hands
have no fixed figure.

## Table checker

Type a hand from the table and see what it is. Canonical keys are `b1..b9`,
`c1..c9`, `o1..o9`, `wE wS wW wN` and `dR dG dW`; aliases `E S W N`,
`r g w`, `red green white` and the flower/season keys `f1..f4 s1..s4` are
accepted too. Parentheses mark one **exposed** meld; flowers and seasons are
reported as bonuses and never count toward the 13/14.

```sh
npm run check -- "(b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN"
```

```
14 tiles: (b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN
* 500 half  Windy Ones (exposed)
```

Thirteen effective tiles list every tile that completes a catalogue hand,
best tier first:

```sh
npm run check -- "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5"
```

```
13 tiles: dR dR dR dG dG dG dW dW dW b1 b2 b3 b5
b5  x3 left  1500 middle  Three Great Scholars (concealed) / calculate  Ordinary Mah Jong (concealed)
```

A kong adds one physical tile but still counts as one set, so a hand with a
kong is 14 effective tiles at 15 physical. Waits show `dead` instead of a
remaining count when all four copies are already visible in the input.
`--json` prints the result for another program; `--all` gives each match its
own line for a wait. With no arguments the checker reads stdin.

## Test

```sh
npm test
```

Node's built-in test runner executes the TypeScript tests directly. No install
step is required.
