# int-maj

A deterministic international-mahjong implementation. The owner-designated
primary rule source is the scanned *The Game of Mah Jong Illustrated*;
`rules/SOURCE.md` records the source, precedence and reading protocol. Zero
runtime dependencies; TypeScript runs directly on Node 24+ via type stripping.

## Rule-source status

The rules are audited in `rules/RULES.md`: the Illustrated book is the
normative rubric, the Companion is its supplement, and every rule carries a
`[I p.N]` / `[C p.N]` / `[A]` provenance tag. The engine reconciliation is
complete for slices C1-C9; `rules/AUDIT.md` records the closed rows and the
few deliberately deferred table rulings. The archive under `rules/archive/`
is historical audit material, not authority.

## Current implementation

- Pattern table with positive/negative fixtures, tile/hand modelling, seeded
  wall generation, ground-score/doubling scoring and printed special tiers.
- Turn engine with claims, robbing the kong, fishing as an announced state,
  round-wind progression, drawn-hand/Goulash marking, Western and Chinese
  variant profiles, and event-log replay.
- The app: a 3D table in the browser against three bots, offline, saved
  after every move, installable on a phone. See [The 3D table](#the-3d-table).
- Console table: `npm run play` seats you against three bots.

## Source material

The scanned source is local under `scans/` as one page-edge-trimmed PDF (not
committed; see `.gitignore`). Its pages keep the full scan behind the crop
boxes. `rules/tools/crop-primary-source.swift` rebuilds the trimmed copy from a fresh
original.
Earlier OCR and page renders under `rules/` are useful only as historical
audit material. See `rules/SOURCE.md` before relying on any rule document.

## Catalogue

The Illustrated catalogue is Part II of `rules/RULES.md`: 53 printed entries
(hands 1-51 plus All Kong and Mixed Pung). Part III adds the 35
Companion-only entries. Every table entry is classified in `rules/AUDIT.md`;
the historical 85-pattern count is no longer the catalogue authority.

## Fishing

Fishing is the **state** of needing one tile, announced. It does not restrict
claims: a fishing player may still pung, chow or kong, and may take any discard
to win. `src/core/fishing.ts` models the announcement and settlement
independent of the winner. The Illustrated figures are fractions of the limit:
half 200, limit 400, double 500; Companion-only middle hands use 600 and a
Companion double hand keeps its printed 800. An ordinary/Purity/All Honour
fishing hand scores its ground score without the 20 points for Mah Jong. The
payer set remains an explicit recorded assumption.

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
best points first:

```sh
npm run check -- "dR dR dR dG dG dG dW dW dW b1 b2 b3 b5"
```

```
13 tiles: dR dR dR dG dG dG dW dW dW b1 b2 b3 b5
b5  x3 left  1000 limit  Three Great Scholars (concealed) / calculate  Ordinary Mah Jong (concealed) / calculate  Buried Treasure (Concealed Mah Jong) (concealed)
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

- `Draw` — take the front tile on your turn.
- `Discard` — put one tile from the hand face up; East discards first.
- `Claim` — `pung` / `kong` / `chow` / `mahjong` on the open discard, with the
  full meld in `tiles` so each chow variant is distinct.
- `DeclareFishing` — announce the wait when one tile from mah jong.
- `ConcealedKong` — four copies from your hand, replacement from the loose
  tiles (Western) or the dead wall (Chinese).
- `AddedKong` — the fourth tile onto your own exposed or concealed pung.
- `Pass` — decline a claim or a fishing announcement.
- `Win` — `self-drawn`, or `on-discard` (sugar for the mahjong claim).

Events, the public log a replayer needs:

- `Dealt` — a seat's opening count (East 14, the others 13).
- `Drew` — an ordinary draw from the front of the live wall.
- `FlowerReplaced` — a bonus tile and its loose replacement.
- `Discarded` — the face-up tile.
- `Promoted` — a claim takes the turn from the discarder.
- `Claimed` — the winning pung/kong/chow after precedence.
- `KongDeclared` — a concealed or added kong.
- `KongReplacementDrawn` — the loose or dead-wall tile taken after a kong.
- `FishingDeclared` — the announced wait and its printed value.
- `WinDeclared` — the winner, the source tile, the pattern and the points.
- `HandScored` — the winning pattern and its computed points.
- `Payments` — ledger entries naming both sides and the reason.
- `DrawnHand` — wall exhausted; the dealer repeats at most once.
- `NextDeal` — the next hand's dealer and number.

`npm run replay -- examples/readme-hand.json` reads
`{ "seed": ..., "actions": [...] }` and prints the hand; `--events` replays
`{ "seed": ..., "events": [...] }`, and `--json` prints the final state, log
and totals. Stdin works too.

```sh
npm run replay -- examples/readme-hand.json
```

The replay prints the dealt counts, every draw/replacement/discard and the
final result; `--json` prints the state, event log and ledger totals.

Piecemeal construction from a seed:

```ts
let { state } = newGame("table-7");        // East 14, the others 13
state = apply(state, { type: "Discard", seat: state.dealer, tile: state.players[0].hand[0] }).state;
state = apply(state, { type: "Draw", seat: state.turn }).state;
state = apply(state, { type: "Draw", seat: state.turn }).state;
// after a discard, legalActions lists every claim and every chow variant
const claims = legalActions(state, "S").filter((action) => action.type === "Claim");
// when you are one tile from mah jong, the announce phase offers the fishing wait
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
`p`/`c`/`k`/`m` claim pung/chow/kong/mahjong; `f` announces the fishing wait;
`space` passes; `u` undoes the previous decision by replaying
from the seed; `h` prints help; `q` quits. Anything else reprints the legal
options and changes nothing.

The console prints the numbered hand, the public table, the legal options and
the reducer events; the first turn is East's discard, with East holding 14.

The bot wins when legal, announces fishing whenever the engine offers it,
claims a pung or kong only when the call completes a set without spending the
hand's last pair, draws otherwise and discards the least useful tile: pairs,
triplets and same-suit neighbours are kept, isolated tiles go first. A kong
is preferred to a pung when both are offered, because its replacement tile is
free. The bot never chows and never sees another seat's hand.

## The 3D table

`web/index.html` with `web/3d/` is the app: a Three.js table (version 0.170,
vendored under `web/vendor/three/`, MIT) that plays against three bots.

```sh
npm run dev        # build, then serve dist/ on http://127.0.0.1:8091/
```

- `web/3d/layout.js` is the table geometry as plain numbers (walls, hands,
  the discard pinwheel); `test/table-layout.test.ts` proves no two discards
  ever overlap.
- `web/3d/tiles.js` models a tile: a rounded off-white front, a sky-blue
  lacquered back, and the face printed on it with a small corner index. The
  faces are the public-domain riichi set in `web/faces/` (see its
  `LICENSE.md`).
- `web/3d/stage.js` holds the renderer, the felt, the centre console, the
  table camera (solved for any screen shape) and your hand's own long-lens
  pass, plus promise-based tweens with a timer fallback, so a hidden page
  never stalls the game.
- `web/3d/board.js` compares each game answer with the table and animates
  only the difference: throws, claims flying to the claimer, melds, draws and
  the shrinking wall.
- `web/3d/main.js` runs the turn loop (bots one decision per beat, automatic
  draws and passes), the decision buttons, call-outs and the result card.

Tap a tile to lift it and tap it again to discard. Claims, kongs, fishing,
Mah Jong, reshuffle and the Goulash exchange appear as buttons when the engine
offers them. The table is landscape only.

Two URL options help when testing:

| URL | Opens |
| --- | --- |
| `/?state=turn\|claim\|wait\|fishing\|win\|drawn\|result` | one fixed review board, replayed from a seed |
| `/?phone` | the table inside an iPhone-landscape frame, on any screen |

`/table3d` redirects to `/` for old links.

### The API the table calls

The table never holds a `GameState`. It calls `routeApi` (`src/server/api.ts`)
in the page through `src/web/local.ts`, and every answer is built from
`viewFor(state, seat)`: your own hand, the public melds, discards and bonus
tiles of the other seats, and their hand counts only.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/state` | `game=<id>` | the view, legal actions, wall count, per-seat table, ledger, wait panel, result and `scoresBefore` |
| `GET /api/scenario` | `state=<name>` | one fixed review board and its events |
| `POST /api/new` | `{ "seed": "..." }` | a new game and its first state |
| `POST /api/move` | `{ "game": "...", "action": {...} }` | the new state plus `events` as text lines |
| `POST /api/step` | `{ "game": "..." }` | the next single bot decision, or `{ "done": true }` |
| `POST /api/undo` | `{ "game": "..." }` | the state before your previous decision in this hand |
| `POST /api/next` | `{ "game": "..." }` | the next hand after a finished one |

An illegal move answers 400 with the reducer's own wording and changes
nothing. `test/server.test.ts` walks live payloads and asserts every opponent
tile appears only under a public path.

## Offline app

The app is a static site: no server, no account, three bots on the device.

```sh
npm run build      # writes dist/ (about 80 files, no dependencies)
npm run preview    # serves dist/ on http://127.0.0.1:8091/ like a web host
npm run preview -- --lan   # also reachable from a phone on the same Wi-Fi
```

`tools/build-web.ts` follows the imports of `src/web/local.ts` and turns each
TypeScript file into plain JavaScript with Node's own type stripper, so the
browser runs the same engine, bots and API routes as the tests. It copies the
3D table, its library and the tile faces beside it.

- **Saving.** After every move the game is written to `localStorage` as its
  seed, its decisions and a checkpoint at the start of the current hand. A
  reload, a closed tab or iOS evicting the page resumes the same hand;
  resuming replays only the current hand.
- **Offline.** A generated service worker pre-caches every file under a cache
  named after the build's content hash. Once opened, the app starts in
  airplane mode; a new deploy replaces the cache and reloads the page once,
  which resumes the saved hand.
- **Install.** Safari > Share > Add to Home Screen gives a full-screen app
  with its own icon (`web/icons/`). Service workers need https, so install
  from the deployed site, not from a `--lan` address.

### Deploying

The app is live at **https://int-maj.int-maj.workers.dev** (Cloudflare
Workers static assets; `wrangler.jsonc` names the folder). One command tests,
builds and uploads it:

```sh
npx wrangler login   # once per machine, in your own browser
npm run deploy       # npm test, npm run build, then upload dist/
```

Pushing to GitHub does not deploy: testers get a new version only when
`npm run deploy` runs, and installed copies pick it up on their next launch.
Only `dist/` is uploaded; the rule transcriptions in `rules/` stay in the
private repository.

## Test

```sh
npm test
```

Node's built-in test runner executes the TypeScript tests directly. No install
step is required. `npm test` self-plays a couple of dozen seeded hands in
`test/soak.test.ts` (about 25 s for the whole suite) and checks tile
conservation, the zero-sum ledger, legal-action membership, serialisation,
event-log replay and termination. `npm run soak` runs the full 300 hands (about
a minute), and `SOAK_SEEDS=1000 npm run soak` raises it further.
