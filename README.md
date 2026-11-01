# int-maj

Pure, deterministic core for international mahjong as Patricia Thompson and
Betty Maloney print it: the hands of *The Mah Jong Player's Companion*, gathered
from games played in many countries. Zero runtime dependencies; TypeScript runs directly on Node 24+ via
type stripping.

## Status

The hand-pattern catalogue is complete: 85 canonical patterns covering every
hand in the Full Synopsis (both columns of book pp. 56-61) plus the hands that
appear only on a scanned catalogue page. Every pattern has a positive and a
near-miss negative test. Repeated printings are deduped into one canonical id
with all page references; `big-robert-mixed` is the only `variantOf` scoring
variant. The synopsis's printed Winning/Fishing values are transcribed;
`calculate` hands keep a null point value.

- Engine: tile model, 144-tile wall, seeded RNG, hand/meld model, normalised
  shape, standard decomposition, declared fishing state, generic matcher,
  precedence scorer.
- Turn engine: `GameState + Action -> { state, events }`, claims and
  precedence, fishing declarations, payments, dealer rotation, event-log
  replay. Rules the book leaves open are in `rules/PLAY.md` entries 11-19.
- Console table: `npm run play` seats you against three bots, with a pure
  policy in `src/core/game/bot.ts` and the table text in `console.ts`.
- Web table: `npm run serve` serves a plain HTML/ES-module table from a
  zero-dependency `node:http` server; every response is a `viewFor`
  projection, and the table-side checker is built into the page.
- Not started: persistence.
- Sources: local OCR working files (untracked, regenerable with the
  extractor tools in `rules/`), page renders in `rules/pages/` (tile diagrams,
  also local only), assumptions in `rules/ASSUMPTIONS.md`,
  unresolved/provisional notes in `rules/NOTES.md`.

## Coverage

| Book group | Patterns | Provisional | Unresolved |
|---|---:|---:|---:|
| Runs (p. 9) | 3 | 0 | 0 |
| Long Runs with Honours (pp. 10-13) | 13 | 0 | 0 |
| Short Runs (p. 14) | 4 | 0 | 0 |
| Chows (pp. 15-19) | 12 | 2 | 0 |
| Pairs (p. 20) | 2 | 0 | 0 |
| Pairs with Honours (pp. 22-24) | 6 | 0 | 0 |
| Pungs of Dragons (pp. 34-36) | 9 | 1 | 0 |
| Winds, one of each, with Pungs (pp. 28-29) | 5 | 0 | 0 |
| Winds, Pairs & Pungs (p. 30) | 4 | 0 | 0 |
| Dragons, two or more (p. 32) | 2 | 0 | 0 |
| Winds and/or Dragons with suits (pp. 38-43) | 6 | 0 | 0 |
| All Honours (pp. 44-46) | 5 | 0 | 0 |
| One Suit (pp. 48-49) | 3 | 0 | 0 |
| Three Suits (p. 60) | 2 | 0 | 0 |
| Bamboo Suit (p. 52) | 1 | 0 | 0 |
| Bamboos with Dragons (p. 54) | 3 | 0 | 0 |
| Circle Suit (p. 60) | 2 | 1 | 0 |
| Character Suit (p. 60) | 2 | 2 | 0 |
| Dragons synopsis (p. 31) | 1 | 0 | 0 |
| **Total** | **85** | **6** | **0** |

The groups that only repeat an earlier printing (Winds one-of-each with
Chows, Two Suits) add no new patterns; their page references were folded into
the canonical entries. The book's "over 120 hands" counts repeated printings
and suit-specific illustrations; this table is the unique-shape count.

## Fishing

Fishing is a **declaration**, not a way of winning: announce when one tile
from mah jong, fix the wait, and score the per-tier fishing value if another
player wins. `src/core/fishing.ts` models the declaration, the dead-tile
legality check, and settlement independent of the winner. The synopsis prints
the figures: half 200, limit 400, middle 600, double 800; `calculate` hands
have no fixed figure.

## Table checker

