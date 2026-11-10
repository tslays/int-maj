# Plan

**Goal:** the best-looking international mahjong app, played by the rules of
*The Game of Mah Jong Illustrated* (see `rules/SOURCE.md`), with Riichi City's
table as the quality bar and the game's own look - never another app's art,
tiles, characters or sounds.

**First milestone: alpha-1 (`v0.1.0-alpha.1`), the tester release** - an
alpha the owner's mahjong group can test: each tester on their own phone (an
iPhone is the reference), alone against three bots, offline, no house rules,
no accounts or multiplayer (agreed 2026-11-07). Its scope, order and tracking
are in `docs/archive/ALPHA-1.md` (kept as the record of the plan); progress
is the GitHub milestone of the same name. The finished offline build once called
"Alpha 1" is now the "Prototype" below.

Every piece of work is judged by one question: does it bring that test
closer? Visual polish waits until a tester asks for something specific.

## Done

**Prototype - plays offline on any phone (2026-11-07).** (Once called "Alpha 1";
that name now belongs to the tester release.) The engine, bots and
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

**Bots that plan (2026-11-08).** The bots aim at concrete target hands
(`src/core/game/bot/plan.ts`) and call only when it raises the hand's value.
`npm run bot-soak` over 400 bot-only hands: 35 % drawn, against about 80 %
before; 98 % of wins are special hands. The same plan powers the "closest
hands" helper (the Hints panel).

**Alpha-1, the tester release (2026-11-09).** Version label (`alpha.1` plus the
build id), tester guide and in-app help (`docs/TESTING.md`), Report a problem
(build, device, seed and every move, shared from the menu and replayable with
`bin/replay.ts`), final standings after the North round, whose turn it is and
who threw each discard, the iPhone-pass fixes, sound, and a 300-hand soak on
the engine. Tracked in milestone `v0.1.0-alpha.1`; release gate is #43.

**Alpha-2 (2026-11-10).** The first findings from testing: the turn light
holds until a move has finished, tapping a second tile moves the lift instead
of swapping, iOS fixes (no zoom on the report note, the table re-fits when the
home-screen app resumes), and the tester site split from the development
site, with a preview link per pull request.

**Alpha-3, the housekeeping release.** A project review after alpha-2
(no rule or look changed): the tester build takes its version from its tag
(alpha-2 labelled itself alpha.1); a strict type check in CI, which found a
start option the engine ignored and a few smaller slips; a saved game now
survives an update that cannot replay the hand in progress; the turn engine
and the board were split into modules; the page's CSS left `index.html`; CI
builds once and deploys that build; and a browser smoke test
(`npm run smoke`) covers the screens no test ran before.

Testers: https://int.mah-jong.workers.dev (changes only on a `v*` tag).
Development: https://int-dev.mah-jong.workers.dev (every green push to `main`).

## Next

The testers decide this. Findings from testing become issues labelled
`from-testing`; the list below is the backlog from the alpha-1 plan, offered
as **candidates, not commitments**:

- Hand catalogue browser in the app, every hand pictured, with its book page.
- Deal animation.
- Settlement tier (beginner/intermediate/advanced) as a setting; the engine
  uses intermediate today.
- Bot tuning, including Crazy Chows being a common way for the bots to win
  (over a quarter of bot wins in the soak).

## Known follow-ups

- Done (2026-11-09): `apply` was profiled. Its cost was the wait check after
  every discard, which runs the hand matcher for every tile. The matcher now
  backtracks over one pool without copying, builds constant groups once and
  stops at the first allowed hand: `apply` is about 6x faster (23 ms to 4 ms
  per step in a cloud container), so a late-hand resume takes well under a
  second and `npm test` dropped from about 2.5 minutes to under one. Bot
  play was checked hand by hand against the old engine: identical.

## History

- 2026-10-31 to 11-04: hand catalogue, checker and turn engine; the rules
  were reconciled page by page with the primary scan (slices C1-C9, closed
  rows in `rules/AUDIT.md`, the brief in `rules/archive/SOURCE-AUDIT.md`).
- 2026-11-04 to 11-07: a 2D table was built and polished; it was replaced by
  the 3D table and removed on 2026-11-08.
