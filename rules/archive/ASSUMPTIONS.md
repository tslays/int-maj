> **Superseded by `rules/RULES.md` (2026-11-04):** this document is prior
> project material. The normative framework is `rules/RULES.md` — the scanned
> *The Game of Mah Jong Illustrated* as the rubric, the Companion as supplement.
> Anything here that conflicts with it is wrong; see `rules/AUDIT.md` for the
> conflict list.

# Assumptions

Every rule below is an assumption unless it is explicitly attributed to a
source. The Illustrated book states the game and its hands; the Companion adds
hands and tiers. Only questions both books leave open are assumptions, and each
one is recorded here with the page that was checked. `rules/RULES.md` is the
framework these feed into.

## Source status

Everything below is an earlier-source transcription or implementation
assumption and is pending audit against the owner-designated primary scan.
`rules/SOURCE.md` is authoritative for source precedence. The old local page
renders and OCR are not authoritative where they conflict with the primary
PDF; a prior owner confirmation is not an exception.

## Tile set

- 144 tiles: 3 suits (bamboo, characters, circles) x ranks 1-9 x 4 copies =
  108; four winds x 4 = 16; three dragons x 4 = 12; four flowers; four seasons.
- Flowers and seasons are bonus tiles. They are held outside the hand shape and
  never participate in a pattern. Bonus scoring is not implemented in this
  pass.
- Canonical keys: `b1`-`b9`, `c1`-`c9`, `o1`-`o9`, `wE/wS/wW/wN`,
  `dR/dG/dW`, `f1`-`f4`, `s1`-`s4`.

## Wall, RNG and deal

- The wall is a fresh 144-tile set shuffled once with a seeded mulberry32 RNG.
  String seeds are hashed with xmur3. No `Math.random`, clock or I/O is used.
- A deal gives 13 tiles to each of four seats (E, S, W, N), round-robin. Flower
  and season replacement is intentionally left to the turn engine.
- Dealer rotation, prevailing wind and payments are implemented in
  `src/core/game/`; the readings the book does not state are recorded in
  `rules/archive/PLAY.md` entries 11-19 and summarised in `rules/archive/NOTES.md`.

## Hand and win representation

- `concealed` contains every unmelded tile, including the winning tile when the
  win is on a discard. Meld tiles are stored separately.
- A winning hand is 14 tiles plus one extra tile per declared kong. A kong
  counts as one set for pattern matching.
- In a seven-pairs hand, a kong counts as two pairs (standard Chinese rule).
- `selfDrawn` means the winning tile came from the wall. It is **not**
  fishing: fishing is a separate declaration (see below).
- A hand is **concealed** when no declared meld is exposed. Winning on a
  discard does not by itself make a hand exposed.
- Seat wind and prevailing wind are stored on the hand. "Own wind" patterns
  (Red Lantern, Hovering Angel, Little Brother, The Professors) read
  `seatWind`.

## Concealed and exposed pattern variants

- `tier` is the value of the pattern when the hand is concealed.
- `exposedTier` is the value when any meld is exposed.
- `exposedTier: null` means **concealed-only**: the pattern does not exist in an
  exposed form. `requiresSelfDrawn` additionally requires the winning tile to
  come from the wall.
- When a pattern has no melds at all (e.g. seven pairs), exposure cannot occur
  in a matching shape; `exposedTier` is still recorded for completeness.

## Scoring

- Tier values: half limit 500, limit 1000, middle limit 1500, double limit
  2000.
- Three hands are printed as **Calculate** (Ordinary Mah Jong, All Honour Hand,
  Purity Hand): the book defers to the calculation rules in the earlier book.
  They are modelled with `tier: "calculate"` and a null point value; no
  invented fixed score is assigned.
- Only the highest-tier matching pattern scores. Tiers are never additive.
  Equal tiers are resolved by pattern-table order, which is the documented
  precedence order.
- Fishing is **not** part of the hand score and is not derived from
  `selfDrawn`. It is a declared state: a player one tile from mah jong
  announces it, fixes the wait, and keeps that wait. If another player wins,
  each fishing player scores the fishing value for their tier — a "mini win".
  Settlement is independent of the winner's hand (`src/core/fishing.ts`).
- A fishing declaration is illegal once every copy of the needed tile is dead
  (book p. 34). `deadTiles` is supplied by the caller; a wait stays legal while
  any one of its tiles still has a live copy.
- The Illustrated book prints fishing figures as fractions of the limit:
  half 200, limit 400, double 500. `TIER_FISHING` transcribes those;
  Companion-only double hands keep their printed 800, and middle remains 600.
  `calculate` hands fish for their ground score without the Mah Jong 20.
- No payments, dealer doubling or settlement rules are implemented beyond the
  fishing mini-win.

## Pattern transcription decisions

Tier labels are read from the hand-page spreads (p07-p29). The notation is
literal:

- "LIMIT (Concealed)" with no exposed half means **concealed-only**:
  `exposedTier: null`.
- "LIMIT (Concealed) HALF LIMIT (Exposed)" means `limit` / `half`.
- "LIMIT (Exposed)" means `limit` / `limit`.
- "CALCULATE SCORE" means `tier: "calculate"` and a null point value.
- Page 9 (Run, Pung & Pair; Gates of Heaven; Confused Gates) is outside the
  scanned spreads; their notes say so. The N/I hands have no hand page and use
  the synopsis's Winning/Fishing row.