Type a hand from the table and see what it is. Canonical keys are `b1..b9`,
`c1..c9`, `o1..o9`, `wE wS wW wN` and `dR dG dW`; aliases `E S W N`,
`r g w`, `red green white` and the flower/season keys `f1..f4 s1..s4` are
accepted too. Parentheses mark one **exposed** meld; flowers and seasons are
reported as bonuses and never count toward the 13/14.

```sh
npm run check -- "(b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN"
```

```
14 tiles: (b1 b1 b1) c1 c1 c1 o1 o1 o1 wE wE wS wW wN
* 500 half  Windy Ones (exposed)
```

Thirteen effective tiles list every tile that completes a catalogue hand,
best tier first:

```sh
npm run check -- "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5"
```

```
13 tiles: dR dR dR dG dG dG dW dW dW b1 b2 b3 b5
b5  x3 left  1500 middle  Three Great Scholars (concealed) / calculate  Ordinary Mah Jong (concealed)
```

A kong adds one physical tile but still counts as one set, so a hand with a
kong is 14 effective tiles at 15 physical. Waits show `dead` instead of a
remaining count when all four copies are already visible in the input.
`--json` prints the result for another program; `--all` gives each match its
own line for a wait. With no arguments the checker reads stdin.

## Turn engine

`src/core/game/` is one pure, deterministic reducer:
`apply(state, action)` returns `{ state, events }`, or `{ error, state }` with
the input untouched when the move is illegal. `newGame(seed)` deals hand 1;
`nextHand(state)` deals the next one after a finished hand. No clock and no
`Math.random`: the state carries the seed, the RNG step count and the whole
wall, so `deserialize(serialize(state))` resumes in another process.

```ts
import { apply, deserialize, legalActions, newGame, serialize, viewFor } from "./src/core/index.ts";

let { state, events } = newGame("table-7");
state = apply(state, { type: "Draw", seat: state.turn }).state;
const legal = legalActions(state, state.turn);
state = apply(state, legal.find((action) => action.type === "Discard")!).state;
const json = serialize(state); // resume from this alone
const resumed = deserialize(json);
const mine = viewFor(resumed, "E"); // own hand, public table, no other hands
```

Actions, one decision by one seat:

- `Draw` — take the front tile; the dealer does this first.
- `Discard` — put one tile from the hand face up.
- `Claim` — `pung` / `kong` / `chow` / `mahjong` on the open discard, with the
  full meld in `tiles` so each chow variant is distinct.
- `DeclareFishing` — after your discard, fix the full wait set.
- `ConcealedKong` — four copies from your hand, replacement from the back.
- `AddedKong` — the fourth tile onto your own concealed pung.
- `Pass` — decline a claim or a fishing announcement.
- `Win` — `self-drawn`, or `on-discard` (sugar for the mahjong claim).

Events, the public log a replayer needs:

- `Dealt` — a seat's opening count.
- `Drew` — an ordinary draw from the front of the wall.
- `FlowerReplaced` — a bonus tile and its loose replacement.
- `Discarded` — the face-up tile.
- `Promoted` — a claim takes the turn from the discarder.
- `Claimed` — the winning pung/kong/chow after precedence.
- `KongDeclared` — a concealed or added kong.
- `KongReplacementDrawn` — the loose tile taken after a kong.
- `FishingDeclared` — the fixed wait and its tier.
- `WinDeclared` — the winner, the source tile, the pattern and the tier.
- `HandScored` — the highest matching tier only.
- `Payments` — ledger entries naming both sides and the reason.
- `DrawnHand` — wall exhausted, dealer keeps the deal.
- `NextDeal` — the next hand's dealer and number.

`npm run replay -- examples/readme-hand.json` reads
`{ "seed": ..., "actions": [...] }` and prints the hand; `--events` replays
`{ "seed": ..., "events": [...] }`, and `--json` prints the final state, log
and totals. Stdin works too.

```sh
npm run replay -- examples/readme-hand.json
```

```text
Hand 1 · dealer E · seed "readme-demo"
E is dealt 13 tiles
S is dealt 13 tiles
W is dealt 13 tiles
N is dealt 13 tiles
E replaces s1 with wE
S replaces s4 with c3
N replaces s3 with dR
E draws f2
E replaces f2 with o2
E discards b6
S draws c4
S discards b2
...
N draws o1
N discards o1
drawn hand: wall exhausted with no winner

Result: drawn hand — wall exhausted with no winner

Ledger:
  (empty)
Totals: E 0  S 0  W 0  N 0
```

