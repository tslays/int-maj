# AGENTS.md — int-maj

International mahjong, by the rules of *The Game of Mah Jong Illustrated*, on a
3D table in the browser against three bots. Goal and phases: `docs/PLAN.md`.

## Rule authority — the owner-designated primary scan

Two printed sources form the rules framework, in this order:

1. ***The Game of Mah Jong Illustrated*** (primary, normative). It governs
   every rule, hand, tile, deal, wall, replacement, turn, call, win, score,
   payment and exception, and it overrides every conflicting prior decision,
   transcription, test or document.
2. ***The Mah Jong Player's Companion*** (supplement). It extends the primary
   source with its larger special-hand catalogue and its tiers; it applies
   only where the primary book is silent and never contradicts it.

The pages of both books are in the repository: `rules/pages/illustrated/pNN.jpg`
and `rules/pages/companion/pNN.jpg` (open-book spreads, see
`rules/pages/README.md`), so any session can read them. The PDF masters stay
local under `scans/`.

`rules/RULES.md` is the single normative framework that records both, with a
provenance tag on every rule (`[I p.N]` primary, `[C p.N]` supplement,
`[A]` recorded assumption). `rules/SOURCE.md` holds the precedence and reading
protocol. Do not preserve a previous choice just because it was
owner-confirmed or already encoded.

Read the actual page, including diagrams, before making rule claims. OCR is a
navigation aid, not authority. Implement the source literally; do not
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

## Project structure

```
app/          the 3D table: plain ES modules, no build step of its own
  src/          main (loop, buttons), board (state to tiles), stage (renderer,
                camera, motion), tiles (tile models), layout (table geometry)
  assets/       tile faces and icons; vendor/three/ is Three.js 0.170
src/core/     the rules engine: pure and deterministic
src/table/    the table service: sessions, bots, saving, `routeApi`
src/cli/      the console table
bin/          command-line entry points: check, play, replay
scripts/      build, preview, and art generators (scripts/art/)
test/         core/, table/, cli/, app/, helpers/ - mirroring the source
rules/        the rule framework, its evidence and the book pages
docs/         PLAN, APP and ENGINE references
```

Layers only call downwards: `app` -> `src/table` -> `src/core`. The app talks
to the game only through `routeApi` (via `src/table/local.ts`) and receives
`viewFor` projections and per-seat event text, never a `GameState` and never
another seat's concealed tile. Put new code in the layer that owns it and its
test in the matching `test/` folder.

## Workflow

The full workflow is `docs/WORKFLOW.md`. The rules every session follows:

- **Start with `git pull`** - another device may have pushed since this copy
  was made. Use Node 24 or later (`.nvmrc`); `npm test` refuses older ones.
- **Finish pushed:** never leave finished work uncommitted on one device.
- Run `npm test` before every commit. `npm run dev` builds and serves the app;
  review boards (`/?state=turn|claim|wait|fishing|win|drawn|result`) and
  `/?phone` show a screen without playing to it.
- Commit and push finished, tested work to `main` without asking. Pushing
  publishes: the `Deploy to Cloudflare` job in `.github/workflows/test.yml`
  deploys every push to `main` whose tests and build pass, to
  https://int.mah-jong.workers.dev. (`npm run deploy` publishes by hand
  from a machine logged in with wrangler.)
- **Deliver autonomously, end to end** (owner-authorized, `docs/WORKFLOW.md`
  "Autonomous delivery loop"): on a `claude/...` branch, open a pull request,
  wait for green CI, merge it into `main`, confirm the Cloudflare deploy
  succeeded, then report. Do not stop at a pushed branch or ask first.
- Work can be done from any machine, including a cloud session started from
  the owner's phone: the code, the book pages and the deploy all live in the
  repository and its CI.
- The look is the game's own: Riichi City is the quality bar, but never copy
  another app's art, tiles, characters, sounds or distinctive look.

## Engineering invariants

- `src/core/**` stays pure: no I/O, clock, `Math.random` (use seeded RNG), or
  network; zero runtime dependencies. `src/table/**` is pure too, apart from
  the storage handle `local.ts` is given.
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