Concrete readings worth naming:

- **Ordinary Mah Jong** (p. 42): four pungs/kongs, or three pungs/kongs plus
  one chow, plus a pair. All suited tiles are in one suit; honours are allowed.
  An all-honour hand is excluded here because it is the separate All Honour
  Hand. The p. 42 hand page prints CALCULATE SCORE.
- **Wriggly Snake** (p. 10): run 1-9 in one suit + one of each wind + one extra
  tile. "Any tile paired" is the 14th tile duplicating one of the 13 existing
  tiles, not a 15th tile. The p. 10 hand page prints LIMIT (Concealed), so the
  pattern is concealed-only.
- **All Pair** (p. 22): seven pairs, all suited pairs in one suit, with winds
  and/or dragons allowed. At least one suited pair is required; otherwise the
  hand is All Pair Honours.
- **All Pair Honours** (pp. 22, 44): seven pairs of terminals and/or honours,
  following "Pairs of 1s & 9s only, Winds & Dragons only, or all combined".
- **All Honour Hand** (p. 44): four pungs/kongs plus a pair, every tile an
  honour or a terminal. The p. 44 diagram uses terminals from more than one
  suit, so no one-suit restriction is imposed; the short list's "1s and/or 9s"
  is read literally.
- **Seven Twins** (p. 22): seven pairs of anything, every tile from the wall
  including the last. Encoded as `requiresSelfDrawn: true`,
  `exposedTier: null` and no melds. **Heavenly Twins** (p. 48) is the separate
  one-suit, no-honour seven-pairs hand.
- **Three Great Scholars** (p. 33): pungs/kongs of all three dragons, plus one
  pung/kong or chow and a pair in the fourth set's suit or a wind pair. The
  hand page prints MIDDLE LIMIT (Exposed).
- **Chow Chow** (p. 15): four chows plus a pair, all in one suit, every tile
  from the wall including the last. The hand page prints HALF LIMIT
  (Concealed); no melds and a self-drawn tile encode the definition.
- **Big Robert** (p. 14): three four-tile runs, one per suit, plus a wind or
  dragon pair. Same numbers scores limit; every other combination scores half
  limit. Two mutually exclusive patterns share `variantOf`.
- **Hachi Ban** (pp. 10, 30, 32): run 1-8 or 2-9 plus three distinct pairs of
  winds or the three dragon pairs. A kong is not used: the run plus three
  pairs must total 14.
- **Dragon's Tail 1 & 2** (p. 12): one canonical pattern accepts both
  orientations (wind pung + dragon pair, or dragon pung + wind pair).
- **Corresponding dragons** (implemented): Bamboo-Green, Characters-Red,
  Circles-White, from the book's footnote. Used by Dragon's Gates and Golden
  Gates.

## Provisional readings

These patterns carry `provisional: true`. Each reading is the most conservative
composition consistent with the printed text; none invents a tile.

| Hand | Reading | Source problem |
|---|---|---|
| Moon at Bottom of Well | Four Circle chows + Circle pair; the chows include 123, 456, 789. | The p. 15 hand page is visible; "three in ascending order" read as the three ascending chows. |
| Crazy Chows | Four mixed chows + a mixed pair (same number, two suits). | p. 16 shows the four chows; "Mixed Pr" read as the Knitting pair. |
| Imperial Jade | Green Dragon set + three green-Bamboo sets (at most one 2-3-4 chow) + green Bamboo pair. | Synopsis "Three P/K (or a Chow)"; p. 36 shows three pungs. |
| White Elephant | White Dragon set + three Circle pungs + even-Circle pair. | Synopsis says only "Three P/K"; Circle Suit context. |
| Driven Snow | White Dragon set + three Character pungs + odd-Character pair. | Synopsis says only "Three P/K"; Character Suit context. |
| Dragon's Scales | Red Dragon set + three Character pungs + even-Character pair. | Synopsis says only "Three P/K"; Character Suit context. |

## Not assumed: owner-confirmed completeness

The owner confirmed that the right margin of pp. 4 and 30-32 trims only a
letter or two and that no value, hand or rule is absent there. A clipped word
on those pages is therefore read normally and does not by itself make a
pattern provisional.

## Fishing (owner-corrected, 2026-10-31)
Page 4 prints one "Fishing" entry beside each tier row, so fishing is a
per-tier value, not a single bonus. The Illustrated book prints the
figures as fractions of the limit: half 200, limit 400, double 500; a
Companion-only double hand keeps its printed 800, and middle is 600.
`calculate` hands fish for their ground score without the Mah Jong 20.

The rule is the state of needing one tile, announced. If another player then
wins, every fishing player still scores their fishing figure. The printed pages
set no dead-wait restriction and no claim ban: a player needing one tile may
take any discard to win and has precedence. This is modelled as
`FishingDeclaration { player, wait, tier, value }`, independent of the winning
hand.

## Milestone C2 — fishing payer (retained assumption)

The Illustrated book prints the fishing figures and says East pays or receives
double, but it does not name who pays a fishing player. The engine keeps the
recorded assumption: each of the three other seats pays the fishing award, with
East's payment or receipt doubled like any other score. This is an assumption,
not a printed rule; it is tracked as AUDIT A7 and must not be described as a
source reading.
