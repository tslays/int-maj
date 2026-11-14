# Plan: closest hands by chance, not by distance

Status: **built (phases 1-3).** The owner accepted every proposal in §9 on
2026-11-14: the chance means "can I still build it before the wall runs out",
the panel shows the likeliest hands first, as a ring with a percentage, and
pinned hands keep their ring with Hints off. What was built, and where it
departs from the plan, is in §10; phase 4 is still open.

The closest-hands panel now ranks and labels each hand by how many tiles are
missing ("3 to go"). This plan replaces that with an honest estimate of the
chance that the player can still finish the hand, worked out only from what
the player can see at the table, and shown as a filling ring with a
percentage.

## 1. What is wrong with "N to go"

`closestHands` (`src/core/game/closest.ts`) finds, for each catalogue hand,
its nearest version and reports `away`, the number of missing tiles. It
already computes a `chance` too, from the bots' planner
(`completion` in `src/core/game/bot/plan.ts`), but that figure is
used only to break ties and never shown, and it is crude:

| Today | Why it misleads |
| --- | --- |
| Rank by `away` first | "2 to go" waiting on a tile with no copy left in the wall beats "3 to go" with everything live. |
| `draws = floor(wallRemaining / 4)` | Ignores whose turn it is, the loose tiles (`tilesLeft` counts them, the view does not), flowers and seasons that cost a wall tile, and claims that skip turns. |
| Every unseen copy drawn with the same chance `q = draws / unseen` | An unseen tile is either in the wall or in an opponent's hand. The latter only reaches you if that opponent discards it, and a tile they are keeping never comes. |
| Every tile but the last must be self-drawn | For a hand that allows exposed melds, a pung can be claimed off **any** discard and a chow off the left player's discard (R-060, R-061). That is a big part of how real hands are made and it is ignored. |
| The last tile "comes about three times as easily" | A flat factor. The real chance depends on how many copies are live and how many discards are still to come. |
| Each missing tile treated independently, then multiplied | The draws compete for the same turns; two tiles from the same small pool are not independent. |
| `haste` from the seat's bot level is applied to the human's chance | A bot's race discount leaks into the player's hint. |
| Only the nearest version of a hand is scored | A hand often has many equally good or nearly as good versions (which pair, which suit). Having several to choose from raises the chance a lot; today only one version counts. |

## 2. What the number means

> **The chance that you can complete this hand before the wall runs out,
> if from now on you play only for this hand, given everything you can see
> at the table.**

Spelled out:

- **Only what the player can see.** Your own hand, melds, flowers and seasons;
  every discard; every exposed meld; the wall and loose-tile counts; how many
  tiles each opponent holds; whose turn it is. Never another seat's concealed
  tiles, never the wall's order. The computation takes the seat's
  `GameView` and nothing else, exactly as `closestHands` does today, so the
  rule "the app never sees another seat's concealed tile" holds by
  construction.
- **Playing for this hand.** You keep the tiles the hand needs, discard the
  rest, and make every claim the rules allow for it. It is the chance of the
  hand, not of you; a player who switches plans changes it.
- **Before the wall runs out.** Version 1 does not count the chance that an
  opponent goes out first (see §8, phase 4). The number answers "can I still
  build this", which is the question the panel is for.

## 3. The model: sample what you cannot see, play it out

A closed formula cannot handle claims, turn order, opponents' kept tiles and
many hand versions together. Instead, the estimate is a **Monte Carlo
simulation over the hidden tiles**, which can model each of those directly
and is easy to check.

### 3.1 The hidden pool

From the view, every tile you cannot see is in one of three places:

```
unseen copies of each tile  =  (live wall + loose tiles)  +  opponents' concealed hands
```

Flowers and seasons not yet shown are in the same pool. Conservation is
checked: seen + wall + loose + Σ opponents' hand counts must equal the set
(R-001). From your seat these hidden tiles are exchangeable: any arrangement
of them consistent with the counts is equally likely. That is the fact the
sampler relies on, and it is exact, not an assumption.

### 3.2 One trial

1. **Deal the unknown.** Shuffle the hidden pool with a seeded RNG and fill
   each opponent's hand to its `handCount`, the wall to its count and the loose
   tiles to theirs.
2. **Play the turns out** in seat order from the current phase, until the
   wall is exhausted or the target is complete:
   - **Your turn:** draw (a flower or season is set aside and replaced from
     the loose tiles, as in the engine); if the hand is complete, success;
     otherwise discard by the target policy (3.3).
   - **An opponent's turn:** draw, then discard by the opponent model
     (3.4).
   - **Every discard by an opponent:** you claim it if the rules let this
     hand use it: a pung or kong from anyone, a chow only from the player on
     your left (R-060), any group, a pair included, when it completes the hand
     (R-061, I p. 63). A hand that may not expose melds claims only for Mah
     Jong where its card allows ("Concealed (except last tile)"); a hand that
     must be self-drawn (`requiresSelfDrawn`) never claims. A claim moves the
     turn to you, so the seats in between lose their draw, as in play.
   - An unclaimed discard is dead (R-024) and never returns.
