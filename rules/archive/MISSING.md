> **Superseded by `rules/RULES.md` (2026-11-04):** this document is prior
> project material. The normative framework is `rules/RULES.md` — the scanned
> *The Game of Mah Jong Illustrated* as the rubric, the Companion as supplement.
> Anything here that conflicts with it is wrong; see `rules/AUDIT.md` for the
> conflict list.

# What this scan loses (measured, page by page)

> **Owner confirmation, 2026-10-31:** nothing substantive is missing on pages 4 and 30-32. The right margin trims the last one or two letters of a few words ("Fishing", "hands", "Exposed"); no value, hand or rule is absent. Treat truncated fragments on those pages as COMPLETE — read the evident meaning and move on. The list below is a record of where the margin bites, not a list of unknowns.

Method: every page re-OCR'd at 3x with Vision, each text box's bounding box recorded. A line whose right edge lands at x >= 0.995 of the page box is cut by the scan itself. 146 lines qualify. The scan is cropped down its right margin, so it is not OCR error — the pixels are not there.

## 1. Page 4 — SCORING block
The right margin clips the label, not the value. The synopsis's right column
prints the same per-tier figures beside every hand: **half 200, limit 400,
middle 600, double 800**. They are transcribed in `TIER_FISHING`. The prose
beside the page-4 block is still partly cut; the owner's definition in
`rules/archive/PLAY.md` is authoritative for the rule (an announced, fixed wait).

## 2. Pages 30-32 — FULL SYNOPSIS
The synopsis is a spread. The right page was initially missed; page 57
carries pages 20-30, page 59 pages 31-46, and page 61 pages 48-54, plus the
printed Winning/Fishing columns. All have now been transcribed with Vision
bounding boxes. The remaining clipped fragments are:
- "GG or GG/GG + Five or six Pr of GREEN BAMBOOS (2, 3, 4, 6[, 8])"
- "GG + RR + Five Pr RED & GREEN BAMBOOS (RED 1, 5, 7, 9[, …])"
- "RRR + WWW + Run 1-7 or 2-8. One paired, CHARACTERS or [CIRCLES]"
- "P/K of Corresponding* Dragons + Run 2-8, ONE paired + 111 or [999]"
- "RRR + GG + Pung of Red Bamboos, Pung of Circles, Pung of CI[rcles]"
- "ODD numbers in two suits + EVEN numbers in Third suit one tile o[f …]"
- "Chow in First suit + Two Chows in Second suit + Chow and Pr in T[hird …]"
- "Run 1-9 in one suit + any two tiles paired + P/K of Winds or Dragon[s]"
- "Run 2-8 + one paired + 111 or 999, All in same suit + P/K of Correspondin[g Dragons]"
- "Run 1-7 or 2-8 + one paired of Characters or Circles + RRR + WWV"  (WWV is OCR noise)
- "GGG/G + Three P/K (or a Chow) + Pr GREEN BAMBOOS (2, 3, 4[, …])"
- "Pr GREEN BAMBOOS (2, 3, 4 …" and "Pung of Red Bamboos, Pu[ng …]"

## 3. Hand pages — tier labels
Every page 7-29 prints tiers as "LIMIT (Concealed) HALF LIMIT (Expo[sed])" or "DOUBLE LI[mit]" / "HALF LIM[it]" / "LIM[it]"; the exposed half is always cut mid-word. The pattern is consistent, so it is inferable, but treat each label as provisional until confirmed:
    p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19, p20, p21, p22, p23, p24, p25, p26, p27, p28, p29

## 4. Hand pages — composition sidebars (dangerous: tail lost)
- p5  Confused Gates: "… + P/K 1s + P/K 9s in Three different sui[ts]"
- p7  Guardian Winds: "One of each W[ind]…"; "Three Pairs Winds OR Thi[s]"; footnote "…Pung/K Dragons and Pair D[ragons]"
- p8  Dragon's Gates: "Pung/K Dragon[s]"; tail of "LIMIT ([Concealed]"
- p11 Chop Suey / Chow Mein: "One o[f each Wind]"
- p13 Seven Twins: "All tiles from wall-INCLUDING [the last]"
- p14 Dragonette: "Three Pairs same suit-no 1s or 9s" (tail lost)
- p16 Windy Ones / Windy Nines / Windvane: "Pungs/K of 9s in each [suit]", "Pung/K in each sui[t]"
- p18 All Pair Jade: "Five or Six Pairs of Green [Bamboos]"; All Pair Ruby Jade: "Five Pairs Green & Red Bam[boos]"; "Run 1-8 C[haracters]"
- p19 Red Waratah: "Pung of Red Bamboos, Pu[ng …]"
- p20 Imperial Jade: "Three Pungs/K Green Bambo[os]"; Lillypilly: "Three Pungs/K C[ircles]"
- p23 Ordinary Mah Jong: "Four Pungs/K OR Three Pungs/K & One Chow (may include Winds, Dragons OR [honours])" — the tail decides the rule
- p24 All Pair Honours: "Pairs of 1s & 9s only, Winds & Dragons only, or all combine[d]"
- p25 All Winds and Dragons: "Two Pu[ngs/K]"
- p29 Ruby Jade: "Pung/K Gree[n …]"