Piecemeal construction from a seed:

```ts
let { state } = newGame("table-7");        // 13 each, dealer to draw
state = apply(state, { type: "Draw", seat: "E" }).state;
state = apply(state, { type: "Discard", seat: "E", tile: state.players[0].hand[0] }).state;
state = apply(state, { type: "Draw", seat: state.turn }).state;
// after a discard, legalActions lists every claim and every chow variant
const claims = legalActions(state, "S").filter((action) => action.type === "Claim");
// after your own discard, the announce phase offers the fishing declaration
const fish = legalActions(state, "E").find((action) => action.type === "DeclareFishing");
```

The state is the whole game: `serialize(state)` is the resume point, and
`apply` never mutates its argument. The event log is the replay contract:
`stepsFromEvents` rebuilds the action list (auto-passing seats that lost a
precedence race) and `replayEventLog(seed, log)` regenerates the identical
state and byte-identical log.

## Playing at the console

`npm run play` seats you at one table position against three bots. The table is
built from `viewFor(state, seat)`, so you see your own numbered hand and only
the public melds, discards and bonus tiles of the other seats.

```sh
npm run play -- --seed table-7
npm run play -- --seat S --seed table-7
npm run play -- --bot --events --seed table-7   # watch four bots
```

`--seed <seed>` sets the deal, `--seat E|S|W|N` picks your seat, `--bot` hands
all four seats to the bot, and `--events` prints the reducer's event log as it
happens. At your decision: `d <n>` discards tile `n` from the numbered hand;
`p`/`c`/`k`/`m` claim pung/chow/kong/mahjong; `f` declares fishing and prints
the fixed wait; `space` passes; `u` undoes the previous decision by replaying
from the seed; `h` prints help; `q` quits. Anything else reprints the legal
options and changes nothing.

```text
$ npm run play -- --seed console-readme --seat E
Hand 1 · dealer E · E round · wall 87 · turn E (discard)
Scores: E 0  S 0  W 0  N 0
E (dealer) (you)  hand: 1:b2 2:b5 3:b7 4:b9 5:c1 6:c2 7:c4 8:c6 9:c7 10:o2 11:o5 12:o5 13:o9 14:dR
    melds: none · discards: none · bonus: f4
S  hand: 13 concealed
    melds: none · discards: none · bonus: none
W  hand: 13 concealed
    melds: none · discards: none · bonus: f1 s4 s1
N  hand: 13 concealed
    melds: none · discards: none · bonus: none
Legal: d <n> discard
> d 1
S draws
S discards c1
W draws
W discards c2
N draws
N discards o4

Hand 1 · dealer E · E round · wall 83 · turn E (discard)
Scores: E 0  S 0  W 0  N 0
E (dealer) (you)  hand: 1:b5 2:b6 3:b7 4:b9 5:c1 6:c2 7:c4 8:c6 9:c7 10:o2 11:o5 12:o5 13:o9 14:dR
    melds: none · discards: b2 · bonus: f4
S  hand: 13 concealed
    melds: none · discards: c1 · bonus: none
W  hand: 13 concealed
    melds: none · discards: c2 · bonus: f1 s4 s1
N  hand: 13 concealed
    melds: none · discards: o4 · bonus: none
Last discard: N o4
Legal: d <n> discard
> q
Quit.
```

The bot wins when legal, declares fishing whenever the engine offers it,
claims a pung or kong only when the call completes a set without spending the
hand's last pair, draws otherwise and discards the least useful tile: pairs,
triplets and same-suit neighbours are kept, isolated tiles go first. A kong
is preferred to a pung when both are offered, because its replacement tile is
free. The bot never chows and never sees another seat's hand.

## Web table

`npm run serve` starts a zero-dependency `node:http` server bound to
127.0.0.1. It seats you at East against the same three bots as the console:
every move still goes through `apply`, and the browser receives only
`viewFor` plus the table-side checker.