3. Count the trial as a success or not.

The chance is successes ÷ trials. 2,000 trials give a standard error of at
most about 1.1 percentage points; the panel shows whole percentages and, at
the ends, "under 1%" and "over 99%" rather than claiming certainty. A hand
that is already complete shows "Complete" and needs no simulation; a hand
that is out of reach (a needed tile has no unseen copy, or an exposed meld
rules it out) is 0% without one.

### 3.3 Your play in the simulation: the target policy

The target is not one version but the set of versions of the hand that are
still possible (the reach search already returns up to 64 at the nearest
distance; this keeps also those one tile further, capped). In each trial:

- A drawn or claimable tile is useful if some still-possible version needs
  it beyond what you hold.
- You keep tiles for the **leading version**: fewest missing, then most live
  copies of what it misses. When a draw makes another version better, you
  switch, as a player would.
- You discard the tile no leading version needs, preferring one that no
  near version needs either.
- A version dies when a tile it needs runs out of live copies.

This policy is deliberately simple and generic: it reads the hand's groups or
its planner goal, never a hand by name (the engineering invariant on
declarative hand data stays intact).

### 3.4 Opponents in the simulation

What opponents discard decides what you can claim, and what they keep is out
of reach. Version 1 uses a cheap, deterministic **keeper model**: an opponent
discards from its sampled hand the tile that belongs to no pair, pung or
two-tile run, preferring lone honours, then terminals, then the rest; it never
breaks a pung or a pair. That is enough to make "the copies of a tile buried in
an opponent's hand" behave realistically: a paired tile there is held, a lone
one tends to come out.

Opponents' own claims are left out of version 1 (they mostly reorder turns).
Calibration (§5) measures what this costs; if it matters, the keeper model
gets pung claims in phase 4.

Not used, on purpose: the real bots' planner. It is far too slow to run
thousands of times per turn, and using it would make the hint know how the
bots think, which a human at a real table cannot.

### 3.5 Determinism and purity

`src/core` stays pure: the RNG is the existing seeded one (`src/core/rng.ts`),
seeded from a hash of the view (as `slip` in `bot.ts` already does). The same
view always gives the same percentage, so tests are stable and the number does
not flicker when the panel redraws.

### 3.6 Cost

Each trial is at most the remaining turns (under 140 steps) of array updates.
For the panel's three hands plus pins, about 10 candidates × 2,000 trials is
roughly 2-3 million cheap steps, tens of milliseconds in the browser. Budget
targets, checked by a test with a generous bound:

- under 50 ms per panel refresh on a desktop, under 150 ms on a phone;
- if a phone is too slow, trials adapt (stop early once the estimate is within
  ±2 points) and, if needed, move into a Web Worker. No change to the API.

## 4. Ranking and choosing which hands to show

1. **Candidates:** the existing search (reach.ts and the planner goals)
   still finds every hand within `MAX_MISSING`, and supplies its versions. Its
   distance is a cheap filter only.
2. **Shortlist:** the best 10 by today's quick `chance` (fixed per §1 so it
   at least uses the right draw count and claims) go to the simulation, plus
   every pinned hand.
3. **Order shown:** highest chance first; ties by points. The points stay
   on every row, so a player can still see that a 20% limit hand is worth
   chasing over a 60% small hand; the panel does not multiply them for the
   player.

Phase 4 may add a toggle "likeliest / best value (chance × points)" if the
owner wants it.

## 5. Proving the number is right

A probability is only useful if it is calibrated: of the hands shown at 30%,
about 30% should be completed. Three layers of tests:

1. **Exact cases (unit tests, `test/core/`).** For a hand that must be
   self-drawn, no claims happen, so the chance has a closed form (a
   multivariate hypergeometric over your own draws). The simulation must agree
   within 3 standard errors on a set of hand-built views. Also: a needed tile
   with zero unseen copies gives 0%; a complete hand gives Complete; a single
   wait with one live copy and one draw left gives about 1 / (unseen pool);
   more live copies never lowers the chance (monotonicity); a claimable pung
   raises the chance over the same hand that must be concealed.
2. **No-cheating test.** Two game states that differ only in opponents'
   concealed tiles and the wall order produce identical views and must give
   identical percentages. This is the test that proves the hint does not peek.
