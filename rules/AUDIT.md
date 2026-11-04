# Audit — primary pages vs prior rules and engine

Milestone A scope: printed pages 4-33 and 62-63 (general play). Each row is a
conflict between the primary scan and `rules/archive/PLAY.md`,
`rules/archive/ASSUMPTIONS.md`, or the engine (`src/core/game/`, `src/core/fishing.ts`,
`src/core/score.ts`). Page numbers are printed pages; the corresponding render
is `rules/.generated/primary-pages/pNN.png`.

"Printed" is the literal reading of the page (quotes and rule numbers refer to
`rules/PRIMARY-RULES.md`). "Old / engine" is what the tree currently says or
does. The Status column records the Milestone C slice that closed the row; `open`
rows are the remaining work list.

## Conflicts

| # | Page | Printed reading | Old / engine reading | Affected code | Effect today | Status |
|---:|---|---|---|---|---|---|
| A1 | 24-26 | The ordinary hand scores a **ground score** (pungs, kongs, chows, flowers, pair/wind bonuses, 20 for Mah Jong) and is then **doubled** once per listed honour/feature; the worked example is 84 × 2^5 = 2688, capped at 1000 (R83-R92). | `scoreHand` returns the highest matching pattern's `tier`; `ordinary-mahjong` is `tier: "calculate"` with `points: null`. There is no ground-score table and no doubling. `ASSUMPTIONS.md` says "Tiers are never additive" and "no invented fixed score". | `src/core/score.ts` (`scoreHand`), `src/core/patterns/table.ts` (`ordinary-mahjong`), `src/core/game/reduce.ts` (`finishWin`, `ledgerFor`) | An ordinary winning hand scores nothing; every win is reduced to a flat special-hand tier.  **C1 closed:** score.ts ground score + doubles. |
| A2 | 21 | "All players pay the winner, who does not pay anyone." After payment, the losers expose and "settle the differences by exchanging counters" (R76). | On a discard win only the discarder pays (`from !== null` branch); on self-draw all three pay. Losers never settle against each other. `PLAY.md` #8 says "Discarder pays the winner; self-draw pays from all three". | `src/core/game/reduce.ts` (`ledgerFor`) | Discard wins are underpaid; the loser-to-loser settlement step does not exist.  **C2 closed:** all three losers pay the winner; the loser-to-loser step remains A27. |
| A3 | 21, 26 | "East Wind pays and receives double. If he loses, he pays the other players double their scores and if he wins, he receives double his score" (R77). Worked example: East pays 2000 where the others pay 1000. | The dealer's payment is doubled only in the self-draw branch (`doubled = payer === draft.dealer`). If the dealer wins, no payer is the dealer, so nothing is doubled. If East discards the winning tile, no doubling. `PLAY.md` #14 explicitly says "no dealer payer, so no doubling". | `src/core/game/reduce.ts` (`ledgerFor`) | East's receipts and payments are wrong in both directions.  **C2 closed:** East pays and receives double; worked example reproduces 2000/1000/1000. |
| A4 | 32 | At a 1000 limit, fishing scores: half-limit 200, limit 400, **double limit 500** (R69). | `TIER_FISHING`: half 200, limit 400, middle 600, **double 800**. `PLAY.md` and `ASSUMPTIONS.md` derive 40 % of the tier (200/400/600/800). | `src/core/patterns/types.ts` (`TIER_FISHING`), `src/core/fishing.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | A double-limit fishing declaration overpays by 300 per payer.  open |
| A5 | 24, 32 | The printed tiers on these pages are **half limit, limit, double limit**; no "middle limit" appears. The limit examples are 300/500/1000/500 (R93, R99). | `Tier` includes `"middle"` with 1500 points and 600 fishing. `ASSUMPTIONS.md` lists "middle limit 1500". | `src/core/patterns/types.ts` (`TIER_POINTS`, `TIER_FISHING`), `src/core/match.ts` | Any pattern marked `middle` scores a value not printed on the Milestone A pages (the p. 31 synopsis may print it; that is Milestone B).  **C1 closed:** the five Illustrated hands now use their printed tiers; `middle` remains only for Companion-only hands. |
| A6 | 32 | Fishing figures are fractions of the limit: "one-fifth of the limit", "two-fifths", "one-half". Only ordinary cleared suit, Purity, All Honour and Concealed Mah Jong use the ground score; when fishing for those, score as p. 24 "without the bonus of 20 points for going Mah Jong" (R69, R71). | Fishing is a fixed per-tier table keyed from the wait's best tier; there is no 20-point adjustment and no ground-score recomputation. | `src/core/fishing.ts` (`settleFishing`), `src/core/patterns/types.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | Fishing for an ordinary hand pays a special-hand tier figure rather than a reduced ground score.  open |
| A7 | 21-22, 32 | The source does **not** say who pays a fishing player; p. 32 only fixes the figure and says East pays/receives double (Not stated 5). | `PLAY.md` #10 and `ASSUMPTIONS.md` state "Paid by EACH of the three other players"; `ledgerFor` writes one entry from every other seat. | `src/core/fishing.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | An unprinted assumption is encoded as if it were a rule.  **C2:** retained as an explicit assumption in `rules/archive/ASSUMPTIONS.md`; payer set unchanged, East double added. |
| A8 | 21-22, 62 | Fishing/calling is the **state** of needing one tile; the player "should announce this"; a player needing one tile "may take it from any discard" and has precedence (R67, R68). No claim ban is printed. | Fishing is a `DeclareFishing` action after the player's own discard with a fixed full wait; while fishing the player may claim only mahjong (no pung, chow or claim-kong); a wait is illegal once every copy is dead. | `src/core/game/actions.ts`, `src/core/game/legal.ts`, `src/core/game/reduce.ts` (`claimOptions`, `fishingDeclarationFor`), `src/core/fishing.ts` (`isWaitAlive`) | Fishing behaves as a restrictive declaration, not the printed waiting status; the printed right to take any discard for the win is narrowed to the mahjong claim.  open |
| A9 | 18, 62 | East takes one extra tile after the others and **starts with 14**, then discards first (R40, R44). | `dealHand` gives every seat 13; `newGame` sets `phase: "draw"` and the dealer draws first. | `src/core/game/reduce.ts` (`dealHand`, `newGame`), `src/core/wall.ts` (`deal`) | The dealer's first turn is a draw rather than a discard; the 14th tile comes from the wall after the deal.  open |
| A10 | 18, 62 | Deal is four tiles at a time for three rounds (12 each), then one each, then East's extra; walls are 18 × 2 with two loose tiles set at the break (R34-R40). | One tile at a time round-robin to 13 each; single flat wall with `front`/`back`; no loose-tile reserve; kongs and bonuses draw from `back`. | `src/core/wall.ts` (`deal`), `src/core/game/reduce.ts` (`dealHand`, `drawFrom`, `replaceBonus`) | Different visible deal order and RNG sequence; no modelled loose-tile pair.  open |
| A11 | 22 | The Wind of the Round advances East → South → West → North, one per round; the game ends when all four have been round wind (R28, R32). | `dealHand` resets `prevailingWind = "E"` on every hand; there is no round transition or game end. | `src/core/game/state.ts` (`prevailingWind`), `src/core/game/reduce.ts` (`dealHand`, `nextHand`) | Wind-of-the-round bonuses can never apply beyond East; no four-round game.  open |
| A12 | 28, 62 | Chinese game: 136 tiles, two rows of 17 per wall, the last 14 tiles are dead and not drawn; mixed suits and any number of chows (R20, R35). | Always 144 tiles and the whole wall; `ordinary-mahjong` requires exactly one suit and at most one chow. | `src/core/game/reduce.ts` (`dealHand`, `advanceTurn`, `wallRemaining`), `src/core/patterns/table.ts` (`ordinary-mahjong`) | The Chinese game cannot be played: no dead wall, and mixed-suit/any-chow hands do not match the ordinary pattern.  open |
| A13 | 21, 63 | A drawn Western game is followed by a Goulash: three tiles exchanged three times, no chows, optional jokers and pool (R100-R104); tournament play omits it (R105). | No Goulash: `finishDrawn` sets a drawn result and `nextHand` redeals. | `src/core/game/reduce.ts` (`finishDrawn`, `nextHand`) | Missing procedure.  open |
| A14 | 21, 28, 63 | Drawn hand: all hands abandoned, nobody scores, tiles reshuffled, wall rebuilt. Chinese: East remains East, players add to a kitty, no Goulash; Western: East remains "for only one more hand and a Goulash is played" (R74, R75). | `finishDrawn` keeps `nextDealer: draft.dealer`; `nextHand` simply deals again. No kitty and no one-hand limitation. | `src/core/game/reduce.ts` (`finishDrawn`, `nextHand`) | Dealer repeats on every draw; no Chinese kitty, no Western one-hand rule.  open |
| A15 | 22, 63 | Penalties: too many tiles (no correction, cannot win, scores nothing), too few tiles (may score, cannot win), false Mah Jong (half-limit to each if hands exposed), discarded tiles may not be reclaimed (R80); p. 63 adds that too many tiles "pays all other players" (R81). | No penalty checks or penalty payments anywhere in the reducer. | `src/core/game/reduce.ts`, `src/core/game/state.ts` | Illegal hand sizes and false declarations are unpunished.  open |
| A16 | 22 | A discarder whose discard is visibly needed pays the other two losers' debts as well as his own, unless he was fishing or held at least three doubles (R79). | Not implemented. | `src/core/game/reduce.ts` (`ledgerFor`) | No careless-discard liability.  **C2 left out:** the page states the liability but not a mechanical trigger for "sufficient exposed tiles". |
| A17 | 22 | A player dealt no winds, dragons, pairs, pung/chow, terminals, seasons or flowers may demand a reshuffle; the others must abandon (R82). | Not implemented. | `src/core/game/reduce.ts` (`dealHand`) | No reshuffle path.  open |
| A18 | 18 | Seats are chosen by dice; highest becomes East, who selects a seat; West opposite East, South to East's right, North opposite South (R26). | Seats are fixed `E,S,W,N`; `newGame` accepts a dealer but there is no dice roll or seat selection. | `src/core/game/state.ts` (`SEATS`, `seatWindOf`), `src/core/game/reduce.ts` (`newGame`) | No seat randomisation or choice.  open |
| A19 | 21, 14 | A player with an **exposed** pung who draws the fourth tile may add it to form a kong (R56, R65). | `applyKong(..., added: true)` requires a pung with `!candidate.exposed` ("added kong needs your own concealed pung"). | `src/core/game/reduce.ts` (`applyKong`) | The printed exposed-pung-to-kong move is impossible; only concealed pungs can be extended.  open |
| A20 | 21 | If the fourth tile is added to an exposed pung, "any other player who can use this tile immediately to go Mah Jong may claim it" (R65). | `applyKong` converts the meld and immediately draws the replacement; no claim window is opened. | `src/core/game/reduce.ts` (`applyKong`, claim pipeline) | Robbing the kong is impossible.  open |
| A21 | 21 | Another player may claim a discard for a chow **only if it completes his hand** (R61); a winning hand has priority over all claims (R53, R62). | `claimOptions` refuses a chow when `completesAsChow` is true and only offers chow to `nextSeat(discarder)`; the win must be taken as a `mahjong` claim instead. | `src/core/game/reduce.ts` (`claimOptions`, `completesAsChow`, `finishWin`) | A winning chow claim is not representable; the win is scored as a concealed hand rather than as a claimed exposed chow. (The page does not settle the exposure question; Not stated 7-8.)  open |
| A22 | 14, 21 | A chow may be claimed by "the player sitting on the right of the discarder" (R60, R61). | `PLAY.md` #7 says "only from the player to your left"; the reducer allows `seat === nextSeat(discarder)` but the error text says "on your left". | `rules/archive/PLAY.md` #7; `src/core/game/reduce.ts` (`applyClaim`) | Behaviour matches the printed right-hand seat; the written rule and error message say the opposite.  open |
| A23 | 6, 30 | "Honour tiles—Winds, Dragons, and 1s and 9s of each suit"; the glossary repeats "Honour Tiles Winds, Dragons and terminals" (R2, R4, R107). | `isHonour` / `isHonourKey` return true only for winds and dragons; terminals are a separate `isTerminal`/`isTerminalKey`. | `src/core/tiles.ts` (`isHonour`, `isHonourKey`), `src/core/patterns/predicates.ts`, `src/core/patterns/table.ts` | Latent: any predicate or future scoring code that reads `isHonourKey` as "honour" will disagree with the printed classification and the ground-score table.  **C1 closed:** scoring uses honour-or-terminal; pattern predicates intentionally keep winds/dragons. |
| A24 | 24 | Settlement levels: beginners pay the winning hand only; intermediate also fishing hands; advanced pays all hands (R94). | Always winner plus fishing declarations; no setting and no all-hand settlement. | `src/core/game/reduce.ts` (`ledgerFor`) | The printed advanced mode is unavailable.  **C2 left out:** a losing 13-tile hand has no printed score to settle. |
| A25 | 30, 63 | Special hands are optional and must be agreed; tournament play uses at most fourteen, removes jokers/flowers, passes East every hand, sets the limit at 1000, and bans repeating the same special hand more than twice (R105, R106). | The full pattern table is always active; no tournament options; normal dealer rotation. | `src/core/patterns/table.ts`, `src/core/game/reduce.ts` (`newGame`) | No way to play the printed tournament or agreed-special-hands variants.  open |
| A26 | 24, 32 | Flowers and seasons score 4 points each (R84), own flower/season give doubles (R88), and a bouquet drawn while fishing a special hand pays 1000 from each other player (R72). | Flowers and seasons are stored on `PlayerState` but never read by scoring. `ASSUMPTIONS.md` says "Bonus scoring is not implemented in this pass." | `src/core/game/reduce.ts` (`addBonus`), `src/core/score.ts` | All flower/season and bouquet scoring is absent.  **C1 closed:** flower/season points and bouquet doubles score; the fishing-time bouquet payment (C p. 32) stays open for C5. |
| A27 | 21 | The winner is paid first; the winner pays nobody; losers then settle their own differences (R76). | The ledger pays the winner and fishing players only; losers never exchange. | `src/core/game/reduce.ts` (`ledgerFor`) | No loser settlement (the second half of R76).  **C2 left out:** the book does not define how a 13-tile losing hand is scored; winner-first and winner-pays-none are implemented. |

