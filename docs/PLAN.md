# Plan

Written down so every slice is judged against the same target: a quiet, crisp
international-mahjong table that reads like Tenhou's, follows the owner-designated
primary rule scan (see `rules/SOURCE.md`), and behaves like a finished game.

## M0 — repository tidy (done 2026-11-04)

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

## Blocking priority — reconcile the rules source (done)

The page-by-page work is complete: [`rules/RULES.md`](RULES.md) is the single
framework (Illustrated book normative, Companion supplement, provenance tag per
rule), and [`rules/AUDIT.md`](AUDIT.md) records the closed reconciliation rows.
The C1-C9 slices are landed and `npm test` is green with 344 tests. A few
table rulings are deliberately deferred and listed in `rules/AUDIT.md`; they
are not claimed as implemented.

## Done so far

Audited catalogue (53 Illustrated entries plus the Companion supplement),
ground-score/doubling scoring, all-three payments with East doubling, the
printed deal and loose/dead walls, robbing the kong and chow precedence,
fishing as an announced state, round-wind progression and Goulash marking, the
Western and Chinese profiles, table-side checker, deterministic turn engine,
soak test, console table, web table (server + client), Tenhou-scale board, the
reference overlay, claims/wait/result panels, review states (`?state=`), and
one design-token set (`docs/STYLE.md`) that the stylesheet reads exclusively.

## M1 — Reviewable states and design tokens

*Why:* we can only see one mid-game board, and every CSS number is invented in
place. Nothing after this can be judged until each state can be seen alone.

- `?state=turn|claim|wait|fishing|win|drawn|result` renders a deterministic
  board for that state (fixed seed, fixed hand), so each screen can be looked
  at, screenshotted and diffed.
- A `docs/STYLE.md` of tokens: one spacing scale, one type scale, one colour
  set, one tile unit — and the CSS rewritten to use only those.
- *Accept:* every state renders without errors at 1440x900 and 1280x800; the
  layout proof still passes; the tokens file is the only place numbers live.

## M2 — Components and motion

*Why:* `render()` rebuilds the board each action, so tiles cannot move and
states flash.

- Split the client into components (tile, river, seat, hand, actions, result)
  that create their DOM once and update in place.
- Motion from the tokens: tile lifts, discard slides hand→river, draw lifts,
  claim bar enters; all under `prefers-reduced-motion`.
- *Accept:* playing a hand shows no full-board flash; a discard animates from
  the hand to its slot; layout proof unaffected.

## M3 — A game, not a demo

- Persistence: the server writes the session (seed, actions, scores) and
  resumes it after reload or restart. Not started.
- Multi-hand rounds: dealer rotation, East round progression, running
  scorecard, hand history. The engine rounds are done (C6); the scorecard and
  hand history in the client remain.
- *Accept:* close the tab mid-hand, reopen, continue exactly; a round of four
  hands rotates the dealer correctly and the scorecard sums to zero.

## M4 — Teach and include

- A keys/help sheet in-app, first-run hint, `aria-live` turn announcements,
  focus order, contrast checked in both themes.

## M5 — Ship

- Sound set (the claim cue plus discard/win), final motion pass, README with
  screenshots, a `npm run serve -- --demo` that plays itself.

## Out of scope, deliberately

Avatars, emotes, gacha, timers, riichi furniture; unrelated rules changes.
Source-faithful corrections required by `rules/SOURCE.md` are in scope.
