# Style tokens

`web/app.css` opens with one token block. **After that block, every length in a
rule is a `var()` from it, a count, or 0.** No other file holds a number about
how the table looks: the client script sets only state (positions, counts,
strings), and `docs/UI.md` describes the intent behind the numbers below.

The block is grouped exactly as this file is: colour, type, space, the tile
unit, fitted geometry, motion.

## Colour

One set, two themes. The felt and the tiles do not change between themes — a
mahjong table is green — only the chrome around it does. Every alpha colour is
a token of its own (never `rgba()` written inside a rule) so a theme swap is a
list of values, not a hunt.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--felt` | `#123a29` | same | The table surface |
| `--felt-high` | `#1a4a33` | same | Vignette centre |
| `--felt-low` | `#0a2116` | same | Page and board base |
| `--felt-vignette` | `inset 0 0 130px rgba(0,0,0,.42)` | same | Board edge shadow |
| `--ivory` | `#f7f2e2` | same | Tile body, the reference ivory |
| `--on-felt` | `#f7f2e2` | same | Text on felt |
| `--on-felt-muted` | `#b7c9ba` | same | Quiet text on felt |
| `--ink` | `#101a14` | same | Ink on accent and light surfaces |
| `--accent` | `#e7c65b` | same | Turn marker, primary action |
| `--accent-strong` | `#f2dc96` | same | Primary button edge |
| `--accent-hover` | `#f0d878` | same | Primary button hover |
| `--accent-soft` | `rgba(231,198,91,.42)` | same | Turn glow, soft rules |
| `--accent-line` | `rgba(231,198,91,.28)` | same | Meld and variant edges |
| `--accent-fill` | `rgba(231,198,91,.10)` | same | Winner row wash |
| `--accent-ring` | `rgba(231,198,91,.50)` | same | Cursor ring, preview edge |
| `--accent-ink` | `rgba(16,26,20,.08)` | same | Keycap on the primary button |
| `--positive` / `--negative` | `#a9d6a2` / `#ef9a8c` | `#2f6b3a` / `#a33b2c` | Gains and losses in the rail |
| `--positive-felt` / `--negative-felt` | `#f4d98a` / `#f0a090` | same | Gains and losses on felt |
| `--danger` | `#e06c5a` | same | Dead waits, broken totals |
| `--seat-e` | `#e7c65b` | same | East tint |
| `--seat-s` | `#6fc7b4` | same | South tint |
| `--seat-w` | `#b89ce0` | same | West tint |
| `--seat-n` | `#7faee8` | same | North tint |
| `--fg` | `#f2f5ee` | `#101a14` | Rail text |
| `--muted` | `#a9bcae` | `#4c5f53` | Rail quiet text |
| `--surface` | `#0d1d14` | `#f1f5ef` | Rail, dialogs |
| `--surface-deep` | `#08170e` | `#e5ece5` | The log |
| `--surface-card` | `#0b1f15` | same | Result card |
| `--panel` | `rgba(247,242,226,.06)` | `rgba(16,26,20,.05)` | Rail panel |
| `--panel-strong` | `rgba(247,242,226,.10)` | `rgba(16,26,20,.09)` | Rail panel, hover |
| `--field` | `rgba(4,12,8,.20)` | same | Centre panel wash |
| `--button-bg` | `rgba(5,18,12,.78)` | same | Action button |
| `--button-bg-hover` | `rgba(9,31,21,.95)` | same | Action button hover |
| `--button-bg-muted` | `rgba(5,18,12,.66)` | same | Dismiss |
| `--button-bg-muted-hover` | `rgba(14,40,27,.90)` | same | Dismiss hover |
| `--preview-bg` | `rgba(5,18,12,.90)` | same | Fishing preview |
| `--variant-bg` | `rgba(6,22,15,.82)` | same | Chow variant |
| `--gallery-bg` | `rgba(0,0,0,.18)` | same | Gallery card |
| `--scrim` | `rgba(4,12,8,.58)` | same | Result overlay |
| `--scrim-strong` | `rgba(0,0,0,.62)` | same | Dialog backdrop |
| `--border` | `rgba(247,242,226,.16)` | `rgba(16,26,20,.20)` | Every hairline |
| `--line-soft` | `rgba(247,242,226,.12)` | same | Table rules |
| `--line-frame` | `rgba(247,242,226,.18)` | same | The felt frame |
| `--line-field` | `rgba(247,242,226,.08)` | same | Centre panel edge |
| `--button-border` | `rgba(247,242,226,.24)` | same | Action button edge |
| `--indicator-bg` / `--indicator-fg` | `#e7c65b` / `#101a14` | `#8a6a00` / `#fff` | Turn pill |
| `--tile-face-high` / `--tile-face-low` | `#fffdf4` / `#e9e0c8` | same | Missing-art fallback |
| `--tile-fallback-line` / `--tile-fallback-ink` | `#b7ab8c` / `#8a2a20` | same | Missing-art fallback |
| `--tile-fallback-shadow` | `0 1px 0 #a89b7b` | same | Missing-art fallback |

