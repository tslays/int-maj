# Rule source and authority

## Normative source

The owner designated the original rulebook scans in `scans/` as the main source
for international mahjong on 2026-11-04. Use the actual pages in this PDF for
all rule semantics; it takes precedence over every conflicting earlier owner
choice or project interpretation.

- **Reading copy:** `scans/The Game of Mah Jong Illustrated - trimmed.pdf`
- **Untouched original:** `scans/The Game of Mah Jong Illustrated.pdf`
- **Identification:** the cover reads *The Game of Mah Jong Illustrated*, by
  Patricia A. Thompson and Betty Maloney, Kangaroo Press; it carries a 1990
  copyright. This is the owner-designated primary source regardless of what
  later editions, extracted notes or earlier project documents say.
- **Extent:** 33 scanned PDF pages. The original SHA-256 is
  `dd9b35d34509feeb379fdb0e6ca79ea685b95dae98814bcdd7ed0d1075906fbb`.
- **Crop method:** `rules/crop-primary-source.swift` detects each page edge and
  writes a non-destructive PDF copy with per-page CropBoxes and a 0.25% safety
  border. It preserves the untouched original and the underlying scan images;
  ordinary PDF viewers display the cropped page area. The script refuses to
  overwrite an existing output.

## Precedence

Two printed sources form the framework; they are not peers.

1. **`The Game of Mah Jong Illustrated` (primary, normative).** Its text and
   diagrams settle every question. Where it speaks, it wins outright.
2. **`The Mah Jong Player's Companion` (supplement).** It extends the primary
   source: it carries the enlarged special-hand catalogue, the limit tiers and
   the fishing figures. A Companion statement applies only where the primary
   source is silent, and only if it does not contradict it.
3. **Recorded assumptions** in `rules/ASSUMPTIONS.md`, for questions both books
   leave open.
4. Any later explicit source designation from the owner.

A Companion rule that contradicts the Illustrated page is not a house rule and
not a variant to preserve: the Illustrated reading replaces it, and the
Companion's version is recorded as superseded in `rules/AUDIT.md`. Where the
Companion adds something the Illustrated book does not print (extra hands,
extra tiers), it stands as an extension and is tagged as such in
`rules/RULES.md`.

Prior owner choices, proposals, tests, code and documents do **not** outrank
either book. Neither an outside mahjong variant nor a supposedly standard
convention may fill a gap. Do not call a rule absent until both sources have
been checked.

## Existing project material — pending reconciliation

The existing pattern catalogue and game engine were built from the
Companion's catalogue without the primary book. The following are interim work
products: they may be extended by the Companion, but anything they state that
the Illustrated book contradicts is wrong and must change:

- `rules/PLAY.md` — prior proposals and owner decisions;
- `rules/ASSUMPTIONS.md` — prior rules and implementation assumptions;
- `rules/NOTES.md` and `rules/MISSING.md` — prior source readings and gaps;
- `rules/pages/`, `rules/companion-ocr.txt`, and other OCR/transcriptions —
  earlier source material;
- `src/core/patterns/table.ts`, gameplay code and tests — existing behavior.

They remain useful as an audit checklist. None has yet been fully reconciled
against the primary scan, so treat rules encoded there as unverified; change
them wherever the scan requires it. Do not claim full rule fidelity until this
audit is done.

## Reading and implementation protocol

- Cite the printed page (and PDF page where helpful) for each extracted rule.
- Inspect the cropped scan itself, including tile diagrams and page layout.
  OCR can help locate text, but OCR output alone cannot settle wording,
  composition, score figures or a missing/clipped passage.
- Follow the printed rule literally, even if it looks unusual. Do not quietly
  normalize it or preserve a conflicting house decision.
- Where the source is genuinely unclear or silent, record the exact evidence,
  competing literal readings and chosen narrow assumption in
  `rules/ASSUMPTIONS.md`; keep it clearly separate from transcribed facts.
- Update implementation, tests and user-facing rule descriptions together.
  Test any behavioral change against the specific affected scenario.
