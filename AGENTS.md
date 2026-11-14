# AGENTS.md — int-maj

International mahjong, by the rules of *The Game of Mah Jong Illustrated*, on a
3D table in the browser against three bots. Goal and phases: `docs/PLAN.md`.

## Rule authority — the owner-designated primary scan

Two printed sources form the rules framework, in this order:

1. ***The Game of Mah Jong Illustrated*** (primary, normative). It governs
   every rule, tile, deal, wall, replacement, turn, call, win, ground score,
   payment and exception, and it overrides every conflicting prior decision,
   transcription, test or document.
2. ***The Mah Jong Player's Companion*** (supplement). It extends the primary
   source with its larger special-hand catalogue and its tiers. **Owner ruling,
   2026-11-11:** for the special-hand catalogue (which hands exist, their
   composition, tier and fishing figure) the Companion governs wherever both
   books print a hand; everywhere else it applies only where the primary book
   is silent. A table can also play with the Companion's hands only
   (`rules/RULES.md` Part III §5), and then shows nothing from the Illustrated.

The pages of both books are in the repository: `rules/pages/illustrated/pNN.jpg`
and `rules/pages/companion/pNN.jpg` (open-book spreads, see
`rules/pages/README.md`), with OCR text beside them, so any session can read
them. The PDF masters are the owner's offline backup, not on any machine
that works on the code; `scans/` paths in older documents name them.

`rules/RULES.md` is the single normative framework that records both, with a
provenance tag on every rule (`[I p.N]` primary, `[C p.N]` supplement,
`[A]` recorded assumption). `rules/SOURCE.md` holds the precedence and reading
protocol. Do not preserve a previous choice just because it was
owner-confirmed or already encoded.

Read the actual page, including diagrams, before making rule claims. OCR is a
navigation aid, not authority. Each page image costs a few thousand tokens:
find the page by its `[I p.N]`/`[C p.N]` tag or by searching the OCR text,
then open only that image, never the whole folder or the whole OCR file. Implement the source literally; do not
normalize an odd rule to another mahjong convention. If the source is unclear
or silent, record the exact page, evidence, uncertainty and the narrowest
assumption in `rules/archive/ASSUMPTIONS.md`; never quietly invent a rule.

**The book pages are the owner's copies of copyrighted books.** They live in
this repository only because it is private: never make it public, never copy
them into the app, never share them elsewhere.

## Existing rules and code

The rules reconciliation is complete for slices C1-C9: `rules/RULES.md` is
the normative framework, `rules/AUDIT.md` records the closed rows and the few
deliberately deferred table rulings, and the engine follows the framework.
Everything under `rules/archive/` is historical audit material, not
authority. The archive still holds the recorded assumptions for questions
both books leave open; read it for provenance, never as a rule source.
`.ignore` keeps the archive (except `ASSUMPTIONS.md`) out of searches; open a
file there by path when its provenance is needed.

## Project structure

```
app/          the 3D table: plain ES modules, no build step of its own
  index.html    the page; styles.css is its look
  src/          main (boot, loop, buttons), shared (state), input, hints,
                handbook (the index of all hands), result, menu, report (screens), board (state to tiles, with
                board-wall and board-hand), stage (renderer, camera, motion),
                tiles (tile models), layout (table geometry)
  assets/       tile faces and icons
  vendor/three/ Three.js 0.170
src/core/     the rules engine: pure and deterministic
  game/         the turn engine: reduce (apply), with hands, draws, settle
                and deal working on the draft copy
src/table/    the table service: sessions, bots, saving, `routeApi`
src/worker/   the Cloudflare Worker: files a problem report as a GitHub issue
src/cli/      the console table
bin/          command-line entry points: check, play, replay
scripts/      build, preview, smoke test, and art generators (scripts/art/)
test/         core/, table/, cli/, app/, helpers/ - mirroring the source
rules/        the rule framework, its evidence and the book pages
docs/         PLAN, APP and ENGINE references
```

Layers only call downwards: `app` -> `src/table` -> `src/core`; `src/worker`
(the one piece of server code, reached only by the Report button) also sits
on `src/table`. The app talks
to the game only through `routeApi` (via `src/table/local.ts`) and receives
`viewFor` projections and per-seat event text, never a `GameState` and never
another seat's concealed tile. Put new code in the layer that owns it and its
test in the matching `test/` folder.

