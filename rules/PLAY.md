# Play rules — the decisions the book does not make

The Companion is a hand catalogue: it never states the tile set, the deal, the wall, claim precedence or payments. The turn engine needs each of these as a value. Nothing here is transcribed from the book — every line is a **proposal** with my reasoning, awaiting your yes/no. When you answer, the entry moves to DECIDED and the engine reads it from the variant profile.

| # | Question | Proposed default | Why |
|---|---|---|---|
| 1 | Tile set | 144: 108 suited + 16 winds + 12 dragons + 4 flowers + 4 seasons | The book's tournament notes mention Flower and Season tiles, so the set has them |
| 2 | Flowers/Seasons | Never part of a hand; draw a replacement tile immediately; score as a bonus only | They cannot appear in any of the ~120 hand compositions |
| 3 | Deal | Dealer 14, others 13; wall 144 minus the dealt tiles | Universal in the Chinese family |
| 4 | Kong replacement | Draw from the back end of the wall (the loose-tile end) | Page 34 says a kong takes a loose tile and a hand may reach 15-18 tiles |
| 5 | Minimum hand | None — any legal 14-tile hand may go out | The book's short list includes plain "Ordinary Mah Jong"; no minimum is ever mentioned |
| 6 | Claim precedence | Mah jong > pung/kong > chow; two identical claims: nearest in turn order | Page 34 has a "Tile Precedence" section; this is the standard order |
| 7 | Chow eligibility | Only from the player to your left, and never to complete a hand | Standard, and it keeps "fishing" meaningful (you call the discard) |
| 8 | Payment | Discarder pays the winner; self-draw pays from all three, dealer pays double | The book scores hands, not settlements; this is the smallest consistent rule |
| 9 | Round/dealer wind | East round; dealer repeats on a win, wind passes otherwise | Standard Chinese play; page 34 discusses East passing after a drawn hand |
| 10 | "Fishing" | **DECIDED (owner, 2026-10-31):** fishing is an ANNOUNCEMENT, not a win type. When you are one tile from going mah jong you announce it to the table; the announced wait is fixed. If someone else wins, every fishing player still collects the fishing score — "a mini win". Page 34's rule follows from this: you cannot fish for a tile that is already dead, because the announcement must come before your needed tile is gone. | Told by the owner |

## Also worth settling before the engine
- **Tile notation** for the API and tests: `1c 5b 9d 1z..7z` (c/b/d suits, z honours, f/s flowers) or the Japanese `123m 456p 789s`. I suggest `1c 2c 3c 5b 5b 7d 7d 1z 2z 3z 4z 4z 6z 6z` — terse, unambiguous, easy to type at a table.
- **Whether a hand may be declared on a discard for a concealed-only pattern**: page 34's "Fishing or Calling" suggests calling is allowed but changes the tier; needs a ruling from you.

## Fishing — engine consequences (from the owner's definition)
- Fishing is a *state*, entered by an explicit announce action during your own turn, not a property of how the hand was won. `FishingDeclared { player, wait }`.
- The wait must be fixed at declaration; the wait is what later settles.
- Settlement is independent of the winner: a fishing player scores even when someone else goes mah jong.
- A declaration is illegal if every copy of the needed tile is already discarded/exposed ("one cannot fish for a tile that is no longer available", p. 34).
- Still open: (a) who pays the fishing points — the winner, the discarder, or all three; (b) does the winner also collect a fishing score on top of the hand; (c) may a fishing player still pung/chow/kong, or is the declared wait binding; (d) whether the fishing value is the tier of the hand being fished for. The synopsis prints the values themselves: half 200, limit 400, middle 600, double 800.

## Fishing - owner's rulings (2026-10-31, supersede the open points above)

- All three other players each pay the fishing player. The fishing score is lower than winning the hand.
- After announcing, a KONG is still allowed; PUNG and CHOW are not. So the ban is on absorbing another player's discard into a meld; a kong stays legal (a claim-kong from a discard needs your ruling - see below).
- Still open: (a) the fishing figure per tier; (b) whether a kong while fishing forces the wait to be re-declared, since a kong replacement tile changes what you hold; (c) whether a claim-kong off a discard is also allowed after fishing, or only a concealed kong; (d) whether the winner also collects a fishing score.

### The one number still unknown
If you are fishing for a Limit hand and someone else wins, is the payment
  1. 1000 from each of the three (3000 total),
  2. 1000 total split three ways, or
  3. a flat smaller figure per player?
The owner's "lower than winning a game" argues against 1 for the high tiers.

### Worked example from the owner (2026-10-31)
Wriggly Dragon (Limit): win = 1000. Announced fishing for it and lost = 400. So fishing pays a flat figure well below the hand's tier - 400 does not correspond to any row of the 500/1000/1500/2000 table, which means the "Fishing" labels on page 4 point at a SEPARATE, lower scale, not at the tier values.

Still to pin: does 400 scale with the tier you are fishing for (e.g. half 200 / limit 400 / middle 600 / double 800), and is 400 paid by EACH of the three players or 400 in total?