## Unsupported by these pages, not contradicted

These prior statements are not conflicts on pages 4-33/62-63, but they have no
printed support in this slice and must be re-checked in Milestone B:

- `ASSUMPTIONS.md`: "In a seven-pairs hand, a kong counts as two pairs."
- `ASSUMPTIONS.md`: "A hand is concealed when no declared meld is exposed;
  winning on a discard does not by itself make a hand exposed." The printed
  definition of exposed tiles (R83) is compatible but does not address a
  winning chow claim.
- `PLAY.md` #12/#13 (full wait set, highest announced tier): the pages say only
  that a fishing player should announce; they do not define the announcement.
- `PLAY.md` #15-#19 (claim-window mechanics, no-replacement kong, bonus
  exhaustion, claimed-discard bookkeeping): these are implementation decisions
  the pages do not state.
- `ASSUMPTIONS.md`: the half/double point values 500/2000 are arithmetic from
  the printed 1000 limit, not printed as such on these pages.
- `PLAY.md` #1-#6: tile set, flower handling, kong replacement end, no minimum,
  claim precedence, chow eligibility — the pages support these readings
  (subject to A22's direction wording).

## Checked and consistent

These primary rules match the current engine and need no change:

- 144-tile composition (R1-R8) — `src/core/tiles.ts` builds the same set.
- Flowers/seasons are bonus-only and replaced immediately (R11, R41, R42) —
  `replaceBonus` / `dealHand`.
- Kong counts as three tiles for hand size (R55, R57) — `effectiveCount`
  subtracts one per kong.
- Claim precedence win > pung/kong > chow, nearest winner (R62) —
  `resolveClaims` priority and distance.
- A pung/kong claim must be immediate; an unclaimed discard is dead (R24, R52)
  — the claim window enforces it.
- Turn order East, South, West, North; seats between discarder and caller lose
  their turn (R44, R47) — `advanceTurn` and claim resolution.
- No draw until the previous discard (R46) — phase machine.
- Pair only for the win (R22) — `claimOptions` offers no pair claim.
- A claimed discard is public (R48) — it joins the exposed meld.
- Winner shows 14 tiles and makes no discard (R23) — `finishWin` ends the hand.

---

# Catalogue audit (Milestone B)

Source: the illustrated hands on printed pp. 34-58 and the two unnumbered
hands on p. 30; score lines from those pages; cross-checked against the
synopsis (pp. 60-61) and the p. 50 summary. Compositions and tiers are in
`rules/PRIMARY-HANDS.md`.

Every entry in `src/core/patterns/table.ts` is classified once:

- **verified** — the table's composition and score match the printed hand;
- **corrected** — the table has the hand but a composition, tier, exposure or
  score representation must change;
- **missing** — printed in the primary book but absent from the table;
- **not printed in this book** — a Companion-side entry; it stays as the
  supplement (do not delete it).

Counts: **38 verified, 12 corrected, 3 missing, 35 not printed** (85 table
entries + 3 missing primary hands).

## Verified (38)

| Table entry | Name | Primary hand | Page |
|---|---|---|---:|
| `wriggly-snake` | Wriggly Snake | 10 | 38 |
| `all-pair` | All Pair | 4 | 34 |
| `run-pung-pair` | Run, Pung & Pair | 6 | 36 |
| `gates-of-heaven` | Gates of Heaven | 5 | 36 |
| `hachi-ban` | Hachi Ban | 48 | 57 |
| `five-odd-honours` | Five Odd Honours | 47 | 56 |
| `dragons-tail` | Dragon's Tail (1 & 2) | 36 | 52 |
| `gretas-garden` | Greta's Garden | 21 | 43 |
| `gretas-dragon` | Greta's Dragon | 22 | 43 |
| `red-lantern` | Red Lantern | 31 | 48 |
| `gerties-garter` | Gertie's Garter | 7 | 37 |
| `windy-chow` | Windy Chow | 18 | 41 |
| `chop-suey` | Chop Suey | 51 | 58 |
| `chow-mein` | Chow Mien | 50 | 58 |
| `knitting` | Knitting | 8 | 37 |
| `triple-knitting` | Triple Knitting | 9 | 37 |
| `all-pair-honours` | All Pair Honours | 13 | 38 |
| `dragons-breath` | Dragon's Breath | 37 | 53 |
| `windfall` | Windfall | 38 | 53 |
| `windy-ones` | Windy Ones | 19 | 42 |
| `windy-nines` | Windy Nines | 20 | 42 |
| `all-pair-ruby-jade` | All Pair Ruby Jade | 27 | 46 |
| `green-jade` | Green Jade | 44 | 56 |
| `red-coral` | Red Coral | 45 | 56 |
| `white-opal` | White Opal | 46 | 56 |
| `imperial-jade` | Imperial Jade | 25 | 44 |
| `lily-of-the-valley` | Lily of the Valley | 26 | 44 |
| `ruby-jade` | Ruby Jade | 28 | 46 |
| `red-lily` | Red Lily | 30 | 46 |
| `royal-ruby` | Royal Ruby | 29 | 46 |
| `unique-wonder` | Unique Wonder | 12 | 38 |
| `windy-dragons` | Windy Dragons | 32 | 48 |
| `all-winds-and-dragons` | All Winds and Dragons | 33 | 48 |
| `heads-and-tails` | Heads and Tails | 15 | 40 |
| `heavenly-twins` | Heavenly Twins | 3 | 34 |
| `dragonfly` | Dragonfly | 17 | 40 |
| `three-sisters` | Three Sisters | 43 | 55 |
| `seven-brothers` | Seven Brothers | 42 | 55 |

Note: `chow-mein` is spelled `Chow Mien` in the table; the printed hand is
CHOW MEIN (p. 58). Spelling only; composition and tier match. `gates-of-heaven`
and `run-pung-pair` carry a correct composition but stale Companion page
citations (p. 9); the primary pages are 36 and 36.

## Corrected (12)

| Table entry | Primary hand / page | Printed reading | Current table reading | Change |
|---|---|---|---|---|
| `ordinary-mahjong` | 1 / p. 34 | Score: "See score-sheet, pp. 24 and 25". Name ORDINARY HAND. | `tier: "calculate"`, `exposedTier: "calculate"`, null points; cites p. 42. | Keep the composition. Replace the flat `calculate` placeholder with the ground-score + doubles path (AUDIT A1); retitle/cite p. 34. |
| `purity-hand` | 2 / p. 34 | Score: "THREE DOUBLES PLUS EXTRAS (see score-sheet)". | `calculate`/`calculate`. | Keep the composition (one suit, no honours, four pungs/kongs or three plus a chow). Score is a doubling hand, not a flat null. |
| `all-honour-hand` | 14 / p. 38 | Score: "THREE DOUBLES PLUS EXTRAS (see score-sheet)". A Pair of Honours; this book classes terminals as honours (p. 6, p. 30). | `calculate`/`calculate`. | Score is a doubling hand, not a flat null. Composition matches (four pungs/kongs of terminals/honours, pair of terminals or honours). |
| `three-great-scholars` | 34 / p. 49 | LIMIT. "A limit is scored for any hand containing the Three Great Scholars" (pungs of all three dragons). | `middle`/`middle` (1500). | Change both tiers to `limit`; the all-dragon-pungs rule is also a global limit condition on any other hand containing them. Composition matches. |
| `four-blessings` | 35 / p. 49 | LIMIT. "A limit is scored for any hand containing Pungs of each Wind." | `middle`/`middle` (1500). | Change both tiers to `limit`; the all-wind-pungs rule is also a global limit condition. Composition matches. |
| `civil-war` | 39 / p. 53 | DOUBLE LIMIT. | `middle`/`middle` (1500). | Change both tiers to `double`. Composition matches (NNN, SSS, 1-8-6-1 one suit, 1-8-6-5 another). |
| `chinese-odds` | 16 / p. 40 | LIMIT. | `middle`/`middle` (1500). | Change both tiers to `limit`. Composition matches (four odd pungs + odd pair, one suit). |
| `sparrows-sanctuary` | 23 / p. 44 | LIMIT. | `middle`/`null`. | Change `tier` to `limit`. Composition matches (1B×4 + pairs 2,3,4,6,8). |
| `confused-gates` | 49 / p. 57 | LIMIT, "Concealed (except last tile)". | `limit`/`limit`. | Change `exposedTier` to `null`. Composition matches (1s pung, 9s pung, 2-8 run in three different suits, one run tile paired). |
| `red-waratah` | 40 / p. 54 | LIMIT / HALF LIMIT (Pungs from discard). | `limit`/`limit`. | Change `exposedTier` to `half`. Composition matches (中×3, 發×2, red-Bamboo ×3, Circles ×3, Characters ×3). |
| `lillypilly` | 41 / p. 54 | LIMIT / HALF LIMIT (Pungs from discard). | `limit`/`limit`. | Change `exposedTier` to `half`. Composition matches (發×3, 白×2, 4C/8C/9C pungs). |
| `all-pair-jade` | 24 / p. 44 | "6 Pairs of green Bamboos (2,3,4,6 and 8). At least one Pair of Green Dragons." Illustration: 6 bamboo pairs (4B twice) + 發 pair. | Allows either 6 bamboo + 1 Green Dragon pair or 5 bamboo + 2 Green Dragon pairs. | Restrict to the printed 6 + 1 shape. The 5 + 2 variant is not printed; if kept, it needs an explicit assumption. |

## Missing from the table (3)

| Primary hand | Page | Printed composition and score | Where it belongs |
|---|---:|---|---|
| 11. CONCEALED MAH JONG (BURIED TREASURE) | 38 | Any one suit; as many chows or pungs as desired, may include Winds, Dragons or both and a Pair; every tile from the wall including the last; no Kongs; score "10 POINTS FOR NON-SCORING HAND" (synopsis: 2 doubles and extras). Illustration: 234, 345, 678, 678 Characters + 99 Characters. | New pattern, concealed/self-drawn, distinct from `ordinary-mahjong` and `seven-twins`. |
| ALL KONG | 30 | Four Kongs and one Pair, all in one suit; Winds, Dragons or both may be included. Score: Limit. No illustration. | New pattern (four kongs + pair, one suited suit, honours allowed).  open |
| MIXED PUNG | 30 | Four Pungs and a Pair in any of the three suits; Winds, Dragons or both may be included; every tile including the last from the wall. Score: Limit. No illustration. | New pattern (four pungs + pair, any suits, honours allowed, self-drawn). |

## Not printed in this book (35) — Companion supplement

These entries have no printed counterpart in the primary book. They stay in the
table as the supplement; none is deleted.

| Table entry | Name | Note |
|---|---|---|
| `chow-chow` | Chow Chow | Four chows + pair, one suit, all from the wall. Not among the 51 printed hands (hand 11 permits any chows but is not this pattern). |
| `guardian-winds` | Guardian Winds | Run 1-9 + wind pung + wind pair. |
| `wriggly-dragon` | Wriggly Dragon | Run 1-9 + one each dragon + dragon pair. |
| `guardian-dragons` | Guardian Dragons | Run 1-9 + dragon pung + dragon pair. |
| `grand-sequence` | Grand Sequence | Run 1-9 + honour pung + suited pair. |
| `dragons-gates` | Dragon's Gates | Run 2-8 + terminal pung + dragon pung + pair. |
| `dragons-teeth` | Dragon's Teeth | Red/White dragon pungs + runs. |
| `yin-yang` | Yin Yang | Fixed chow/pair shape. |
| `big-robert` | Big Robert | Four-tile runs in each suit, same numbers. |
| `big-robert-mixed` | Big Robert (mixed numbers) | Half-limit variant of Big Robert. |
| `moon-at-bottom-of-well` | Moon at Bottom of Well | Four Circle chows + pair. |
| `three-philosophers` | Three Philosophers | Three suit chows + mixed chow + pair. |
| `crazy-chows` | Crazy Chows | Four mixed chows + mixed pair. |
| `little-robert` | Little Robert | Suit chows + pung + pair. |
| `hovering-angel` | Hovering Angel | Suit chows + own-wind pung + pair. |
| `little-brother` | Little Brother | Suit chows + own-wind pair. |
| `apple-blossom` | Apple Blossom | Mixed chows + White Dragon pung + Green pair. |
| `professors` | The Professors | Mixed chows + dragons + own-wind pair. |
| `seven-twins` | Seven Twins | Seven pairs any tiles, all from the wall. |
| `dragonette` | Dragonette | Three suit pairs + winds + dragons. |
| `windvane` | Windvane | Winds + one pung per suit. |
| `golden-gates` | Golden Gates | Corresponding dragon + terminal pung + even pairs. |
| `sunrise` | Sunrise | East Wind + White pair + suit pungs. |
| `sunset` | Sunset | West Wind + Red pair + suit pungs. |
| `ods-evens` | Odds & Evens | All odds in two suits + evens in the third. |
| `robin` | Robin | Chow distribution across suits. |
| `blue-mountains` | Blue Mountains | Green Dragon + three Circle pungs + blue-Circle pair. |
| `white-elephant` | White Elephant | White Dragon + three Circle pungs + even-Circle pair. |
| `driven-snow` | Driven Snow | White Dragon + three Character pungs + odd-Character pair. |
| `dragons-scales` | Dragon's Scales | Red Dragon + three Character pungs + even-Character pair. |
| `up-you-go` | Up You Go | Winds + 2,44,666,8888 one suit. |
| `down-you-go` | Down You Go | Winds + 2222,444,66,8 one suit. |
| `numbers-in-parallel` | Numbers in Parallel | Wind/dragon pung + matching-number pungs. |
| `numbers-doubled` | Numbers Doubled | Two numbers doubled across suits. |
| `dragons-run` | Dragon's Run | Run 1-9 + one each dragon + wind pair. |

## Catalogue check

- Every numbered hand 1-51 is accounted for exactly once above; hands 11,
  All Kong and Mixed Pung are the three missing entries.
- The table's Companion page citations (pp. 9-60) are left as they are; this
  audit adds the primary page. A later pass can re-cite them, but no entry was
  deleted.
- `rules/PRIMARY-HANDS.md` records the printed ambiguities (hand 8's repeated
  rank, hand 24's pair count, hand 25's chow option, hand 11's two score lines,
  All Kong's one-suit wording).

---

# Part III — Companion vs primary

The Companion is a supplement; where it contradicts the Illustrated book, the
Illustrated reading governs and the Companion sentence is not applied. These
are the contradictions found while writing Part III of `rules/RULES.md`.

| # | Companion page | Companion reading | Illustrated / Part I reading | Resolution |
|---|---|---|---|---|
| C1 | C p. 62 | "A Goulash should not be played after a hand in which no player wins." | I p. 21: a drawn hand is shuffled, the wall rebuilt and "a Goulash is played" (Part I R74). | Illustrated wins. The Companion sentence is omitted from Part III. |
| C2 | C p. 62 | "Players may not win with the same hand in consecutive games." | I p. 63 / Part I R105: the same Special Hand is barred only after "more than two consecutive turns". | Illustrated wins. Part III does not adopt the stricter Companion limit. |
| C3 | C p. 63 | A player may "save the Bouquet and take three doubles" instead of the immediate bonus. | I p. 32 / Part I R72: each other player "immediately gives this player one 1000-point counter and the four tiles are turned face down". | Illustrated wins; the saving option is omitted. |
| C4 | C p. 63 | "In the Western game, awarding a double for all tiles of the one suit should not be allowed." | I p. 25: (f) one suit with Winds/Dragons is a double, and (j) all one suit is three doubles (Part I R25, R91). | Illustrated wins; the Companion restriction is omitted. |
| C5 | C p. 55 | "East Wind is played only once by each player (whether they win or not), so there are only four hands in the round." | I p. 21 / Part I R30: East remains East after a win. | Illustrated wins; the once-only round is omitted. |
| C6 | C p. 55 | "No double is awarded for all one suit when fishing, as the hand is incomplete." | I p. 32 / Part I R71: a fishing ordinary hand is scored as pp. 24-25 "without the bonus of 20 points for going Mah Jong" — no other double is removed. | Illustrated wins; the extra subtraction is omitted. |
| C7 | C p. 64 | "A player may declare a Pung or Chow, then change that call and draw from the wall. No penalty is applied provided that no discard has been made." | I p. 21 / Part I R52: after a Pung the caller "must then make a discard, unless going Mah Jong"; R46 forbids drawing before the previous discard. | Illustrated wins; the change-and-draw sentence is omitted. The rest of the p. 64 incorrect-meld and too-hasty-draw rules are adopted in Part III §3.5. |
| C8 | C pp. 30, 52, 58, 59 | Middle limit 1500 for Three Great Scholars, Four Blessings, Civil War, Chinese Odds and Sparrow's Sanctuary. | I pp. 40, 44, 49, 53: Chinese Odds LIMIT; Sparrow's Sanctuary LIMIT; Three Great Scholars LIMIT; Four Blessings LIMIT; Civil War DOUBLE LIMIT (Part II). | Illustrated wins. Those five hands stay at the Part II tier; middle is used only by the four Companion-only hands (Part III §1). |
| C9 | C p. 4 | Double-limit fishing = 800 ("two-fifths of a Double Limit"). | I p. 32 / Part I R69: double-limit fishing = 500. | Illustrated 500 governs every hand the Illustrated prints. The Companion's 800 is used only for the two Companion-only double-limit hands (Up You Go, Down You Go), as their printed supplement figure. |

## Table corrections settled by the Companion pages

- `dragonette` (C p. 24): the paired honour may be **a Wind or a Dragon**
  ("Any Wind or Dragon paired"; the synopsis says "ESWN + GRW (one paired)",
  C p. 58). The table's `singleGroup(isDragon)` is too narrow; change it to
  accept a wind or a dragon.
- `down-you-go` (C p. 57): the note text says the "8888" kong, but the printed
  hand is 2222 (the predicate already uses 2222). Text-only fix.
- `moon-at-bottom-of-well` (C pp. 15, 47): four Circle chows, three in
  ascending order, plus a Circle pair; the table's reading is confirmed and
  its `provisional` flag can be cleared.
- `crazy-chows` (C p. 16): the pair is 6B + 6C, confirming the table's mixed
  pair; `provisional` can be cleared.
- `white-elephant`, `driven-snow`, `dragons-scales` (C p. 60): the pair
  restriction and three pungs are printed; the table's compositions match and
  the `provisional` flags can be cleared.
- `grand-sequence` (C pp. 11, 40): "any two tiles 1-9 paired" is a suited pair
  (the two extra tiles form the hand's pair), which the table already requires.

No Companion-only hand needs a tier change: all 35 table tiers match the
printed winning/fishing figures. The only tier conflicts are the Illustrated
hands in C8/C9.
