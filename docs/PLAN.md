# Plan

The target is an **alpha the owner's mahjong group can play**: each tester on
their own device (an iPhone is the bar), alone against three bots, offline,
following *The Game of Mah Jong Illustrated* as literally as possible (see
`rules/SOURCE.md`). Every slice is judged by one question: does it bring that
test closer? Visual polish waits until a tester asks for something specific.

Agreed with the owner, 2026-11-07: solo against bots first; any device, iPhone
as the reference; no house rules; offline only, no accounts or multiplayer.

## Alpha 1 — Plays offline on any phone (done 2026-11-07)

- The engine, bots and API routes run in the browser: `npm run build` emits a
  static `dist/` (`tools/build-web.ts`), the routes are one pure function
  shared with the dev server (`src/server/api.ts`).
- The game is saved after every move and resumes after a reload or eviction;
  a checkpoint per hand keeps resume and undo to one hand's replay.
- Installable from Safari (manifest, icons, service worker) and playable in
  airplane mode.
- Running scores come from the engine (`scoresBefore`), not the browser.
- Found on the way: the Wind of the Round advanced on every pass of the deal,
  ending a game after about four hands; corrected to R-032 (AUDIT A28).
- Live at https://int-maj.int-maj.workers.dev, deployed with `npm run deploy`
  (README, "Deploying"). *Remaining:* install it on a real iPhone and play a
  hand in airplane mode.

## The display: a 3D table (decided 2026-11-07)

The owner's bar is Riichi City's table. The 2D client (`web/app.js`, kept at
`/` for now) is not polished further; the new table is `web/table3d.html`
with `web/3d/` (Three.js 0.170, vendored under `web/vendor/three/`, MIT):

- `tiles.js` models a tile (ivory front, sky-blue back, face from `faces/`
  with a corner index); `stage.js` holds the renderer, the table, the solved
  camera and promise-based tweens with a timer fallback; `board.js`
  reconciles each answer with the table and animates only the difference;
  `main.js` is the loop, the decisions, the call-outs and the result card.
- Done: real games against the bots, draws and throws, claims (chow variants
  behind one button), kongs, fishing, Goulash picks, result and next hand,
  save/resume, review states (`?state=`), landscape only.
- Next: check it on a real iPhone; make it the start page; then Alpha 2-4
  below are built into this table, not the 2D one.

## Alpha 2 — The table explains itself

- Scores, whose turn it is, and who threw each discard, visible on a phone.
- Portrait: either a real layout or a clear "turn your phone" screen.
- The hand catalogue in the app, every hand pictured, with its book page.
- "Report a problem": export the seed and steps (the saved game already is
  this) so any tester's hand can be replayed exactly.

## Alpha 3 — Bots worth playing against

- Today about 80 % of bot-only hands end drawn and special hands are rare.
- Give each catalogue hand a generator of its completing tile sets, so the
  distance to every hand can be computed; bots aim for the nearest reachable
  hand, discard towards it and chow when it helps. The same data powers a
  "closest hands" helper for the player.
- *Accept:* far fewer drawn hands in the soak, special hands appear.

## Alpha 4 — Release to the group

- A full game end screen (final scores after the North round), the book's
  beginner/intermediate/advanced settlement as a setting, a version label and
  a short tester guide.

## Known follow-ups

- `apply` costs about 3-4 ms per decision, so resuming late in a hand replays
  for up to a second; worth profiling before the alpha.
- The book starts each player with counters worth 16,000 points (p. 23); the
  scorecard starts at zero.
- The browser-driven tests (`rhythm`, `layout-geometry`) measure wall-clock
  time and fail now and then on a busy machine (GitHub's runner, or locally
  while other test files run in parallel). The rhythm gap check now tolerates
  one slow frame; the layout contract failed once in four full local runs.

## History

### M0 — repository tidy (done 2026-11-04)

Owner request, 2026-11-04: the folder structure and architecture should read as
one tidy project once extraction is done. Do this only when no agent is running,
because the moves touch files the extraction is citing.

Problems now: `rules/` mixes the normative documents with eight OCR scripts and
several generated dumps; two superseded notes files sit beside the framework;
generated renders (135 MB) live inside `rules/`; tools are split between `rules/`
and `tools/`.

Target layout:

