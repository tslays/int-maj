# Balance: the easy special hands, and an "Exotic hands" house rule

Status: **findings recorded, house rule not built.** The owner wants a house
rule that lets a player explore the special-hand catalogue without the bots
going out early on a handful of easy hands (2026-11-15). This file holds the
measurements, the proposed rule and the plan to build it. The decisions still
open for the owner are listed in §8.

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
| eight (A + B + C) | 64 % | 180 | All Pair 13 %, Ordinary 12 %, Wriggly Snake 9 %, Big Robert 9 % | 20 |

- A = `crazy-chows`, `three-philosophers`, `robin`, `little-robert`
- B = `big-robert-mixed` (displayed as "Big Robert", the half-limit version
  with different numbers in each suit; the limit hand `big-robert` stays in)
- C = `five-odd-honours`, `windy-chow`, `triple-knitting`

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

## 5. Two book questions to settle first

These are reading questions, not house-rule questions, and correcting them
from the page could fix part of the imbalance by the book itself
(`AGENTS.md`: read the actual page).

- **Three Philosophers' tier** is an assumption: its notes say "limit/half is
  assumed" (`src/core/patterns/table.ts`, `[C p. 15]`). A limit hand this easy
  is the largest single imbalance in value.
- **Crazy Chows' pair** is read from a cropped picture and marked
  `provisional` (`[C p. 16]`): a mixed pair, the same number in two suits.

## 6. The house rule

**Name.** "Exotic hands" (recommended), with the note "Leaves out five easy
special hands; not in either book". Other names: "Rare hands", "No easy
specials", "Explorer's table".

**Rule text** for `rules/RULES.md` Part III §5, as a new bullet:

> **Exotic hands** `[A]`. Off by default. Leaves out five special hands built
> only from free chows, pungs or runs over mixed suits: Crazy Chows
> `[C p. 16]`, Three Philosophers `[C p. 15]`, Robin `[C p. 60]`, Little
> Robert `[C p. 16]` and Big Robert with mixed numbers `[C p. 14]`. A
> left-out hand is out exactly as under "Which hands are in play", for every
> player, and it combines with any of the three hand sets.

**Legitimacy.** It changes only which hands are available, for every seat
alike, which is what §5 already allows. No rule of play, tier, payment or
fishing figure changes. A bots-only version would make one seat's legal win
illegal, which is a rule of play; it is not proposed.

**Hands in play** with the rule on: All 84 of 89, Companion 81 of 86,
Pictured 73 of 77 (Robin is already out there).

## 7. Plan

**Phase 1: engine and table service (not visual).**

- `src/core/game/hands.ts`: a rule token `EXOTIC_HANDS = "rule:exotic-hands"`
  that `exclusionsOf` expands into the five ids, like
  `GOULASH_NO_HALF_LIMIT`. The state then names the rule, not five ids, and
  saved games and replays read back unchanged.
- `src/core/patterns/table.ts`: `EXOTIC_LEFT_OUT`, the five ids, as data next
  to `HAND_SET_EXCLUDED`.
- `src/table/session.ts`: `exoticHands` in `HouseRules`, `excludedHandsFor`,
  `houseRulesOf`; `src/table/api.ts`: the handbook (`handIndex`) and
  `houseRulesPayload` take the rule into account; `src/table/report.ts`.
- `rules/RULES.md` Part III §5 (the text in §6), `docs/ENGINE.md`.
- Tests: `test/core/house-rules.test.ts` (each of the five is no win, no wait,
  no fishing hand and not hinted with the rule on, and still wins with it
  off; a hand that also makes another pattern scores as that), a bot test that
  no bot plans for the five, `test/table/api.test.ts` (the rule round-trips
  through `houseRulesOf` with each hand set, and the handbook marks the
  five), `test/table/report.test.ts`.

**Phase 2: the Options sheet (visual, preview check on the phone).**

The House rules group already holds a three-way choice and two switches, and
"Hands in play" with "Exotic hands" both decide the same thing. Regroup
rather than redesign:

- **Hands in play**: the hand-set choice and the "Exotic hands" switch
  together, with one count ("73 of 89 hands") and one list of what is left
  out, so the two never read as separate rules.
- **Rules of play**: the Goulash and fishing switches.
- One "Takes effect with the next hand" note for the whole group.

`app/index.html`, `app/src/options.js`, `app/styles.css`; `npm run smoke`.
A full redesign of the sheet (tabs, a separate Rules screen) is worth it only
if more rules are coming.

**Phase 3: confirm.** Rerun the soak with the rule on, and a measurement with
one seat chasing rare hands, to see the draw rate a player meets.

## 8. Open for the owner

1. The five, or a different line.
2. The name.
3. Regroup the House rules (Phase 2) or redesign the whole Options sheet.
4. Whether to settle the two book questions in §5 first.
