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
- Console table: `npm run play` seats you against three bots.
- Web table: `npm run serve` serves a plain HTML/ES-module table from a
  zero-dependency `node:http` server; responses are `viewFor` projections.
- Offline app: `npm run build` emits a static `dist/` that plays the whole
  game in the browser, saves after every move and installs on a phone's home
  screen. See [Offline app](#offline-app).

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
with your river in the board's own bottom row and melds and the bonus tray to the right of the hand.
A collapsible 260px rail holds the scorecard, a moving turn highlight, the
wait panel and the event log. The game actions are a fixed cluster low on the
right; claims appear as a bottom-centre bar, with chow variants on a second
row. Nothing is recomputed in the browser: the table-side checker is the
`npm run check` checker built in, listing every completing tile, the copies
left (or `dead`), and the catalogue hands each wait would make.

Click a tile to select it, then click it again or press `Enter` to discard;
arrow keys move the hand cursor and `1`-`9` jump to a tile. `d` draws, `Enter`
claims the best offered claim (Mahjong, then pung, kong or chow), `Space`
dismisses a claim or picks `Pass`, `m` mutes the claim cue, `f` declares
fishing, `u` undoes the previous decision by replaying from the seed, `n`
deals a new game and `?` lists the keys. The whole hand is playable
keyboard-only. A claim bar has two decisions, Claim and Dismiss; multiple chow
runs are clickable tile groups under the row. The cue is synthesised with the
Web Audio API, plays once per claim window after the first gesture, and stays
muted across reloads when `m` turned it off. After a hand the result
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

Review states freeze one board each, so a screen can be looked at, screenshotted
and compared without playing to it: `?state=turn|claim|wait|fishing|win|drawn|result`
replays a fixed seed through the same reducer and the same bot policy the table
uses, and stops at the state named. The tab and a tag on the rail carry the
state's name, so a screenshot identifies itself, and `npm run test:layout`
re-measures every state against a plain table at 1440x900 and 1280x800:

```sh
open "http://127.0.0.1:8080/?state=claim"
```

| State | The board it shows |
| --- | --- |
| `turn` | Your turn, fourteen tiles, the drawn tile apart, Discard offered |
| `claim` | A claim window on a North discard, with two chow runs to choose from |
| `wait` | Thirteen tiles (a kong, three melds) with one live completing tile |
| `fishing` | Your fishing wait announced, both waits badged in the rail |
| `win` | A winning hand and its computed pattern/points |
| `drawn` | The wall exhausted: a drawn hand and its reason |
| `result` | A win with payments, any fishing settlement and the score |

### API

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /` | | the table page |
| `GET /app.js`, `/app.css` | | the plain ES module and stylesheet |
| `GET /tiles/<key>.svg`, `/tiles/back.svg` | | one tile face or the tile back |
| `GET /api/state` | `game=<id>` (`&pretty=1` indents the JSON) | the `viewFor` view, legal actions, wall count, per-seat table, ledger, wait panel and result |
| `GET /api/scenario` | `state=<name>` | one fixed review board, its tab title (`title`) and the hand's events |
| `POST /api/new` | `{ "seed": "..." }` | a new game and its first state |
| `POST /api/move` | `{ "game": "...", "action": {...} }` | the new state plus `events` as text lines |
| `POST /api/undo` | `{ "game": "..." }` | the state before the previous human decision; the log is replaced |
| `POST /api/step` | `{ "game": "..." }` | the next single bot decision, or `{ "done": true }` |
| `POST /api/next` | `{ "game": "..." }` | the next hand after a finished one |

The routes are one pure function, `routeApi` in `src/server/api.ts`; the Node
server only adds HTTP and static files, and the offline app calls the same
function in the page.

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

The payload is a `StatePayload`: `viewFor` for the viewer, legal actions,
wall count, per-seat table, ledger and checker. `POST /api/new` now returns a
discard-phase board with East holding 14 tiles; the other seats hold 13.

## Offline app

The app the group plays is the offline build: no server, no account, three
bots on the device.

```sh
npm run build      # writes dist/ (about 80 files, no dependencies)
npm run preview    # serves dist/ on http://127.0.0.1:8091/ like a web host
npm run preview -- --lan   # also reachable from a phone on the same Wi-Fi
```

`tools/build-web.ts` follows the imports of `src/web/local.ts` and turns each
TypeScript file into plain JavaScript with Node's own type stripper, so the
browser runs the same engine, bots and API routes as the tests. The page is
marked `data-transport="local"`, and `web/app.js` then answers its API in-page
instead of over HTTP.

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

The board's geometry has its own measurable check:

```sh
npm run test:layout
```

It starts the real server, drives headless Chrome, fills the reserved rivers
with 0, 13 and 36 tiles, and asserts that no river, centre panel, seat chip or
rack, or hand band intersects at 1440x900 and 1280x800. It also opens a real
finished hand to verify the result modal fits the viewport. Screenshots are
written to a temporary directory and printed.