3. **Calibration run (a script, not part of `npm test`).** Play a few
   thousand seeded hands with the existing bots, with one seat replaced by a
   target-locked player that commits to the panel's top hand and plays the
   target policy. At each of its turns, record the predicted chance and,
   at the end, whether the hand was completed. Report a reliability table
   (predicted bucket vs. actual rate) and the Brier score. Run it once with
   the old `chance` for comparison. Acceptance: every bucket with enough
   samples within ±5 points, and a Brier score clearly better than the old
   figure. The results go into the PR that ships the change.

The calibration run is also where model choices are settled with data rather
than guesses: the keeper model's preferences, whether opponents' claims
matter, how many trials are enough.

## 6. On the screen

The row keeps its shape: name, then a meta line. "3 to go" becomes a **ring
gauge**, a small circle that fills clockwise, with the percentage beside it:

```
Pure Straight            ◔ 24%  · exposed · 64
All Pair Honours         ◕ 71%  · concealed · 500
Thirteen Orphans         ○ <1%  · concealed · 1,000
```

- **The ring** is SVG drawn by the app (no images, no `title` element, per the
  no-tooltips rule). Its colour runs on one warm scale from cool grey (low)
  through amber to the panel's accent (high), with the percentage always
  written next to it, so colour is never the only signal (colour blindness,
  dark mode).
- **A trend tick** (▲ / ▼) for a change of 10 points or more since your last
  turn, so the player sees when a discard killed or opened a hand.
- **Complete** keeps today's style. **Out of reach** keeps its row for pinned
  hands, as today.
- **The hand sheet** ("Tiles you still need") gets the evidence behind the
  number: under each needed tile, how many copies are still unseen, for
  example "2 left". This is what teaches the player why the figure moved, and
  it costs nothing: the count is already in the view.
- **Accessibility:** the row's `aria-label` reads "24 percent chance to
  complete" in place of "3 to go".
- `away` stays in the API (the sheet still lists the missing tiles); it just
  stops being the headline.

The look is reviewed on the PR preview on the owner's phone before merge, like
every visual change.

## 7. Where the code goes

| Layer | Change |
| --- | --- |
| `src/core/game/view.ts` | Add the loose-tile count to `GameView` (the loose tiles sit on top of the wall, visible to all). Check opponents' concealed kongs: if the book shows them face down, the view must not give their tiles (today `copyMelds` copies them; verify against the page before relying on them). |
| `src/core/game/odds.ts` (new) | `handChance(view, target, options)`: hidden pool, sampler, target policy, keeper model, claim rules. Pure, seeded, no hand-specific code. |
| `src/core/game/closest.ts` | Candidates as today; shortlist; `chance` from `handChance`; sort by chance. `ClosestHand` gains `live` (unseen copies per needed key) and `trend` is computed in the app from the last value. The bot's `haste` stops reaching the player's figure. |
| `src/core/game/bot/plan.ts` | The quick estimate gets the correct draw count (turn order, loose tiles, bonus tiles) and pung/chow claims. The bots keep using it; that is a separate gain, to be checked with the existing bot benchmark so they do not get worse. |
| `src/table/session.ts`, `api.ts` | Payload carries the new fields; no new endpoint. |
| `app/src/hints.js`, `styles.css` | Ring gauge, percentage, trend tick, "left" counts on the sheet, aria text. |
| `scripts/calibrate-odds.ts` (new) | The calibration run of §5. |
| `docs/APP.md`, `docs/ENGINE.md` | Describe the figure and its meaning. |
| `test/core/odds.test.ts`, `test/core/closest.test.ts`, `test/app/…` | §5 tests; existing closest tests updated where the order changes. |

Rules used by the claim simulation are the framework's (R-024, R-060,
R-061, the card's concealed/self-drawn flags); none is new. If writing it
turns up a question the books leave open, it goes in
`rules/archive/ASSUMPTIONS.md` with page and evidence, not into the code
silently.

## 8. Phases

Each phase is one pull request.

1. **Engine, no visible change.** `odds.ts`, the view additions, the exact
   and no-cheating tests, the calibration script and its first report.
   `chance` in the API becomes the new figure; the panel still shows "N to go".
   Non-visual: auto-merge.
2. **Ranking.** The panel orders by chance. A visible change in order only;
   preview on the phone.
3. **The ring.** Gauge, percentage, trend, "left" counts in the sheet,
   aria text. Visual: preview, owner merges.
