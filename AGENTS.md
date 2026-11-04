# AGENTS.md — int-maj

## Rule authority — the owner-designated primary scan

Two printed sources form the rules framework, in this order:

1. **`scans/The Game of Mah Jong Illustrated - trimmed.pdf`** (primary,
   normative). It governs every rule, hand, tile, deal, wall, replacement,
   turn, call, win, score, payment and exception, and it overrides every
   conflicting prior decision, transcription, test or document.
2. **The Mah Jong Player's Companion** (supplement). It extends the primary
   source with its larger special-hand catalogue and its tiers; it applies
   only where the primary book is silent and never contradicts it.

`rules/RULES.md` is the single normative framework that records both, with a
provenance tag on every rule (`[I p.N]` primary, `[C p.N]` supplement,
`[A]` recorded assumption). `rules/SOURCE.md` holds the precedence and reading
protocol. Do not preserve a previous choice just because it was
owner-confirmed or already encoded.

Read the actual cropped page, including diagrams, before making rule claims.
OCR is a navigation aid, not authority. Implement the source literally; do not
normalize an odd rule to another mahjong convention. If the source is unclear
or silent, record the exact page, evidence, uncertainty and the narrowest
assumption in `rules/archive/ASSUMPTIONS.md`; never quietly invent a rule.

## Existing rules and code are pending audit

`rules/archive/PLAY.md`, `rules/archive/ASSUMPTIONS.md`, `rules/archive/NOTES.md`, `rules/archive/MISSING.md`,
`rules/.generated/pages/`, earlier OCR, the pattern table and gameplay code were built
from earlier work. They are useful as an audit checklist, but are not
normative and may conflict with the primary scan. Until checked page by page,
do not claim the catalogue or runtime is faithful to the primary source.
See `rules/SOURCE.md` for the migration status and file hierarchy.

## Engineering invariants

- `src/core/**` stays pure: no I/O, clock, `Math.random` (use seeded RNG), or
  network; zero runtime dependencies.
- Hand-pattern data stays declarative; matching logic stays generic rather
  than accumulating hand-specific `if` cases.
- Keep positive and negative tests for implemented patterns. When a pattern or
  rule is corrected from the primary scan, update its tests and citations too.
- Run the relevant test or scenario after behavioral changes; report honestly
  whether the tested tree includes uncommitted work.

## Interpretation discipline

The source is for international mahjong; do not substitute another variant's
rules. Interface references may guide presentation only, never rule semantics.
