# Plan

Written down so every slice is judged against the same target: a quiet, crisp
international-mahjong table that reads like Tenhou's, follows the owner-designated
primary rule scan (see `rules/SOURCE.md`), and behaves like a finished game.

## Blocking priority — reconcile the rules source

The current rules, pattern catalogue and game behavior were built from earlier
transcriptions and have not yet been fully checked against the primary scan.
The page-by-page work is specified in [`docs/SOURCE-AUDIT.md`](SOURCE-AUDIT.md)
(milestones A-D, spread map and evidence rules), and its result is
[`rules/RULES.md`](RULES.md) — one framework: the Illustrated book as the
normative rubric, the Companion as its supplement, with a provenance tag per
rule.
Reconcile each rule and pattern against its printed text/diagrams, let the scan
overrule conflicting owner decisions, update citations/tests/docs, and keep
unresolved source ambiguity explicit. Until this is complete, do not claim the
runtime follows the primary source. This source-faithful reconciliation is in
scope even though unrelated rules changes are not.

## Done so far

Hand-pattern catalogue (85), table-side checker, deterministic turn engine,
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
  resumes it after reload or restart.
- Multi-hand rounds: dealer rotation, East round progression, running
  scorecard, hand history.
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
