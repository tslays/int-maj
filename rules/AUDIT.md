# Audit — primary pages vs prior rules and engine

Milestone A scope: printed pages 4-33 and 62-63 (general play). Each row is a
conflict between the primary scan and `rules/PLAY.md`,
`rules/ASSUMPTIONS.md`, or the engine (`src/core/game/`, `src/core/fishing.ts`,
`src/core/score.ts`). Page numbers are printed pages; the corresponding render
is `rules/primary-pages/pNN.png`.

"Printed" is the literal reading of the page (quotes and rule numbers refer to
`rules/PRIMARY-RULES.md`). "Old / engine" is what the tree currently says or
does. Nothing in this slice was changed; this is the Milestone C work list.

## Conflicts

| # | Page | Printed reading | Old / engine reading | Affected code | Effect today |
|---:|---|---|---|---|---|
| A1 | 24-26 | The ordinary hand scores a **ground score** (pungs, kongs, chows, flowers, pair/wind bonuses, 20 for Mah Jong) and is then **doubled** once per listed honour/feature; the worked example is 84 × 2^5 = 2688, capped at 1000 (R83-R92). | `scoreHand` returns the highest matching pattern's `tier`; `ordinary-mahjong` is `tier: "calculate"` with `points: null`. There is no ground-score table and no doubling. `ASSUMPTIONS.md` says "Tiers are never additive" and "no invented fixed score". | `src/core/score.ts` (`scoreHand`), `src/core/patterns/table.ts` (`ordinary-mahjong`), `src/core/game/reduce.ts` (`finishWin`, `ledgerFor`) | An ordinary winning hand scores nothing; every win is reduced to a flat special-hand tier. |
| A2 | 21 | "All players pay the winner, who does not pay anyone." After payment, the losers expose and "settle the differences by exchanging counters" (R76). | On a discard win only the discarder pays (`from !== null` branch); on self-draw all three pay. Losers never settle against each other. `PLAY.md` #8 says "Discarder pays the winner; self-draw pays from all three". | `src/core/game/reduce.ts` (`ledgerFor`) | Discard wins are underpaid; the loser-to-loser settlement step does not exist. |
| A3 | 21, 26 | "East Wind pays and receives double. If he loses, he pays the other players double their scores and if he wins, he receives double his score" (R77). Worked example: East pays 2000 where the others pay 1000. | The dealer's payment is doubled only in the self-draw branch (`doubled = payer === draft.dealer`). If the dealer wins, no payer is the dealer, so nothing is doubled. If East discards the winning tile, no doubling. `PLAY.md` #14 explicitly says "no dealer payer, so no doubling". | `src/core/game/reduce.ts` (`ledgerFor`) | East's receipts and payments are wrong in both directions. |
| A4 | 32 | At a 1000 limit, fishing scores: half-limit 200, limit 400, **double limit 500** (R69). | `TIER_FISHING`: half 200, limit 400, middle 600, **double 800**. `PLAY.md` and `ASSUMPTIONS.md` derive 40 % of the tier (200/400/600/800). | `src/core/patterns/types.ts` (`TIER_FISHING`), `src/core/fishing.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | A double-limit fishing declaration overpays by 300 per payer. |
| A5 | 24, 32 | The printed tiers on these pages are **half limit, limit, double limit**; no "middle limit" appears. The limit examples are 300/500/1000/500 (R93, R99). | `Tier` includes `"middle"` with 1500 points and 600 fishing. `ASSUMPTIONS.md` lists "middle limit 1500". | `src/core/patterns/types.ts` (`TIER_POINTS`, `TIER_FISHING`), `src/core/match.ts` | Any pattern marked `middle` scores a value not printed on the Milestone A pages (the p. 31 synopsis may print it; that is Milestone B). |
| A6 | 32 | Fishing figures are fractions of the limit: "one-fifth of the limit", "two-fifths", "one-half". Only ordinary cleared suit, Purity, All Honour and Concealed Mah Jong use the ground score; when fishing for those, score as p. 24 "without the bonus of 20 points for going Mah Jong" (R69, R71). | Fishing is a fixed per-tier table keyed from the wait's best tier; there is no 20-point adjustment and no ground-score recomputation. | `src/core/fishing.ts` (`settleFishing`), `src/core/patterns/types.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | Fishing for an ordinary hand pays a special-hand tier figure rather than a reduced ground score. |
| A7 | 21-22, 32 | The source does **not** say who pays a fishing player; p. 32 only fixes the figure and says East pays/receives double (Not stated 5). | `PLAY.md` #10 and `ASSUMPTIONS.md` state "Paid by EACH of the three other players"; `ledgerFor` writes one entry from every other seat. | `src/core/fishing.ts`, `src/core/game/reduce.ts` (`ledgerFor`) | An unprinted assumption is encoded as if it were a rule. |
| A8 | 21-22, 62 | Fishing/calling is the **state** of needing one tile; the player "should announce this"; a player needing one tile "may take it from any discard" and has precedence (R67, R68). No claim ban is printed. | Fishing is a `DeclareFishing` action after the player's own discard with a fixed full wait; while fishing the player may claim only mahjong (no pung, chow or claim-kong); a wait is illegal once every copy is dead. | `src/core/game/actions.ts`, `src/core/game/legal.ts`, `src/core/game/reduce.ts` (`claimOptions`, `fishingDeclarationFor`), `src/core/fishing.ts` (`isWaitAlive`) | Fishing behaves as a restrictive declaration, not the printed waiting status; the printed right to take any discard for the win is narrowed to the mahjong claim. |
| A9 | 18, 62 | East takes one extra tile after the others and **starts with 14**, then discards first (R40, R44). | `dealHand` gives every seat 13; `newGame` sets `phase: "draw"` and the dealer draws first. | `src/core/game/reduce.ts` (`dealHand`, `newGame`), `src/core/wall.ts` (`deal`) | The dealer's first turn is a draw rather than a discard; the 14th tile comes from the wall after the deal. |
| A10 | 18, 62 | Deal is four tiles at a time for three rounds (12 each), then one each, then East's extra; walls are 18 × 2 with two loose tiles set at the break (R34-R40). | One tile at a time round-robin to 13 each; single flat wall with `front`/`back`; no loose-tile reserve; kongs and bonuses draw from `back`. | `src/core/wall.ts` (`deal`), `src/core/game/reduce.ts` (`dealHand`, `drawFrom`, `replaceBonus`) | Different visible deal order and RNG sequence; no modelled loose-tile pair. |
| A11 | 22 | The Wind of the Round advances East → South → West → North, one per round; the game ends when all four have been round wind (R28, R32). | `dealHand` resets `prevailingWind = "E"` on every hand; there is no round transition or game end. | `src/core/game/state.ts` (`prevailingWind`), `src/core/game/reduce.ts` (`dealHand`, `nextHand`) | Wind-of-the-round bonuses can never apply beyond East; no four-round game. |
| A12 | 28, 62 | Chinese game: 136 tiles, two rows of 17 per wall, the last 14 tiles are dead and not drawn; mixed suits and any number of chows (R20, R35). | Always 144 tiles and the whole wall; `ordinary-mahjong` requires exactly one suit and at most one chow. | `src/core/game/reduce.ts` (`dealHand`, `advanceTurn`, `wallRemaining`), `src/core/patterns/table.ts` (`ordinary-mahjong`) | The Chinese game cannot be played: no dead wall, and mixed-suit/any-chow hands do not match the ordinary pattern. |
| A13 | 21, 63 | A drawn Western game is followed by a Goulash: three tiles exchanged three times, no chows, optional jokers and pool (R100-R104); tournament play omits it (R105). | No Goulash: `finishDrawn` sets a drawn result and `nextHand` redeals. | `src/core/game/reduce.ts` (`finishDrawn`, `nextHand`) | Missing procedure. |
| A14 | 21, 28, 63 | Drawn hand: all hands abandoned, nobody scores, tiles reshuffled, wall rebuilt. Chinese: East remains East, players add to a kitty, no Goulash; Western: East remains "for only one more hand and a Goulash is played" (R74, R75). | `finishDrawn` keeps `nextDealer: draft.dealer`; `nextHand` simply deals again. No kitty and no one-hand limitation. | `src/core/game/reduce.ts` (`finishDrawn`, `nextHand`) | Dealer repeats on every draw; no Chinese kitty, no Western one-hand rule. |
| A15 | 22, 63 | Penalties: too many tiles (no correction, cannot win, scores nothing), too few tiles (may score, cannot win), false Mah Jong (half-limit to each if hands exposed), discarded tiles may not be reclaimed (R80); p. 63 adds that too many tiles "pays all other players" (R81). | No penalty checks or penalty payments anywhere in the reducer. | `src/core/game/reduce.ts`, `src/core/game/state.ts` | Illegal hand sizes and false declarations are unpunished. |
| A16 | 22 | A discarder whose discard is visibly needed pays the other two losers' debts as well as his own, unless he was fishing or held at least three doubles (R79). | Not implemented. | `src/core/game/reduce.ts` (`ledgerFor`) | No careless-discard liability. |
| A17 | 22 | A player dealt no winds, dragons, pairs, pung/chow, terminals, seasons or flowers may demand a reshuffle; the others must abandon (R82). | Not implemented. | `src/core/game/reduce.ts` (`dealHand`) | No reshuffle path. |
| A18 | 18 | Seats are chosen by dice; highest becomes East, who selects a seat; West opposite East, South to East's right, North opposite South (R26). | Seats are fixed `E,S,W,N`; `newGame` accepts a dealer but there is no dice roll or seat selection. | `src/core/game/state.ts` (`SEATS`, `seatWindOf`), `src/core/game/reduce.ts` (`newGame`) | No seat randomisation or choice. |
| A19 | 21, 14 | A player with an **exposed** pung who draws the fourth tile may add it to form a kong (R56, R65). | `applyKong(..., added: true)` requires a pung with `!candidate.exposed` ("added kong needs your own concealed pung"). | `src/core/game/reduce.ts` (`applyKong`) | The printed exposed-pung-to-kong move is impossible; only concealed pungs can be extended. |
| A20 | 21 | If the fourth tile is added to an exposed pung, "any other player who can use this tile immediately to go Mah Jong may claim it" (R65). | `applyKong` converts the meld and immediately draws the replacement; no claim window is opened. | `src/core/game/reduce.ts` (`applyKong`, claim pipeline) | Robbing the kong is impossible. |
| A21 | 21 | Another player may claim a discard for a chow **only if it completes his hand** (R61); a winning hand has priority over all claims (R53, R62). | `claimOptions` refuses a chow when `completesAsChow` is true and only offers chow to `nextSeat(discarder)`; the win must be taken as a `mahjong` claim instead. | `src/core/game/reduce.ts` (`claimOptions`, `completesAsChow`, `finishWin`) | A winning chow claim is not representable; the win is scored as a concealed hand rather than as a claimed exposed chow. (The page does not settle the exposure question; Not stated 7-8.) |
| A22 | 14, 21 | A chow may be claimed by "the player sitting on the right of the discarder" (R60, R61). | `PLAY.md` #7 says "only from the player to your left"; the reducer allows `seat === nextSeat(discarder)` but the error text says "on your left". | `rules/PLAY.md` #7; `src/core/game/reduce.ts` (`applyClaim`) | Behaviour matches the printed right-hand seat; the written rule and error message say the opposite. |
| A23 | 6, 30 | "Honour tiles—Winds, Dragons, and 1s and 9s of each suit"; the glossary repeats "Honour Tiles Winds, Dragons and terminals" (R2, R4, R107). | `isHonour` / `isHonourKey` return true only for winds and dragons; terminals are a separate `isTerminal`/`isTerminalKey`. | `src/core/tiles.ts` (`isHonour`, `isHonourKey`), `src/core/patterns/predicates.ts`, `src/core/patterns/table.ts` | Latent: any predicate or future scoring code that reads `isHonourKey` as "honour" will disagree with the printed classification and the ground-score table. |
| A24 | 24 | Settlement levels: beginners pay the winning hand only; intermediate also fishing hands; advanced pays all hands (R94). | Always winner plus fishing declarations; no setting and no all-hand settlement. | `src/core/game/reduce.ts` (`ledgerFor`) | The printed advanced mode is unavailable. |
| A25 | 30, 63 | Special hands are optional and must be agreed; tournament play uses at most fourteen, removes jokers/flowers, passes East every hand, sets the limit at 1000, and bans repeating the same special hand more than twice (R105, R106). | The full pattern table is always active; no tournament options; normal dealer rotation. | `src/core/patterns/table.ts`, `src/core/game/reduce.ts` (`newGame`) | No way to play the printed tournament or agreed-special-hands variants. |
| A26 | 24, 32 | Flowers and seasons score 4 points each (R84), own flower/season give doubles (R88), and a bouquet drawn while fishing a special hand pays 1000 from each other player (R72). | Flowers and seasons are stored on `PlayerState` but never read by scoring. `ASSUMPTIONS.md` says "Bonus scoring is not implemented in this pass." | `src/core/game/reduce.ts` (`addBonus`), `src/core/score.ts` | All flower/season and bouquet scoring is absent. |
| A27 | 21 | The winner is paid first; the winner pays nobody; losers then settle their own differences (R76). | The ledger pays the winner and fishing players only; losers never exchange. | `src/core/game/reduce.ts` (`ledgerFor`) | No loser settlement (the second half of R76). |

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
