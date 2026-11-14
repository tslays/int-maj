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
- **Seven Twins, kongs** (owner ruling): a four-of-a-kind counts as two pairs, as in the other seven-pairs hands. The Companion page is silent. Tested in `test/core/seven-twins.test.ts`.
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

**Superseded 2026-11-09:** the printed pages do give the mechanism (I p. 21 #24:
the winner pays no-one and the losers settle the differences; p. 24: the
Intermediate level scores fishing hands). The engine now pays a fishing hand
from the other two losers as a difference, not from all three seats; see
`rules/RULES.md` R-070 and AUDIT A7.

## Milestone C6 — round and table rulings (checked pages)

- A drawn Western hand repeats East once and marks the next hand as a
  Goulash (I p. 21, p. 63). The three-tile exchange is not implemented: the
  page does not say which three tiles a player chooses, so no exchange rule is
  invented. Jokers and the pool remain optional table agreements (I p. 21).
- The Chinese drawn hand keeps East and adds a kitty stake (I p. 28); the
  kitty is counted, not paid out.
- Hand-size penalties and a false Mah Jong have no trigger in the legal-action
  model: the reducer never lets a hand reach 13/15 effective tiles or declare
  an incomplete win. A discarded tile is already unclaimable (I p. 21-22).
- A reshuffle demand (I p. 22) has no printed deal algorithm, so the engine
  does not offer a redeal action.
- Tournament hand-count and repeat-history limits (I p. 63) are table-level
  bookkeeping, not engine state.

## Showing the fish (2026-11-08)

*Illustrated* p. 21 (§22 "Fishing or calling") names the state of needing one
tile; it prints no announcement and nothing about telling the wait. *Companion*
p. 55 ("Interesting ideas suggested by experienced players", 2): "Many players
display a small fish (not real!) to indicate that they are fishing; this must
be done if a fishing score is to be claimed."

Narrowest reading kept by the engine: a fishing player may show the fish
(`DeclareFishing`) or not (`Pass`). Showing it is what makes the fishing figure
payable. The table learns only that the seat is fishing: `viewFor` gives other
seats the seat alone, and `describeEventFor` prints "S is fishing" without the
wait. The fixed wait stays with the fishing player for settlement.

Uncertainty: the Companion offers this as an idea from experienced players, not
as a printed law; the primary book is silent. Before this date the engine
published every fishing wait to the whole table, which neither page prints.

## Careless discard (2026-11-08)

*Illustrated* p. 22, Penalties 5: "If a player has a sufficient number of
exposed tiles to indicate the tile needed to complete his hand and another
player discards that tile, the player responsible for that discard must pay
not only his debt to the winner, but also those of the other two losers. This
rule does not apply if the player discarding the winning tile was also Fishing
or holding at least three doubles."

The page does not say how many exposed tiles are "sufficient" or what they
must show. Narrowest reading (`exposureIndicates` in
`src/core/game/reduce.ts`): the winner has three or more exposed sets and all
suited tiles in them are of one suit, which shows a one-suit hand; the
indicated tiles are that suit and the honours (only the honours when every
exposed set is of honours). Fewer than three exposed sets, or exposed sets in
two suits, indicate nothing. The engine previously keyed the penalty on an
announced fishing wait; p. 22 speaks only of exposed tiles.

## Wall draw animation: the break, the loose tiles and the replacement block (2026-11-09, redone)

Read on the page (*Illustrated* printed pp. 18-19 = `rules/pages/illustrated/p10.jpg`,
the "Detail of South wall" diagram zoomed; p. 62 = `p32.jpg`):

- Diagram: right of the lifted stack ("10", crossed box) the bottom row is
  numbered 9..1 from the break to the far right end ("COUNT TEN"); the top
  row is numbered 1..7 counted from the break; the two loose tiles are drawn
  on top of the 2nd and the 7th of the top row. So the two lifted tiles lie on
  the 2nd and 7th stacks right of the break: those stacks are 3 high.
- Rules 5-6 (p. 19 table): the wall to break is 5 or 9 East, 2/6/10 South,
  3/7/11 West, 4/8/12 North, counted anticlockwise from East.
- Rule 6: the builder "counts the tiles from the right-hand side until the
  same number ... is reached - these two tiles are removed and placed face
  downwards on top of the second and seventh tiles on the right side of the
  break. They are now known as the loose tiles."
- Rule 7: loose tiles replace tiles taken for Kongs, Flowers and Seasons.
  "When each two are used, starting with the tile further from the break, two
  more tiles are taken from the end of the wall to the right of the break, and
  positioned on top of the wall as replacements." p. 62: "As the two loose
  tiles are used they are replaced."
- Rule 8 / p. 62: the deal is taken "from the left side of the opening"; p. 19
  "the next tile from the top row". So the open end is left of the break, the
  upper tile of a stack goes before the lower.

