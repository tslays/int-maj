# International Mahjong

International mahjong, played by the rules of *The Game of Mah Jong
Illustrated*, on a 3D table in the browser against three bots. It runs
offline, saves after every move and installs on a phone's home screen.

**Play:** https://int.mah-jong.workers.dev (landscape; add `?phone` to try
the phone layout on a laptop).

## Quick start

Node 24 or later; there is nothing to install.

```sh
npm run dev        # build the app and serve it on http://127.0.0.1:8091/
npm test           # every test (about 30 s)
```

Every push to `main` whose tests pass is published automatically, so the
project can be worked on from any device - a Mac, or a Claude cloud session
started from a phone. Start each session with `git pull` and end it pushed;
[docs/WORKFLOW.md](docs/WORKFLOW.md) has the details.

Command-line tools on the same engine:

```sh
npm run play                                     # a console table against three bots
npm run check -- "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5"   # what does a hand make or wait on?
npm run replay -- examples/readme-hand.json      # replay a recorded hand
```

## Project layout

```
app/              the 3D table (browser, plain ES modules)
  index.html        the page; table3d.html redirects old links here
  src/              main (loop, buttons), board (state to tiles), stage (renderer,
                    camera, motion), tiles (tile models), layout (table geometry)
  assets/           tile faces (public domain) and app icons
  vendor/three/     Three.js 0.170, vendored (MIT)
src/
  core/             the rules engine: pure, deterministic, no dependencies
  table/            the table service: games, bots, saving, the API the app calls
  cli/              the console table behind `npm run play`
bin/              command-line entry points: check, play, replay
scripts/          build (src + app into dist/) and preview
test/             core/, table/, cli/, app/ and shared helpers/
rules/            the rule framework, its sources, audit and scan tools
docs/             PLAN, ENGINE and APP references
examples/         a recorded hand for the replay tool
```

The layers only call downwards: `app` uses `table`, `table` uses `core`, and
`core` uses nothing. `src/core` stays pure (no I/O, no clock, no
`Math.random`), so every game replays exactly from its seed.

## Rules

`rules/RULES.md` is the single normative rule set. Every rule carries its
source: `[I p.N]` for the primary book, *The Game of Mah Jong Illustrated*
(the scan is local under `scans/`, not committed), `[C p.N]` for its
supplement, *The Mah Jong Player's Companion*, and `[A]` for a recorded
assumption where both books are silent. `rules/SOURCE.md` sets the precedence
and how to read a page; `rules/AUDIT.md` records every correction made to the
engine against the scan.

## Documentation

- [docs/PLAN.md](docs/PLAN.md) - the goal and the alpha phases
- [docs/WORKFLOW.md](docs/WORKFLOW.md) - working from any device, deploying,
  the Cloudflare token
- [docs/APP.md](docs/APP.md) - the 3D table, the table service and its API,
  saving, offline use and deploying
- [docs/ENGINE.md](docs/ENGINE.md) - the hand catalogue, fishing, the
  checker, the turn engine and the console table
- [AGENTS.md](AGENTS.md) - working rules for anyone (or any model) changing
  this code

## Testing

`npm test` runs Node's built-in test runner on the TypeScript directly. It
covers the catalogue and scoring against the book, the turn engine, a
self-played soak of seeded hands (tile conservation, zero-sum payments,
replay), the table service's API (no hidden tile ever reaches the app),
saving and resuming, the offline build, and the table's discard geometry.
`npm run soak` plays 300 hands; GitHub runs it nightly.