## 5. Pages 33-34 — prose
The right column of both pages is cut mid-word. Page 34's "Problems and Solutions" is the source of the engine's edge-case tests, and roughly half of each problem statement and each solution is missing (e.g. "Problem: Exposed tile ___", "Solution: If a player m___", "1. A player who can us[e …]").


## CORRECTION 2026-10-31 - the OCR, not the print, was deficient
The FULL SYNOPSIS pages (printed 58-59; scan p30-p31) DO print two numeric columns per hand: **Winning** and **Fishing**. The Vision OCR dropped both columns entirely, which is why tier values looked absent. Owner-confirmed from the printed page.

- Read tiers from rules/.generated/pages/p30.png and p31.png (vision), never from companion-ocr.txt.
- Confirmed pairs: 500/200, 1000/400, 1500/600, 2000/800 - fishing is 40% of winning.
- Some rows print **Calculate** instead of a figure (Ordinary Mahjong, Purity Hand, All Honour Hand): those hands are summed from components, not looked up. Sparrow's Sanctuary is 1500/600, Gates of Heaven is 1000/400, and Chinese Odds is 1500/600 on the rendered spreads.
- The Winning column is one value per hand; concealed vs exposed differences live only in the hand-page headings.

## ROOT CAUSE 2026-10-31 - the scan pages are rotated 270 degrees
Every page of this PDF reports rotation 270 and a page box of 446 x 1208. Drawing it with `page.draw(with:to:)` ignores that rotation, so the render comes out sideways and text collapses into a strip: whole columns (the **Winning** and **Fishing** figures) fall outside what the OCR sees. That is why my first extraction reported "no numbers" - the numbers were never missing.

Fix: render through `PDFPage.thumbnail(of:for: .mediaBox)`, which applies the rotation. `rules/tools/ocr-page.swift` does that and prints `x0 y0 x1 y1 text` boxes:
    swiftc -O rules/tools/ocr-page.swift -o /tmp/ocr-page
    /tmp/ocr-page "<pdf>" <page> 3000

Verified on scan page 30 (printed 58): columns read `Winning` / `Fishing` and give e.g.
    Run, Pung & Pair  1000 / 400
    Gates of Heaven   1000 / 400
    Confused Gates    1000 / 400
    Wriggly Snake     1000 / 400
    Knitting           500 / 200
    Triple Knitting    500 / 200
Any tier transcribed from companion-ocr.txt before this fix must be re-read from the render.

## Numeric columns must be read VISUALLY, not OCR'd (2026-10-31)
The text layer in `rules/.generated/pages-text.txt` is reliable for names and compositions. It is NOT reliable for the **Winning / Fishing** figures: Vision misreads individual digits in that dense numeric column, and it also silently skips a row, which shifts every later pairing.

Evidence - the same column read three ways on scan page 31 (DRAGONS):
- whole-page pass: 30 values for 31 rows (a row was dropped)
- column strip at 8000 px: same 30 values
- per-row cell crops: noisy ("o00 400 400", "T000 400")

Where my OCR disagrees with the owner's photograph of the printed page, the photograph is right:
| Hand | OCR said | Printed page |
|---|---|---|
| Dragon's Teeth | 1000 / 400 | 1500 / 600 |
| Golden Gates | 1000 / 400 | 1500 / 600 |
| Lily of the Valley | 2000 / ... | 1000 / 400 |
| Red Waratah | 1000 / 400 | 2000 / 800 |

**Rule for the catalogue:** read every Winning/Fishing pair off the upright renders in `rules/.generated/pages/` visually, never from any text dump. Then validate mechanically:
- winning must be one of 500, 1000, 1500, 2000, or the word `Calculate`
- fishing must be exactly 40% of winning (200, 400, 600, 800) or `Calculate`
- a row pair that fails either check is a misread, not a book variant