### DECIDED - fishing payment (2026-10-31)
- Paid BY EACH of the three other players, not split.
- Figure in the owner's example: 400 for fishing a Limit hand.
- Default until corrected: the figure is FLAT (400) whatever tier you fish for. If it turns out to scale, it becomes a per-tier fishing table with 400 at limit; nothing else in the engine changes.

### Fishing is a per-tier scale (owner correction, 2026-10-31)
Not flat: the fishing payment differs by the tier of the hand you announce for. Known point: Limit -> 400 from each of the three players. Unknown: the half, middle and double figures.

Working hypothesis (40% of the tier): half 200 / limit 400 / middle 600 / double 800. Not confirmed - replace the moment the owner gives the real numbers.

### DECIDED - fishing scale (2026-10-31)
Fishing scales with the tier of the hand announced for (limit 1000 -> fishing 400), i.e. 40% of the tier:
    half limit   500  -> fishing 200
    limit       1000  -> fishing 400   (confirmed by the owner)
    middle limit 1500 -> fishing 600
    double limit 2000 -> fishing 800
Paid by EACH of the three other players. Encoded as a fishing table in the variant profile, not as a constant.

### CONFIRMED FROM THE PRINTED PAGE (owner screenshot, 2026-10-31)
The FULL SYNOPSIS carries TWO numeric columns, 'Winning' and 'Fishing', per hand. The OCR of those pages lost both columns entirely - that was an extraction failure on my side, not missing print.

Winning / Fishing pairs seen on the printed page:
    500 / 200     1000 / 400     1500 / 600     2000 / 800
So fishing IS 40% of the tier, confirmed at all four tiers. Fishing is paid by EACH of the three other players.

Some rows print the word 'Calculate' instead of a figure (e.g. Ordinary Mahjong, Sparrow's Sanctuary, Oriental Odd Numbers, Garden of Heaven) - those hands are scored by summing components, so the engine needs a calculation path for them, not a lookup.

### DECIDED - what a fishing player may still do (2026-10-31)
Only a CONCEALED kong is legal after announcing fishing. No claim-kong off a discard, no pung, no chow. So while fishing the player's only legal meld action is a kong from their own hand, and the announcement otherwise freezes the hand.
Engine: FishingDeclared { player, wait } blocks claim-pung / claim-chow / claim-kong-from-discard; own-hand kong (concealed or added-to-a-concealed-pung) stays legal.

Still open: (1) does a concealed kong while fishing require the wait to be re-declared, since the replacement tile changes what is held; (2) does the dealer repeat after a win.

### DECIDED - kong while fishing, and dealer (2026-10-31)
- A concealed kong while fishing does NOT require re-declaring the wait. The announcement stands; the hand simply takes the replacement tile and the wait resolves against whatever is held once the kong is off the rack.
- The dealer keeps the deal ONLY when the dealer is the one who wins. If any other player wins, East passes to the next player in turn order.

No open questions remain in this file. Fishing, its scale (40% of the tier, from each of the other three), the claim bans, and the dealer rotation are all settled.

Correction from the owner (2026-10-31): "if the dealer wins, he keeps his slot" - the deal does not survive a win by anyone else.

### DECIDED - drawn hand (2026-10-31)
Wall exhausted with no winner: the dealer keeps the deal (consistent with p. 34, where the East of the drawn hand stays East for the first goulash).

## Turn-engine readings (DECIDED 2026-11-01)

The table above settles the play rules; building the reducer exposed nine
smaller points the table does not name. Each is read as literally as the
printed words allow; none changes a value in the table.

| # | Question | Decided | Why |
|---|---|---|---|
| 11 | Which end replaces a flower or season | The back end (loose tiles), the same end as a kong replacement | p. 34 calls the back the loose-tile end and replacement draws are replacements; the book does not give flowers a different end |
| 12 | What a fishing announcement names | The full wait set: every tile that would complete the 13-tile hand, deduped | "When you are one tile from going mah jong you announce it" — the announcement is the wait, and a fixed wait must be complete |
| 13 | Which fishing tier is announced | The highest tier among the hands the declared wait completes; Calculate stays Calculate | The printed Fishing column is per tier, so a wait with several completions takes its best one |
| 14 | Dealer is the self-drawn winner | The three non-dealers each pay the base; no dealer payer, so no doubling | #8 says the dealer pays double; when the dealer wins there is no dealer among the payers |
| 15 | Several seats claim one discard | Every eligible seat answers once, then the window resolves | A race needs both answers; the precedence rule in #6 then chooses the winner |
| 16 | Seat winds after the deal passes | The dealer is East for the hand; the next seat is South, then West, North | #9 passes the deal; own-wind patterns (Red Lantern, Little Brother, …) need a seat wind |
| 17 | Kong when no loose tile remains | Illegal, named "no replacement tile available" | p. 34's kong takes a loose tile; a kong with no tile to take cannot be completed |
| 18 | Bonus replacement exhausts the wall | Drawn hand, dealer keeps the deal | #9's drawn-hand rule; there is no tile left to draw and no winner |
| 19 | The last discard and a claim | A claimed discard leaves the discarder's pile and joins the meld or winning hand | The tile is no longer on the table; the `Discarded` event keeps the public record |