Elevation is a colour set too, because a shadow is a colour with an offset:

| Token | Value | Used by |
| --- | --- | --- |
| `--tile-shadow` | `drop-shadow(0 1px 1px rgba(0,0,0,.4))` | River, melds, waits |
| `--hand-shadow` | `drop-shadow(0 2px 2px rgba(0,0,0,.45))` | Your hand |
| `--hand-shadow-lift` | `drop-shadow(0 3px 3px rgba(0,0,0,.5))` | Hovered tile |
| `--card-shadow` | `0 24px 60px rgba(0,0,0,.48)` | Result card |
| `--preview-shadow` | `0 8px 20px rgba(0,0,0,.32)` | Fishing preview |
| `--toggle-shadow` | `0 4px 14px rgba(0,0,0,.28)` | Rail toggle |

## Type

One sans, three sizes — as the brief says. Tabular numerals wherever a score,
a count or a wait number appears; that is a rule on the element, not a token.

| Token | Value |
| --- | --- |
| `--font-ui` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-mono` | `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` |
| `--fs-label` | `13px` |
| `--fs-body` | `15px` |
| `--fs-heading` | `18px` |
| `--fw-regular` | `400` |
| `--fw-strong` | `600` |
| `--fw-bold` | `700` |
| `--fw-black` | `800` |
| `--lh-tight` / `--lh-snug` | `1.1` / `1.2` |
| `--lh-label` / `--lh-body` | `1.35` / `1.45` |
| `--lh-log` / `--lh-loose` | `1.5` / `1.6` |
| `--tracking-label` | `0.06em` |
| `--tracking-tight` | `0.01em` |

## Space

Eight steps, doubled from 2px; a longer gap is a multiple of a step (the
board's gaps are ratios of the tile unit, not of this scale).

| Token | Value | Typical use |
| --- | --- | --- |
| `--space-1` | `2px` | Tight pairs, the drawn-tile gap inside a meld |
| `--space-2` | `4px` | Button padding, corner offsets |
| `--space-3` | `6px` | Gaps between small controls |
| `--space-4` | `8px` | Panel padding, log inset |
| `--space-5` | `12px` | Rail gap, button side padding |
| `--space-6` | `16px` | Rail padding, card groups |
| `--space-7` | `24px` | Overlay padding, dialog padding |
| `--space-8` | `32px` | Outer gutter |

Hairlines and radii are their own two lists:

| Token | Value |
| --- | --- |
| `--stroke` | `1px` |
| `--stroke-strong` | `2px` |
| `--radius-xs` | `3px` |
| `--radius-sm` | `5px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |
| `--radius-pill` | `999px` |

## The tile unit