## Workflow

The full workflow is `docs/WORKFLOW.md`. The rules every session follows:

- **Cloud only:** every session is a Claude cloud session in the `int-maj`
  environment, on a fresh clone of `main`; there is no local copy anywhere.
  Run `git pull` if the session has been open a while. Node 24 or later
  (`.nvmrc`) is required; the SessionStart hook in `.claude/settings.json`
  already put it first on PATH, and `npm test` refuses older ones.
- **Finish pushed:** a cloud container is discarded, so nothing finished may
  stay uncommitted or unpushed.
- **Always report the pull request:** every reply that mentions a pull request
  gives its number and full URL (`https://github.com/<owner>/<repo>/pull/<n>`),
  every time, including follow-ups and status updates, not only the first one.
  For a visual pull request, also give its preview link for testing
  (`https://pr-<number>-int-dev.mah-jong.workers.dev`), every time, and say
  whether it is live yet: it appears only after `Tests and build` passes and
  the preview job deploys it.
- Run `npm test` (under a minute) and `npm run typecheck` before every
  commit; Node only strips types, so the type check is the only thing that
  reads them. After changing anything under `app/`, also run `npm run smoke`
  (the built app in headless Chromium, a few minutes). `npm run dev` builds
  and serves the app; review boards
  (`/?state=turn|claim|wait|fishing|botfishing|announce|ron|win|drawn|result|goulash|claims`) and
  `/?phone` show a screen without playing to it.
- **Deliver autonomously** (owner-authorized, `docs/WORKFLOW.md` "Autonomous
  delivery loop"): on the session's `claude/...` branch, open a pull request
  (it gets a preview link comment), then by kind of change:
  - *Non-visual* (engine, rules, docs, tests, CI): enable auto-merge (GitHub
    MCP `enable_pr_auto_merge`, squash) and end the session; do not poll for
    CI or deploy. If auto-merge cannot be enabled, wait for green and
    squash-merge as before.
  - *Visual* (anything the player sees or hears): report the preview link and
    leave the PR open; the owner checks it on their phone and sends
    corrections into the same session. Merge only when the owner says so.
  - *Release to testers:* sessions cannot push tags (the push gets a 403).
    Tell the owner the next `v0.1.0-alpha.N` and the `main` commit to tag;
    the owner pushes the tag. It is the only way testers get a new build.
    The build takes its version from the tag, so there is nothing to bump:
    `package.json` stays at `0.1.0-dev`.
  Sites: green pushes to `main` deploy to https://int-dev.mah-jong.workers.dev
  (`Deploy dev (int-dev)`); testers are on https://int.mah-jong.workers.dev,
  which changes only on a `v*` tag (`Deploy testers (int)`). This relies on
  owner settings "Allow auto-merge" and a `main` ruleset requiring
  `Tests and build`.
- The look is the game's own: Riichi City is the quality bar, but never copy
  another app's art, tiles, characters, sounds or distinctive look.
- **No browser tooltips.** Never set a `title` on an element, as an attribute
  or a property: the browser would pop its box up on hover. That includes an
  image's or an SVG's, and an SVG `<title>` element. `test/app/no-tooltips.test.ts`
  and the smoke run enforce it. Only a design that explicitly calls for a
  native tooltip may add one, and that exception is recorded here.

## Engineering invariants

- `src/core/**` stays pure: no I/O, clock, `Math.random` (use seeded RNG), or
  network; zero runtime dependencies. `src/table/**` is pure too, apart from
  the storage handle `local.ts` is given. The only packages are dev tools
  (`typescript`, `@types/node`, `playwright`); nothing the game runs may
  import one.
- Hand-pattern data stays declarative; matching logic stays generic rather
  than accumulating hand-specific `if` cases. Declared melds are fixed sets
  in every decomposition.
- The table's geometry lives in `app/src/layout.js` as plain numbers, so
  `test/app/layout.test.ts` can prove that discards, walls, hands and melds
  never overlap; extend that test with any new table furniture.
- Keep positive and negative tests for implemented patterns. When a pattern or
  rule is corrected from the primary source, update its tests and citations
  too.
- Run the relevant test or scenario after behavioral changes; report honestly
  whether the tested tree includes uncommitted work.

## Interpretation discipline

The source is for international mahjong; do not substitute another variant's
rules. Interface references may guide presentation only, never rule semantics.
