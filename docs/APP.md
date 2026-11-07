# App reference

The app is a static site: a 3D table in the browser that plays international
mahjong against three bots, offline, saving after every move. It has three
layers, each only calling the one below:

```
app/src/      the 3D table: renders, animates, takes your taps
src/table/    the table service: games, bots, saves, the API the table calls
src/core/     the rules engine (see ENGINE.md)
```

## The table

`app/index.html` with `app/src/` is the app: a Three.js table (version 0.170,
vendored under `app/vendor/three/`, MIT) that plays against three bots.

```sh
npm run dev        # build, then serve dist/ on http://127.0.0.1:8091/
```

- `app/src/layout.js` is the table geometry as plain numbers: walls, hands,
  the discard pinwheel, and each seat's meld zone - the corner to its right,
  out by the walls, where an opponent's melds and bonus tiles lie face up with
  nothing in front of them. `test/app/layout.test.ts` proves no discard or
  meld ever overlaps another, up to 29 discards and four kongs plus eight
  bonus tiles per seat.
- `app/src/tiles.js` models a tile: a rounded off-white front, a sky-blue
  lacquered back, and the face printed on it with a small corner index. The
  faces are the public-domain riichi set in `app/assets/faces/` (see its
  `LICENSE.md`).
- `app/src/stage.js` holds the renderer, the felt, the centre console, the
  table camera (solved for any screen shape) and your hand's own long-lens
  pass, plus promise-based tweens with a timer fallback, so a hidden page
  never stalls the game.
- `app/src/board.js` compares each game answer with the table and animates
  only the difference: throws, claims flying to the claimer, melds, draws and
  the shrinking wall.
- `app/src/main.js` runs the turn loop (bots one decision per beat, automatic
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

## The table service

The table never holds a `GameState`. It calls `routeApi` (`src/table/api.ts`)
in the page through `src/table/local.ts`, and every answer is built from
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
nothing. `test/table/api.test.ts` walks live payloads and asserts every opponent
tile appears only under a public path.

## Offline, saving and installing

The app is a static site: no server, no account, three bots on the device.

```sh
npm run build      # writes dist/ (about 80 files, no dependencies)
npm run preview    # serves dist/ on http://127.0.0.1:8091/ like a web host
npm run preview -- --lan   # also reachable from a phone on the same Wi-Fi
```

`scripts/build.ts` follows the imports of `src/table/local.ts` and turns each
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
  with its own icon (`app/assets/icons/`). Service workers need https, so install
  from the deployed site, not from a `--lan` address.

## Deploying

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
