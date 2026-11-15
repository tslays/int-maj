# Balance: the easy special hands, and the "Rare" hand set

Status: **the Rare hand set is built, and offered on the redesigned Options
sheet (§7).** The owner wanted a
house rule that lets a player explore the special-hand catalogue without the
bots going out early on a handful of easy hands (2026-11-15), and decided on
2026-11-15: these five hands, the name "Rare" as the narrowest step of
"Hands in play", a redesigned Options sheet, and the two book readings in §5
settled first.

## 1. The question

Bots finish early with Crazy Chows, and Three Philosophers, Robin and Little
Robert feel far too easy. Which hands should a balancing house rule leave
out, and where should it stop?

## 2. First pass (owner's scratch analysis, superseded)

East committed to one special hand from the deal and played only for it, in
120 games per hand, against three Hard bots.

- **Run 1** (East aims with the engine's planner, `handTarget`) is invalid for
  most hands: the planner tracks only hands within `MAX_MISSING = 6` missing
  tiles (`src/core/game/bot/plan.ts`), so most hands were never pursued.
  For the hands it did engage: Crazy Chows 67.5 %, Three Philosophers 42.5 %,
  Robin 33.3 %, Little Robert 27.5 %, Big Robert 10.0 %.
- **Run 2** (East discards towards the versions in `bot/targets.ts` and never
  melds): Crazy Chows 15.8 % [10.4, 23.4], Big Robert 5.8 %, Triple Knitting
  5.0 %, Robin 5.0 %, everything else 0-2.5 %. At 120 games most hands cannot
  be told apart.

Read with care:

- Crazy Chows is concealed only (`exposedTier: null`), so melding does not
  explain the gap between the two runs. The planner re-searches the whole
  catalogue every turn, while Run 2 used a fixed list of versions
  (`docs/HINT-ODDS.md` §10 found the same).
- The race figures recorded with it (others win about 70 %, about 35 % drawn)
  add up to more than 100 %, so one of them has another denominator.
- The direct measurement below replaces this pass.

## 3. What the bots win with (bot-only soak)

`node scripts/bot-soak.ts 500 4 --exclude=<ids>`: 500 first hands of fresh
games, all four seats played by the real bots, the same seeds `bots-0` ...
`bots-499` in every row, so the rows compare like for like. Measured on
2026-11-15 at `main` 79f78cb.

| Left out | Drawn | Wins | Most-won hands (share of wins) | Wall left at a win |
| --- | --- | --- | --- | --- |
| nothing | 35 % | 323 | Crazy Chows 34 %, Three Philosophers 10 %, Robin 10 %, Big Robert (mixed) 6.5 % | 30 tiles |
| the four (A) | 50 % | 248 | Big Robert (mixed) 18 %, Five Odd Honours 10 %, Windy Chow 10 %, Triple Knitting 9 % | 23 |
| **the five (A + B)** | **52 %** | **239** | Windy Chow 12 %, Five Odd Honours 11 %, Triple Knitting 11 %, Ordinary 9 %, All Pair 9 % | **21** |
| **Rare set** (Pictured less the five; 16 hands) | **56 %** | 222 | Windy Chow 13 %, Five Odd Honours 13 %, Triple Knitting 12 %, Big Robert (limit) 9 %, Ordinary 9 % | 21 |
| eight (A + B + C) | 64 % | 180 | All Pair 13 %, Ordinary 12 %, Wriggly Snake 9 %, Big Robert 9 % | 20 |

- A = `crazy-chows`, `three-philosophers`, `robin`, `little-robert`
- B = `big-robert-mixed` (displayed as "Big Robert", the half-limit version
  with different numbers in each suit; the limit hand `big-robert` stays in)
- C = `five-odd-honours`, `windy-chow`, `triple-knitting`
- The Rare row also leaves out the Pictured set's twelve (§6); measured
  2026-11-15 on the branch that added the set.

With nothing left out, 96 % of bot wins are special hands, and Crazy Chows
alone is a third of them. Bots make about 0.3 calls a hand, so Little Robert,
which is mostly built by claiming, shows up rarely (2 wins): it is in the cut
for what it does in human play, which the soak does not measure.

**Ordinary Mah Jong** won 10 of 323 hands (3 %) with nothing left out, and
20-22 in every cut row (8-12 %). The Western ordinary hand must be in one suit
with at most one chow, which a mixed deal rarely gives, and it scores by
calculation, far below the 500 of a half-limit hand. The bots plan by
expected points, so they seldom aim for it. It is the basic hand of Part I,
not a catalogue hand, and leaving it out would change the game itself.

## 4. Where to stop: the five

- **Four is not enough:** Big Robert (mixed) takes over as the bots' default,
  at nearly twice the next hand.
- **Five is the point** where no hand wins more than about 12 % and the top
  six are close together. Hands run longer (a win with about 21 tiles left,
  against 30), which is the room a player needs to build something unusual.
- **Eight goes too far:** two hands in three are drawn, and the spread of
  winning hands is no flatter than with five.

The five share one shape, which is the rule's principle: **each is built only
from chows, pungs or runs with free numbers, spread over mixed suits, with no
wind, dragon or number required.** The Western ordinary hand must be one
suit, so these hands work like the Chinese ordinary hand (R-018) paid at half
or full limit, and almost any deal is already halfway to one. Every hand left
in play needs particular honours, particular numbers or a single suit.

Caveats:

- Bots only. A human chasing a rare hand adds draws on top of the 52 %, and
  each drawn hand makes a Goulash more likely.
- 500 hands give about ±4 points on the drawn rate and a few points on each
  hand's share; the order of the top hands after the cut is not settled.
- Points per win were not measured.

## 5. Two book readings, settled from the page

Both were open in the engine's notes, but `rules/RULES.md` Part III §2 had
already settled them, and the page images agree (read 2026-11-15). Neither
changes the balance picture.

- **Three Philosophers** `[C p. 15]` prints "LIMIT (Concealed)  Fishing = 400",
  with a chow in each suit, a "Mixed Chow" of 4 Bamboo, 5 Circles,
  6 Characters, and "Pair any suit". The limit tier is the book's, not an
  assumption.
- **Crazy Chows** `[C p. 16]` prints "HALF LIMIT (Concealed)  Fishing = 200",
  four mixed chows and a "Mixed Pair" of 6 Bamboo and 6 Circles, fully
  visible. The engine's reading (the same number in two suits) is right.
  The page's chows run Circles-Bamboo-Characters and the Three Philosophers
  chow Bamboo-Circles-Characters, so a mixed chow's suit order is free.

The stale notes and the `provisional` flag on Crazy Chows are corrected in
`src/core/patterns/table.ts`.

## 6. The Rare hand set

**Name and place.** "Rare", the fourth and narrowest step of "Hands in
play": All, Companion, Pictured, Rare. Each step leaves out more than the one
before, so Rare also leaves out what Pictured does (the Illustrated-only and
the unpictured hands) and plays 73 of the 89 hands. A table that wants every
Illustrated hand without the easy five has no set for that; it can be added
as a separate switch later if wanted.

**Rule text:** `rules/RULES.md` Part III §5, set 4.

**Legitimacy.** It changes only which hands are available, for every seat
alike, which is what §5 already allows. No rule of play, tier, payment or
fishing figure changes. A bots-only version would make one seat's legal win
illegal, which is a rule of play; it is not offered.

**In the code:** `easyMixed` on the five patterns, `EASY_MIXED_HANDS` and
`HAND_SET_EXCLUDED.rare` in `src/core/patterns/table.ts`; `houseRulesOf` reads
it back (`src/table/session.ts`), and the left-out list names the variant
"Big Robert (half limit)". Tests: `test/core/house-rules.test.ts` (the
printed examples score nothing under Rare, and the hands are no wait, hint or
bot plan), `test/table/report.test.ts`, `test/table/api.test.ts`.

## 7. The Options sheet redesign

On a phone in landscape the old two-column sheet was taller than the screen,
and the house rules started below the fold. The sheet now has three tabs
(Game, Table, Rules), one height for all of them, and New game, Help and
Report under every tab.

- **Hands in play** is a filter of four steps, All, Companion, Pictured,
  Rare, each leaving out more, with a count of the hands that stay ("73 of 88
  hands", as the hand index counts them). The note names only what the chosen
  step adds, so Robin, already out of Pictured, is not named again under
  Rare. Rare's note says it is our own rule and why: the easy hands nearly
  any deal is halfway to are out, so the rarer ones are worth chasing.
- **Rules of play**: the Goulash switch, and "Announce fishing to win",
  described as our own rule: you go out only after announcing you need one
  tile, so no win comes without warning.
- A rule changed mid-hand shows "Changes start next hand" in the header and
  an amber light on the Rules tab.

On a landscape phone the Rules tab scrolls a little when Rare is chosen;
Game and Table fit.

## 8. Still to measure

Rerun the soak with a seat that chases rare hands, to see the drawn rate a
player meets, and record points per win.
