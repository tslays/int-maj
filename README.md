# International Mahjong

International mahjong, played by the rules of *The Game of Mah Jong
Illustrated*, on a 3D table in the browser against three bots. It runs
offline, saves after every move and installs on a phone's home screen.

**Play:** https://int.mah-jong.workers.dev (landscape; add `?phone` to see the
phone layout on a laptop).

**Status:** alpha. Whole games play end to end; the next step is a test by the
owner's mahjong group, each player alone against the bots on their own phone.
The roadmap is [docs/PLAN.md](docs/PLAN.md).

## What you get

- **The book's game.** Every rule, hand and payment follows the printed source,
  with page citations ([Rules](#rules) below); the special hands come from the
  book and its supplement, *The Mah Jong Player's Companion*.
- **A full table.** Draws and discards, chows, pungs and kongs, fishing, the
  Goulash, the result card with the book's arithmetic, and the next hand.
- **Bots that plan.** Each bot aims at concrete target hands and calls only
  when that raises its hand's value. The "closest hands" panel shows you the
  same plan for your own tiles (the menu's Hints button hides it).
- **Plays anywhere.** A static site: it works in airplane mode, saves after
  every move and resumes where you left off. Add it to the home screen from
  Safari to install it.

## How work gets done

The project is built through Claude Code cloud sessions; GitHub's `main`
branch is the only shared copy, and every green push to it is live within
minutes.

```
prompt -> cloud session on a claude/... branch -> pull request
       -> CI: tests + build -> squash-merge into main
       -> CI again on main -> Deploy to Cloudflare -> int.mah-jong.workers.dev
```

Sessions follow [AGENTS.md](AGENTS.md) and run that whole chain without
asking; merged branches are deleted by GitHub. The details - starting a
session, the delivery loop, the Cloudflare token and its expiry - are in
[docs/WORKFLOW.md](docs/WORKFLOW.md).

## Working on it

Node 24 or later (`.nvmrc`); there are no dependencies to install. In a
Claude cloud session, a startup hook (`.claude/hooks/session-start.sh`)
selects Node 24 by itself.

| Command | What it does |
| --- | --- |
| `npm run dev` | build the app and serve it on http://127.0.0.1:8091/ |
| `npm test` | every test (a few minutes) |
| `npm run play` | a console table against three bots |
| `npm run check -- "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5"` | what a hand makes or waits on |
| `npm run replay -- examples/readme-hand.json` | replay a recorded hand |
| `npm run soak` | 300 self-played hands (GitHub runs it nightly) |
| `npm run bot-soak` | bot-only games: drawn rate and which hands win |

Review boards show one screen without playing up to it:
`/?state=turn|claim|wait|fishing|win|drawn|result`.

## Project layout

```
app/              the 3D table (browser, plain ES modules, Three.js 0.170 vendored)
src/
  core/             the rules engine: pure, deterministic, no dependencies
  table/            the table service: games, bots, saving, the API the app calls
  cli/              the console table behind `npm run play`
bin/              command-line entry points: check, play, replay
scripts/          build (into dist/), preview, soaks and art generators
test/             core/, table/, cli/, app/ and shared helpers/
rules/            the rule framework, its audit and the book pages
docs/             PLAN, WORKFLOW, APP and ENGINE references
examples/         a recorded hand for the replay tool
.github/          CI: tests and build on every push and PR, deploy on main
.claude/          Claude Code settings: the startup hook that selects Node 24
```

The layers only call downwards: `app` uses `table`, `table` uses `core`, and
`core` uses nothing. The app sees only its own seat's view, never another
player's concealed tiles. `src/core` has no I/O, clock or `Math.random`, so
every game replays exactly from its seed.

## Rules

[rules/RULES.md](rules/RULES.md) is the single normative rule set. Every rule
carries its source: `[I p.N]` for *The Game of Mah Jong Illustrated* (the
primary book), `[C p.N]` for *The Mah Jong Player's Companion* (used only
where the primary book is silent) and `[A]` for a recorded assumption where
both are silent. [rules/SOURCE.md](rules/SOURCE.md) sets the precedence and
how to read a page; [rules/AUDIT.md](rules/AUDIT.md) records every correction
made to the engine against the books.

The pages of both books are in `rules/pages/` so any session can check a rule
against the page. They are the owner's copies of copyrighted books: **this
repository must stay private**, and a test proves the build never ships them.

## Testing

`npm test` runs Node's built-in test runner on the TypeScript directly. It
covers the hand catalogue and scoring against the book, the turn engine, a
self-played soak of seeded hands (tile conservation, zero-sum payments,
replay), the table service's API (no hidden tile reaches the app), saving
and resuming, the offline build, and the table geometry (nothing overlaps).

## Documentation

- [docs/PLAN.md](docs/PLAN.md) - the goal, what is done, the alpha phases
- [docs/WORKFLOW.md](docs/WORKFLOW.md) - sessions, the delivery loop,
  deploying, the Cloudflare token
- [docs/APP.md](docs/APP.md) - the 3D table, the table service and its API,
  saving, offline use
- [docs/ENGINE.md](docs/ENGINE.md) - the hand catalogue, fishing, the
  checker, the turn engine and the console table
- [AGENTS.md](AGENTS.md) - working rules for anyone, or any model, changing
  this code