Everything on the board is a ratio of **one hand tile**, and the hand tile is
a fraction of the board. That is the only scale the felt knows: 14 tiles and
their gaps are 46.43% of the board (the reference's 405..1106 at 1512), so the
board's width alone decides every tile, river, rack and dial.

| Token | Value | Meaning |
| --- | --- | --- |
| `--hand-row-frac` | `0.4643` | The 14-tile row's share of the board |
| `--hand-units` | `14.4` | 14 tiles + the 0.4-unit drawn-tile break |
| `--hand-w` | derived | One hand tile's width |
| `--hand-aspect` | `4 / 3` | The tile's height over its width |
| `--hand-h` | `hand-w * hand-aspect` | Its height |
| `--hand-gap` | `2px` | Between hand tiles |
| `--tile-gap` | `1px` | Between river tiles |
| `--tile-ratio` | `0.874` | River tile / hand tile |
| `--tile-w` / `--tile-h` | derived | River tile |
| `--back-ratio-w` | `0.73` | A concealed back's width |
| `--back-ratio-h` | `0.96` | A concealed back's height |
| `--meld-ratio` | `0.45` | A meld tile |
| `--draw-gap-ratio` | `0.4` | The drawn tile's extra break on wide tables |
| `--art-sm-w` | `hand-w * 0.22` | Wait, variant art |
| `--art-md-w` | `hand-w * 0.24` | Bonus tiles, claim button art |
| `--art-lg-w` | `hand-w * 0.30` | Claim head, discard action art |
| `--dial-ratio` | `0.8` | The wall dial's box |

## Fitted geometry

The felt's own edge and the seat lines are fractions of the board, because the
layout checker fits them to the reference at 1512x894 and re-measures at
1440x900 and 1280x800. The remaining values are Tenhou's, measured off
`web/reference3.png`: they are *fitted*, not invented, so they are named where
they are used rather than snapped to the spacing scale.

| Token | Value | Meaning |
| --- | --- | --- |
| `--frame-top` | `1%` | Felt frame, top |
| `--frame-x` | `14.5%` | Felt frame, sides |
| `--frame-bottom` | `4.6%` | Felt frame, bottom |
| `--rack-top` | `1.9%` | North rack inset |
| `--rack-pad` | `0.65%` | Side rack inset |
| `--ring-gap` | `8.3%` | Felt between the north rack and the rivers |
| `--hand-lift` | `3.4%` | Felt between the hand and the action row |
| `--action-row` | `4.6%` | The action row's own height |
| `--action-inset-x` | `14px` | Action cluster's right inset |
| `--action-inset-y` | `4px` | Action cluster's bottom inset |
| `--action-column-frac` | `0.19` | Its widest column |
| `--dial-y` | `56%` | The wall dial's seat in the centre |
| `--dial-stroke` | `4.5px` | Wall ring's stroke |
| `--dial-label-ratio` | `0.1` | The wall label's offset, as a share of a hand tile |
| `--self-ratio` | `0.5` | Your label's column, as a share of a hand tile |
| `--rail-w` / `--rail-w-narrow` | `260px` / `230px` | The rail |
| `--control-h-sm` | `32px` | Ghost buttons |
| `--control-h` | `37px` | Action buttons (Tenhou's height) |
| `--control-h-lg` | `48px` | Claim buttons, next hand |
| `--claim-min-w` | `148px` | The two claim buttons |
| `--rail-tile-w` | `26px` | Wait panel art, width |
| `--rail-tile-h` | `35px` | Wait panel art, height |
| `--fishing-tile-w` | `22px` | Rail fishing art, width |
| `--fishing-tile-h` | `29px` | Rail fishing art, height |
| `--result-tile-w` | `34px` | Composed hand, width |
| `--result-tile-h` | `45px` | Composed hand, height |
| `--source-tile-w` | `24px` | Result source line, width |
| `--source-tile-h` | `32px` | Result source line, height |
| `--settle-tile-w` | `20px` | Result fishing art, width |
| `--settle-tile-h` | `26px` | Result fishing art, height |
| `--control-tile-w` | `20px` | Control art (discard, claim, chow variants), width |
| `--control-tile-h` | `27px` | Control art, height |
| `--gallery-tile-w` | `52px` | Tile gallery, width |
| `--gallery-tile-h` | `69px` | Tile gallery, height |
| `--log-h` | `150px` | The log |
| `--note-w` | `190px` | Action note wrap |
| `--result-card-w` | `780px` | Result card, width |
| `--result-card-h` | `760px` | Result card's height cap |
| `--dialog-w` | `620px` | Help dialog |
| `--gallery-w` | `1000px` | Gallery column |
| `--reference-w` / `-h` / `-crop` | `1512px` / `982px` / `88px` | Debug overlay |

## Motion

Two durations, because the brief asks for two: a fast acknowledgement and a
hand entering the table. Lifts are their own four steps so hover, selection,
entry and exit cannot drift apart.

| Token | Value | Used by |
| --- | --- | --- |
| `--dur-fast` | `140ms` | Lifts, slides, the turn pill |
| `--dur-enter` | `220ms` | A tile entering the hand |
| `--ease` | `ease-out` | Everything that moves |
| `--ease-in` | `ease-in` | The tile leaving the hand |
| `--lift-hover` | `6px` | Hover |
| `--lift-select` | `10px` | Selection |
| `--lift-enter` | `14px` | Entry |
| `--lift-out` | `20px` | Exit |

`prefers-reduced-motion: reduce` sets every duration and transition to
`0.01ms` at the end of the stylesheet; the table is complete without motion.

## What is allowed to stay a literal

Inside rules, only these non-`var()` values appear:

- `0`, and fractions of the element's own box (`100%`, `50%`,
  `minmax(0, 1fr)`, `translate(-50%, -50%)`);
- unitless factors: opacity, `scale`, `brightness`, line-height numbers, grid
  `repeat` counts, `min()`/`max()` comparisons;
- `em` lengths that intentionally follow their own font (`kbd`'s min-width and
  padding, the payment column, the fishing seat column);
- media-query breakpoints (`1100px`, `820px`, `760px`), because a custom
  property cannot be read in a media condition;
- the wall dial's SVG geometry — its `viewBox`, the ring's `r="31"` and the
  dash length the client computes with it — which are drawing coordinates,
  not layout lengths;
- the reference overlay's native pixels, which are tokens
  (`--reference-w`, `--reference-h`, `--reference-crop`).

`npm run test:layout` re-measures the result at 1440x900 and 1280x800, and
re-fits the reference anchors at 1512x894, so a token change that moves the
board is caught rather than reviewed by eye.