- `rules/` — normative and evidence only: `RULES.md`, `SOURCE.md`, `AUDIT.md`,
  `PRIMARY-RULES.md`, `PRIMARY-HANDS.md`.
- `rules/archive/` — superseded notes kept for the audit trail: `PLAY.md`,
  `ASSUMPTIONS.md`, `NOTES.md`, `MISSING.md`, with a one-line header saying what
  replaced them.
- `rules/tools/` — every script that produces evidence: `ocr*.swift`,
  `cellocr.swift`, `dump.swift`, `crop-primary-source.swift`,
  `primary-pages.swift`.
- `rules/.generated/` — gitignored renders, OCR text and TSV dumps (`pages/`,
  `primary-pages/`, `*.txt`, `*.tsv`), produced by those tools.
- `docs/` — `PLAN.md`, `SOURCE-AUDIT.md`, `STYLE.md`, `UI-SPEC.md`; audit briefs stay
  with the plan, not with the rule text.

Acceptance: every path in `README.md`, `AGENTS.md`, `rules/*.md`, `docs/*.md`,
`src/**` and the tools resolves after the move (grep for the old paths returns
nothing); `.gitignore` matches the new generated directory; `git status` clean;
`npm test` green; no generated file is tracked.

### Blocking priority — reconcile the rules source (done)

The page-by-page work is complete: [`rules/RULES.md`](RULES.md) is the single
framework (Illustrated book normative, Companion supplement, provenance tag per
rule), and [`rules/AUDIT.md`](AUDIT.md) records the closed reconciliation rows.
The C1-C9 slices are landed and `npm test` is green with 344 tests. A few
table rulings are deliberately deferred and listed in `rules/AUDIT.md`; they
are not claimed as implemented.

### Done so far

Audited catalogue (53 Illustrated entries plus the Companion supplement),
ground-score/doubling scoring, all-three payments with East doubling, the
printed deal and loose/dead walls, robbing the kong and chow precedence,
fishing as an announced state, round-wind progression and Goulash marking, the
Western and Chinese profiles, table-side checker, deterministic turn engine,
soak test, console table, web table (server + client), Tenhou-scale board, the
reference overlay, claims/wait/result panels, review states (`?state=`), and
one design-token set (`docs/STYLE.md`) that the stylesheet reads exclusively.

### M1 — Reviewable states and design tokens

*Why:* we can only see one mid-game board, and every CSS number is invented in
place. Nothing after this can be judged until each state can be seen alone.

- `?state=turn|claim|wait|fishing|win|drawn|result` renders a deterministic
  board for that state (fixed seed, fixed hand), so each screen can be looked
  at, screenshotted and diffed.
- A `docs/STYLE.md` of tokens: one spacing scale, one type scale, one colour
  set, one tile unit — and the CSS rewritten to use only those.
- *Accept:* every state renders without errors at 1440x900 and 1280x800; the
  layout proof still passes; the tokens file is the only place numbers live.

### M2 — Components and motion

*Why:* `render()` rebuilds the board each action, so tiles cannot move and
states flash.

- Split the client into components (tile, river, seat, hand, actions, result)
  that create their DOM once and update in place.
- Motion from the tokens: tile lifts, discard slides hand→river, draw lifts,
  claim bar enters; all under `prefers-reduced-motion`.
- *Accept:* playing a hand shows no full-board flash; a discard animates from
  the hand to its slot; layout proof unaffected.

### M3 — A game, not a demo

- Persistence: the server writes the session (seed, actions, scores) and
  resumes it after reload or restart. Not started.
- Multi-hand rounds: dealer rotation, East round progression, running
  scorecard, hand history. The engine rounds are done (C6); the scorecard and
  hand history in the client remain.
- *Accept:* close the tab mid-hand, reopen, continue exactly; a round of four
  hands rotates the dealer correctly and the scorecard sums to zero.

### M4 — Teach and include

- A keys/help sheet in-app, first-run hint, `aria-live` turn announcements,
  focus order, contrast checked in both themes.

### M5 — Ship

- Sound set (the claim cue plus discard/win), final motion pass, README with
  screenshots, a `npm run serve -- --demo` that plays itself.

### Out of scope, deliberately

Avatars, emotes, gacha, timers, riichi furniture; unrelated rules changes.
Source-faithful corrections required by `rules/SOURCE.md` are in scope.