4. **Refinements, driven by the calibration report**, only those it shows
   are worth it:
   - opponents' pung claims in the keeper model;
   - reading opponents' discards and exposed melds to weight what they hold
     (a player collecting bamboo is less likely to release bamboo);
   - a "before anyone else goes out" figure, using what the table shows
     (opponents' melds, a fishing display, how late it is);
   - the faster quick estimate feeding the bots.

## 9. Open questions for the owner

1. **Meaning of the number.** "Can I still build it before the wall runs out"
   (proposed), or "will I win with it", which also counts the race against
   the other three? The second is more honest about winning but much less
   certain, since the race depends on hidden hands.
2. **Order.** Likeliest first (proposed) or chance × points?
3. **Display.** Ring with percentage (proposed), or a plain percentage, or a
   coarse heat label (cold / warm / hot) without numbers?
4. **Hints off.** Pinned hands still show their ring when Hints is off
   (proposed, as the pins show their distance today)?

## 10. What was built, and what calibration showed

Phases 1 to 3 went into one pull request: as soon as the chance is computed,
the panel's order changes, which is a visible change anyway.

- `src/core/game/odds.ts`: the simulation of §3. The seat's discard rule is
  "throw the tile the nearest open versions need least", which re-plans as
  tiles arrive (not "follow one leading version"). Opponents use the keeper
  rule of §3.4. An estimate stops once its standard error is under 2.5 points
  (200 to 2,000 trials).
- `GameView` gained `looseRemaining` and `drawsLeft`. Opponents' concealed
  kongs needed nothing: their end tiles are shown face up (R-057).
- `src/core/patterns/reach.ts` gained `slack`: besides the nearest versions it
  can return those a tile further. `closest.ts` simulates up to 200 of each.
- `ClosestHand.chance` is the simulated figure and `ClosestHand.unseen` the
  copies out of sight per needed tile; the panel orders by chance. Hands past
  the panel's eight (the hand index asks for up to 100) get 300 trials.
- The display of §6, changed on the owner's review (2026-11-14): no
  percentage anywhere. The ring fills with the chance and takes the colour of
  one of five bands, named beside it: Excellent (80 % and up), Very good
  (60), Good (40), Average (20), Bad. The arrow marks a hand that moved a band
  since the previous decision, and the panel is worked out once per decision.
  The hand's sheet keeps the count of unseen copies under each needed tile;
  the index shows the ring and band and sorts "Likeliest for my tiles".
- Not done: the Web Worker. A panel refresh takes about 60-200 ms on a
  desktop (it was about 30 ms), on the main thread. If it is felt on a phone,
  moving `closestWithPins` into a worker is the next step.
- Not done: the quick estimate in `bot/plan.ts` is unchanged; it still
  shortlists the hands and still drives the bots.

### Calibration

`node scripts/calibrate-odds.ts 200 cal` (East commits to the panel's top
hand and plays only for it; the other seats are hard bots that may not go
out) and the same with `race` (they may). Share of hands completed, by
predicted bucket:

| Predicted | New, no race | New, race | Old quick figure, no race |
| --- | --- | --- | --- |
| 10-20 % | 33 % | 21 % | 74 % |
| 20-30 % | 44 % | 32 % | 84 % |
| 30-40 % | 49 % | 38 % | 82 % |
| 40-50 % | 63 % | 47 % | 91 % |
| 50-60 % | 77 % | 57 % | 85 % |
| 60-70 % | 86 % | 60 % | 85 % |
| 70-80 % | 92 % | 65 % | 90 % |
| 80-90 % | 86 % | 63 % | 94 % |
| 90-98 % | 95 % | 79 % | 97 % |
| Brier score | 0.147 | 0.223 | 0.359 |

What it says:

1. The new figure is far better than the old one, whose 10-20 % hands were
   completed three times in four.
2. Against its own definition (nobody else goes out) the new figure is
   **cautious** in the middle: hands shown at 30-70 % were completed 15-20
   points more often. The cause is re-planning: the calibration player
   re-searches the whole catalogue every turn, while the simulation re-plans
   only among the versions it was given (up to 400). Most panel hands are
   very flexible (Crazy Chows was East's choice in about two hands of three).
   Keeping 64 versions instead of 200 made it worse; versions two tiles
   further did not help.
3. With the race on, which is what a player meets, the figure is close up
   to about 60 % and too high above it, since other players then go out
   first.

So the raw figure sits between the two: a little cautious for "can I build
it", a little hopeful for "will I win with it" at the top. It is left raw
rather than corrected with a fitted curve, pending the owner's choice in §11.

## 11. Questions after calibration

1. Keep the raw figure (proposed), raise the middle of the scale to match
   "nobody else goes out" with a curve fitted from the calibration run, or
   change the figure's meaning to include the race (phase 4)?
2. Is the panel quick enough on a phone? If not, the hint moves into a Web
   Worker.
