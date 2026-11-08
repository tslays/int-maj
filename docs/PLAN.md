# Plan

**Goal:** the best-looking international mahjong app, played by the rules of
*The Game of Mah Jong Illustrated* (see `rules/SOURCE.md`), with Riichi City's
table as the quality bar and the game's own look - never another app's art,
tiles, characters or sounds.

**First milestone:** an alpha the owner's mahjong group can test - each tester
on their own phone (an iPhone is the reference), alone against three bots,
offline, no house rules, no accounts or multiplayer (agreed 2026-11-07).

Every piece of work is judged by one question: does it bring that test
closer? Visual polish waits until a tester asks for something specific.

## Done

**Alpha 1 - plays offline on any phone (2026-11-07).** The engine, bots and
table service run in the browser from a static build; the game saves after
every move with a checkpoint per hand; the app installs from Safari and plays
in airplane mode; scores come from the engine. On the way the Wind of the
Round was corrected to R-032 (AUDIT A28): it advanced on every pass of the
deal and ended a game after about four hands.

**The 3D table (2026-11-07/08).** The owner chose a 3D table after a
prototype. It plays whole games against the bots: draws and throws, claims
(chow runs behind one button), kongs, fishing, Goulash picks, the result card
with the book's arithmetic, next hand, undo, save and resume, review boards
(`?state=`), a phone frame (`?phone`), a tested discard pinwheel, and melds
laid by table custom in each player's wall lane from the left corner. The 2D
client and its art were removed, and the repository was restructured into
`app/`, `src/core`, `src/table`, `src/cli`, `scripts/` and grouped tests
(2026-11-08).

**Work from anywhere (2026-11-08).** Every green push to `main` deploys
through GitHub Actions, and the book pages are in the private repository, so
a Claude cloud session started from the owner's iPhone can do any task
without the Mac (`docs/WORKFLOW.md`).

Live at https://int.mah-jong.workers.dev.

## Next

- **Try it on a real iPhone** (smoothness, tap size, pace) and fix what that
  shows.

## Alpha 2 - the table explains itself

- Whose turn it is and who threw each discard, readable at a glance.
- The hand catalogue in the app, every hand pictured, with its book page.
- "Report a problem": export the seed and steps (the saved game already is
  this) so any tester's hand can be replayed exactly.

## Alpha 3 - bots worth playing against

- Before 2026-11-08 about 80 % of bot-only hands ended drawn and special
  hands were rare. The bots now plan towards concrete target hands
  (`src/core/game/bot/plan.ts`): special hands appear in bot play, calls are
  made only when they raise the hand's value. Still open: the drawn rate, and
  the "closest hands" helper for the player.
- Give each catalogue hand a generator of its completing tile sets, so the
  distance to every hand can be computed; bots aim for the nearest reachable
  hand, discard towards it and chow when it helps. The same data powers a
  "closest hands" helper for the player.
- *Accept:* far fewer drawn hands in the soak, special hands appear.

## Alpha 4 - release to the group

- A game-end screen (final scores after the North round), the book's
  beginner/intermediate/advanced settlement as a setting, a version label
  and a short tester guide.
- A deal animation and sound.

## Known follow-ups

- `apply` costs about 3-4 ms per decision, so resuming late in a hand replays
  for up to a second; worth profiling before the alpha.

## History

- 2026-10-31 to 11-04: hand catalogue, checker and turn engine; the rules
  were reconciled page by page with the primary scan (slices C1-C9, closed
  rows in `rules/AUDIT.md`, the brief in `rules/archive/SOURCE-AUDIT.md`).
- 2026-11-04 to 11-07: a 2D table was built and polished; it was replaced by
  the 3D table and removed on 2026-11-08.
