# Book pages

Page images of the two printed sources, so the rules can be checked against
the actual page from any machine - including a cloud session started from a
phone - without the scans on a laptop.

| Folder | Source | Files |
| --- | --- | --- |
| `illustrated/` | *The Game of Mah Jong Illustrated* (primary, normative) | `pNN.jpg`: one open-book spread per PDF page, printed pages `2NN-2` and `2NN-1`; `primary-ocr-*.txt` |
| `companion/` | *The Mah Jong Player's Companion* (supplement) | `pNN.jpg`, one spread per PDF page; `companion-ocr.txt` |

The images are JPEG copies of the page-edge-cropped renders that
`rules/tools/primary-pages.swift` and `rules/tools/ocr-pages.swift` make from
the owner's scans (the PDFs stay under `scans/`, local only). The OCR text is
a navigation aid, never authority: read the page itself (see
`rules/SOURCE.md`).

**Private material.** These are the owner's copies of copyrighted books. They
live here only because this repository is private. Never make the repository
public, never copy these files into the app (`scripts/build.ts` ships `app/`
and `src/` only, and `test/table/offline.test.ts` checks that no page image
reaches `dist/`), and never share them elsewhere.