```sh
npm run serve                       # http://127.0.0.1:8080, seed "web"
npm run serve -- --port 8081 --seed table-7
```

The table fills the viewport. The three bots sit on the top, left and right
edges with a compact wind/name/points chip, a rack of concealed backs, their
public melds and a six-wide discard river; the wall count and round/dealer
sit in the quiet centre; your hand is one large bottom row of 84x112 tiles,
with your river directly above it and melds and the bonus tray to its right.
A collapsible 260px rail holds the scorecard, a moving turn highlight, the
wait panel and the event log. The game actions are a fixed cluster low on the
right; claims appear as a bottom-centre bar, with chow variants on a second
row. Nothing is recomputed in the browser: the table-side checker is the
`npm run check` checker built in, listing every completing tile, the copies
left (or `dead`), and the catalogue hands each wait would make.

Click a tile to select it, then click it again or press `Enter` to discard;
arrow keys move the hand cursor and `1`-`9` jump to a tile. `d` draws, `m`
declares mahjong, `p`/`k`/`c` claim pung/kong/chow, `Space` passes or picks
`Pass`, `f` declares fishing, `u` undoes the previous decision by replaying
from the seed, `n` deals a new game and `?` lists the keys. The whole hand is
playable keyboard-only. While a claim is open the bar shows every legal claim
and always keeps Pass; `1`-`9` picks a chow variant. After a hand the result
panel overlays the felt with the winning pattern and tier, the composed
tiles, every settlement, each seat's before/delta/now score and a Next hand
button; the rail stays where it was. Another seat's concealed tiles stay
hidden at the result: only public melds and the winning tile are shown.

The table is quiet by default: a soft felt vignette, warm ivory SVG tiles and
seat tints used only as two-pixel edge marks. Motion is 140ms for lifts and
slides and 220ms for the hand entering; `prefers-reduced-motion` removes all
of it. Light and dark colour schemes both keep the felt dark and adapt the
rail and result panel, with visible focus rings on every tile and button. The
layout stays playable at 1024x700, where the rail scrolls above the hand.

Every tile is an SVG image loaded from its canonical key in `web/tiles/`:
characters, circles, bamboo, winds, dragons, flowers and seasons all share the
same paper tile body, and the faces stay crisp at any zoom and keep their key
in the tooltip and aria-label. The 34 play tiles and the tile back come from
the public-domain [riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)
set (CC0); `web/tiles/LICENSE.md` records the file mapping. `?gallery=1`
replaces the table with `#tile-gallery`, a grid of all 34 playable faces and
the 8 bonus marks:

```sh
open "http://127.0.0.1:8080/?gallery=1"
```

### API

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /` | | the table page |
| `GET /app.js`, `/app.css` | | the plain ES module and stylesheet |
| `GET /tiles/<key>.svg`, `/tiles/back.svg` | | one tile face or the tile back |
| `GET /api/state` | `game=<id>` (`&pretty=1` indents the JSON) | the `viewFor` view, legal actions, wall count, per-seat table, ledger, wait panel and result |
| `POST /api/new` | `{ "seed": "..." }` | a new game and its first state |
| `POST /api/move` | `{ "game": "...", "action": {...} }` | the new state plus `events` as text lines |
| `POST /api/undo` | `{ "game": "..." }` | the state before the previous human decision; the log is replaced |
| `POST /api/next` | `{ "game": "..." }` | the next hand after a finished one |

An illegal move returns HTTP 400 with `{ "error": "..." }` using the
reducer's own wording, and the game is unchanged. `POST /api/move` accepts
exactly the actions `legalActions` offered for the human seat.

### Why the browser never learns another seat's hand

The server holds the `GameState`; it never serialises it. Every response is
built by `statePayload` from `viewFor(state, seat)`, which gives the viewer
their own hand and reduces the other three seats to a hand count, public
melds, discards and bonus tiles. The wait panel is computed from the viewer's
own tiles through `check.ts`. At a win by another seat the result panel names
the pattern and the public melds but keeps the concealed hand hidden. The
server tests walk a live payload and assert every opponent tile key appears
only under a public path, and that no opponent object has a `hand` field.

A real `curl` of `/api/state` (seed `api-waits-91`, which deals a hand
waiting on `c2` or `c5`):

```sh
curl -s -X POST http://127.0.0.1:8080/api/new \
  -H 'content-type: application/json' -d '{"seed":"api-waits-91"}'
