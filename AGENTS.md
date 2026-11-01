# AGENTS.md — int-maj

Thompson & Maloney international mahjong: 144 tiles (3 suits × 9 × 4 = 108, 4 winds × 4, 3 dragons × 4, 4 flowers, 4 seasons).

## Variant — do not substitute another ruleset
This is the Thompson & Maloney "Mah Jong" school (Kangaroo Press, 1997), which the book itself calls "a Western version of Mah Jong" collecting hands "already played in many countries" — an international set drawn from many regional games, not one country's ruleset: limit tiers half limit 500 / limit 1000 / middle 1500 / double 2000, plus "fishing". It is NOT MCR (Chinese Official, World Mahjong Organization, fan-pattern scoring with a point minimum) and NOT Riichi. Never import MCR fan values, Riichi yaku, or their minimums; where the book is silent, record the decision in rules/ASSUMPTIONS.md instead.

KNOWN ONLY FROM THIS COMMUNITY: this ruleset is played in a small expat circle and the book is effectively the only written source. Treat that book as the NORMATIVE spec, not as a sample of some larger standard — there is no outside authority to settle a dispute. Consequence for the code: every point the book leaves open (deal, flower handling, kong replacement, payment, minimum) becomes a named, defaulted flag in a variant profile object, with its rationale in rules/ASSUMPTIONS.md, so a house-rule change is a config edit and never a code change.

SCORING IS VERBATIM AND OPTIONAL: most players in this circle do not score at all; when they do, the book's tiers are used strictly as printed, with no house rules. So `score.ts` is a literal lookup over the transcribed tiers and fishing rule, and it MUST NOT influence `match.ts` — recognition and scoring are separate layers, and the matcher is the primary product.

RECOGNITION IS THE PRODUCT: the core question a player asks is "what is this 14-tile hand, and which hands could it still become". Keep `match(hand)` and a wait/completion query (`tiles that finish a given pattern`) first-class and independently usable.

REPEATED HANDS: the book prints the same hand under several groups (Wriggly Snake, Gertie's Garter, Dragon's Tail 1 & 2, Hachi Ban). Dedupe on canonical id, keep every page reference, and use `variantOf` — one shape must never yield two competing wins.

## Invariants (do not break)
- `src/core/**` is pure: no I/O, no clock, no `Math.random` (seeded RNG only), no network, zero runtime deps.
- Hand patterns are DATA. One pattern table is the single source of truth; never write hand-specific `if` logic in the matcher.
- Scoring is computed at win time from the pattern matches, not accumulated during play. Highest tier wins; tiers are not additive.
- No UI, no server, no persistence until the evaluator and scorer are green.
- Every pattern in the table has at least one positive and one negative test.

## Truth & uncertainty
- `rules/companion-ocr.txt` is OCR of a scan: it keeps the prose but LOSES the tile diagrams. Never infer a hand's tile composition from OCR alone; page renders (PNG) are the source for diagrams.
- The right margin trims one or two letters on pp. 4 and 30-32; nothing substantive is missing there (owner-confirmed). Read the evident meaning; do not mark a pattern provisional merely because a word is clipped.
- Unresolvable composition goes in `rules/NOTES.md`; play-rule choices go in `rules/ASSUMPTIONS.md`. Do not silently invent rules.

## Definition of done for a change
- `npm test` green, and the count of implemented patterns moved only by patterns that have tests.
- One hand group per commit, commit message naming the group.

## The book outranks convenience
If the book states something, implement it as written - even when it looks odd or contradicts what other mahjong variants do. The book is sometimes unclear; where it is, pick the reading that follows its printed words most literally, and record the reading in rules/ASSUMPTIONS.md. Never substitute a "more standard" rule for a printed one.