This agrees with the owner's six rules (issue #48, confirmed 2026-11-09): the
block right of the break never moves; replacements come from its far (corner)
end; ordinary draws run left, stacks vanish in place; no tiles are left over
(Illustrated p. 62: the last-14 rule is the Chinese game only).

The book is silent on, and the app assumes (narrowest reading):
(1) the engine throws no break dice, so the app throws two from the hand's key
(`breakFor`), purely for the look; the engine's draw order is unchanged and
its counts (`front`, `remaining`, `loose`) are what the picture follows.
(2) SUPERSEDED by ruling 2 below (#60): the replacements come from the end
that touches the break, not the far corner end.
(3) SUPERSEDED by the owner's ruling below: the loose tiles no longer lie on
the 2nd and 7th stacks.
(4) SUPERSEDED: replacements and ordinary draws now meet in the ring. (Was: if
replacements outrun the block, they go on at the far end of the
ordinary run, so every tile is used.)
(5) SUPERSEDED, see the ruling below.

**Owner rulings on presentation (issues #56 and #60, 2026-11-09).** The book's
detail diagram (I p. 19) and rule 6 put the two loose tiles on the 2nd and 7th
stack right of the break; rule 7 says the two more tiles come "from the end of
the wall to the right of the break". The owner's table practice differs, and
the printed rule is not changed:

1. Both loose tiles lie on ONE column of the dead wall (#56): 4 high (2 + 2)
   at the start, 3 high after one replacement; after the second the plain
   two-tile column is lifted onto its neighbour, which becomes 4 high (these
   two are rule 7's "two more tiles ... positioned on top"), and so on: the
   marker is the column floor(r / 2) in, extra height 2 - (r mod 2), r =
   replacements taken. Only that column is 3 or 4 high.
2. Which end (#60): the owner reads "the end of the wall to the right of the
   break" as the end that TOUCHES the break. The marker therefore starts on
   the dead-wall column next to the break and moves away from it, along the
   wall, round the corner onto the next wall and on. Earlier (PR #55 and #59)
   the owner had picked the far, corner end of the block; that was not what
   they meant and is withdrawn. Ordinary draws are unchanged (open end, left of
   the break, upper tile then lower) and arrive at the other end of the dead
   wall, so every tile is used.

The tiles drawn, their count and their order are the engine's and are the same
either way, so this is presentation only.

## Seat selection: a tied highest throw (2026-11-12)

**Source (I p. 18, rule 1):** "The four players in turn throw two dice. The
highest total leads the game and becomes East Wind." Rule 5 and the page 19
table use the same two-dice throw for the wall. The page is silent when two or
more players tie for the highest total.

**Assumption.** A tie for the highest total is thrown again, by all four
players, until one total is highest (`rollForSeats` in `src/core/game/deal.ts`).
Owner ruling (2026-11-12): re-throwing on a tie is fine where nothing is
written. Every throw is kept so the opening can show the dice, and the last one
decides. The web table now plays this for every new game (you keep your place at the bottom; the dice decide who is East and so your
wind), where it used to deal to you as East; the seed fixes the throw, so a
saved game or report replays to the same East. Any other tie-break (only the
tied players throw again) would change nothing else.

## No half-limit hands in a Goulash (2026-11-13)

*Companion* p. 55 ("Interesting ideas suggested by experienced players", 5),
read on the page: "No half-limit hands are permitted during a Goulash." The
*Illustrated* (p. 21, R100-R104) prints no such limit. The owner made it a
house rule, on by default, after tester report #119.

Narrowest reading kept by the engine:

- "Half-limit hands" are hands that score at the half-limit tier as the hand
  stands. The bar is on the tier, not the name: a hand printed "LIMIT
  (Concealed) HALF LIMIT (Exposed)" is allowed concealed and barred exposed.
  Limit and double-limit hands stay allowed; the sentence names half limit only.
- "Not permitted" means the hand is no win; tiles that also make another hand
  (an ordinary hand, or a higher one) score as that hand, as with the hand
  sets. A wait that only completes a half-limit hand is no wait, so it is no
  fishing hand and earns no fishing figure.
- It applies to Goulash hands only (`state.goulash`), and it is fixed at the
  deal like the hand sets: the token `rule:goulash-no-half-limit` rides in
  `excludedHands`, and `exclusionsOf` turns it into `tier:half` for a Goulash
  hand. A hand dealt before the rule existed carries no token and plays
  without it.

Uncertainty: the Companion offers it as an idea, not a printed law, and does
not say whether a barred hand may still go out as an ordinary hand; the
narrowest reading lets the tiles count as whatever else they make.

## A win needs the fish shown (2026-11-13)

A tester asked that a player be required to declare fishing in order to win
(report #118). Neither book prints this: *Illustrated* p. 21 only names the
fishing state, and *Companion* p. 55 (idea 2) asks for the fish only "if a
fishing score is to be claimed". The default therefore stays with the books:
no announcement is needed to go out. The owner made the tester's version a
house rule, off by default.

Narrowest workable reading kept by the engine (`mayGoOut`,
`src/core/game/hands.ts`):

- A seat is offered the announcement after a discard that leaves it one tile
  from Mah Jong (the `announce` phase); the engine records the offer
  (`fishOffered`).
- A seat that was offered it goes out (on a discard, from the wall, or by
  robbing a kong) only once it has shown the fish.
- A seat never offered it had no chance to announce, so it may go out: a hand
  complete or waiting straight from the deal or a Goulash. Without this
  exemption the rule would make such hands unwinnable, which no player would
  agree to.
- Bots show the fish as soon as they are offered it under the rule.

Uncertainty: the tester's sentence does not say what happens to a player who
kept quiet and later changes the wait; the reading here bars the win until the
fish is shown at a later offer.


## The score sheet: how it is read (2026-11-14)

*Illustrated* pp. 24-26 (printed; scan `rules/pages/illustrated/p13.jpg` and
`p14.jpg`). The sheet is read as printed; where a line can be read two ways
the narrowest reading is recorded here, and each is a test in
`test/core/scoring-sheet.test.ts`, `scoring-oracle.test.ts` or
`scoring-game.test.ts`.

1. **Doubles are counted once.** Lines (j) and (k) say "add one double for
   each" own Season, own Flower and no Chows, and "add one double for each a,
   b, c, d, e (as above) and cleared suit". Line (k) also says it "includes
   one double for all Pungs", and the Bouquets say they include the own tile's
   double. Read together, these restate which doubles an all-one-suit or
   honours-only hand keeps; they do not pay a second double for a feature the
   general lines (a)-(g) already pay. So a Purity hand with no chows is three
   doubles plus one, not plus two; an honours-only hand is three doubles plus
   (a)-(e) once, plus the cleared suit once, and no separate no-chows double.
   The engine used to count them twice. Uncertainty: the page never says
   "not again"; the other reading (a double for own Season in both (d) and
   (j)) would pay a Purity hand twice for a feature an ordinary hand is paid
   once for, which no line suggests.
2. **A pung finished by a discard is exposed.** p. 24: "Exposed tiles are those
   which have been taken from discards"; "Concealed tiles are those concealed
   when all the tiles on the rack have been drawn from the wall." A pung
   completed by the winning tile when that tile came off a discard scores as an
   exposed pung (2/4), not a concealed one (4/8). A kong cannot be finished by
   a win; a chow scores nothing either way.
3. **The best reading counts.** A tile can complete a pung, the pair or a chow
   (4 4 4 + 4 5 6), and a set of tiles can be read more than one way
   (222 333 444 as pungs or chows). The player scores the reading that pays
   most; for an ordinary hand a reading holds at most one chow (p. 14). The
   page says nothing about choosing; taking the player's best is the only
   reading that does not pay a hand less than it is.
4. **(e), "the only possible places".** The engine reads it from the p. 25
   diagram: the far end of a chow's pair (the 3 of 1-2-3, the 7 of 7-8-9) and
   the middle (the 5 of 4_6). A two-sided wait (4 5 waiting on 3 or 6) is not
   in the diagram and scores nothing. (g), completing the pair, is paid for any
   pair finished by the winning tile, as the line reads.
5. **(d), claiming East's first discard.** The engine records the seat that
   claimed the first discard of the hand (any claim: pung, kong, chow or Mah
   Jong) and adds the 2 to that seat's ground score. Before this it never
   awarded (d).
6. **Robbing the kong** is the (h)(iii) double, once, with a loose tile or the
   last tile counting as the same single double. The engine now passes it; it
   never did.
7. **The 10-point hand.** "10 points for non-scoring hand" is paid only when
   every reading of the tiles is four chows and a worthless pair. A hand that
   can also be read with a pung scores by that reading.
8. **Which hand pays.** Of the printed hands the tiles make, the one with the
   highest score pays; a calculated hand competes by its calculated score
   (capped at the limit), so a half-limit hand no longer hides an ordinary
   hand that scores more.
9. **A suited pair is "one suit".** p. 34: "Any one suit ... May include
   Winds, Dragons or both." Four sets of Winds and Dragons and a pair of
   2 Bamboos is that hand; the matcher used to require a suited *set*, so the
   hand could not go out at all.

Not changed, for the owner to rule on (see `rules/AUDIT.md`, "Scoring review"):
the Advanced settlement scores a losing hand by its ground score alone, and a
fishing hand for an ordinary hand is scored as though the missing tile were
drawn from the wall.