curl -s 'http://127.0.0.1:8080/api/state?game=g1&pretty=1'
```

```json
{
  "game": "g1",
  "seat": "E",
  "seed": "api-waits-91",
  "view": {
    "seat": "E",
    "handNumber": 1,
    "dealer": "E",
    "prevailingWind": "E",
    "turn": "E",
    "phase": "draw",
    "player": {
      "seat": "E",
      "hand": [
        "b1",
        "b3",
        "b4",
        "b5",
        "b8",
        "c1",
        "c1",
        "c4",
        "c7",
        "o2",
        "o3",
        "o6",
        "o9"
      ],
      "melds": [],
      "flowers": [],
      "seasons": [],
      "discards": []
    },
    "opponents": [
      {
        "seat": "S",
        "handCount": 13,
        "melds": [],
        "flowers": [],
        "seasons": [],
        "discards": []
      },
      {
        "seat": "W",
        "handCount": 13,
        "melds": [],
        "flowers": [],
        "seasons": [],
        "discards": []
      },
      {
        "seat": "N",
        "handCount": 13,
        "melds": [],
        "flowers": [],
        "seasons": [
          "s1",
          "s3"
        ],
        "discards": []
      }
    ],
    "wallRemaining": 90,
    "lastDiscard": null,
    "claimWindow": null,
    "fishing": [],
    "ledger": [],
    "result": null,
    "legalActions": [
      {
        "type": "Draw",
        "seat": "E"
      }
    ],
    "fishingTier": null
  },
  "legalActions": [
    {
      "type": "Draw",
      "seat": "E"
    }
  ],
  "wallRemaining": 90,
  "ledger": [],
  "table": [
    {
      "seat": "E",
      "wind": "E",
      "dealer": true,
      "isYou": true,
      "handCount": 13,
      "melds": [],
      "discards": [],
      "flowers": [],
      "seasons": []
    },
    {
      "seat": "S",
      "wind": "S",
      "dealer": false,
      "isYou": false,
      "handCount": 13,
      "melds": [],
      "discards": [],
      "flowers": [],
      "seasons": []
    },
    {
      "seat": "W",
      "wind": "W",
      "dealer": false,
      "isYou": false,
      "handCount": 13,
      "melds": [],
      "discards": [],
      "flowers": [],
      "seasons": []
    },
    {
      "seat": "N",
      "wind": "N",
      "dealer": false,
      "isYou": false,
      "handCount": 13,
      "melds": [],
      "discards": [],
      "flowers": [],
      "seasons": [
        "s1",
        "s3"
      ]
    }
  ],
  "checker": {
    "size": 13,
    "waits": [
      {
        "tile": "c2",
        "remaining": 4,
        "dead": false,
        "matches": [
          {
            "id": "crazy-chows",
            "name": "Crazy Chows",
            "tier": "half",
            "points": 500,
            "concealed": true
          }
        ],
        "best": {
          "id": "crazy-chows",
          "name": "Crazy Chows",
          "tier": "half",
          "points": 500,
          "concealed": true
        }
      },
      {
        "tile": "c5",
        "remaining": 4,
        "dead": false,
        "matches": [
          {
            "id": "crazy-chows",
            "name": "Crazy Chows",
            "tier": "half",
            "points": 500,
            "concealed": true
          }
        ],
        "best": {
          "id": "crazy-chows",
          "name": "Crazy Chows",
          "tier": "half",
          "points": 500,
          "concealed": true
        }
      }
    ]
  },
  "outcome": null
}
```

## Test

```sh
npm test
```

Node's built-in test runner executes the TypeScript tests directly. No install
step is required. `npm test` self-plays a couple of dozen seeded hands in
`test/soak.test.ts` (about 7 s for the whole suite) and checks tile
conservation, the zero-sum ledger, legal-action membership, serialisation,
event-log replay and termination. `npm run soak` runs the full 300 hands (about
a minute), and `SOAK_SEEDS=1000 npm run soak` raises it further.
