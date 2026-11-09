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
  the discard pinwheel and the meld lanes. By table custom each player's melds
  lie in their own wall's lane, starting in the table corner on their left -
  bonus tiles hard left, a space, then the melds in the order made - and grow
  to the right as the wall in front of them is used up; each side's remaining
  wall is pushed to its right end. `test/app/layout.test.ts` proves no meld
  touches a wall, a hand, a discard or another player's melds.
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
- `app/src/settlement.js` words the result card's account of the points from
  the ledger (every entry is tagged with its kind in `src/core/game/state.ts`).
  The card shows only the result: each seat's change and, under it, who it paid
  or was paid by and how much. Tapping a payment opens its reason (winning
  hand, East's double, fishing, careless discard, penalties; or why nothing
  moved on a drawn hand). Pure, so it is tested in
  `test/app/settlement.test.ts` on real engine hands.

- `app/src/sound.js` is the sound, synthesised live with Web Audio: no audio
  files, so nothing to license, ship or cache. See "Sound" below.

Tap a tile to lift it and tap it again to discard. Tap a second tile while one is lifted and the two swap places; drag a tile along the hand and it trades places with every tile it passes, so you can arrange the hand your own way (it stays arranged for the hand). Claims, kongs, fishing,
Mah Jong, reshuffle and the Goulash exchange appear as buttons when the engine
offers them. The table is landscape only.

The panel at the top right lists the closest hands: up to three catalogue
hands your tiles are nearest to, with how many tiles each still needs, its
value and the missing tiles. It is asked for when your own tiles change and at
each of your decisions, and hides on the result card. The menu's Hints button
turns it off (remembered on the device).

## Sound

`app/src/sound.js` plays named cues (`sound.cue("clack", { delay, pan, far })`)
on the audio clock, so `board.js` can ask for a clack when a throw starts and
have it land with the tile. The table has a rhythm you can follow with your eyes
shut:

| Cue | When | Character |
| --- | --- | --- |
| `draw` | a bot takes from the wall; your drawn tile slides in | soft, low brush and tap (centroid about 330 Hz) |
| `clack` | a discard lands (yours, then each bot's, panned to its side; the opposite seat is darker and quieter) | the base beat: a weighty plastic tile on smooth felt, a low round thump (centroid about 300 Hz, top end rolled off), nearly the same each time, never sharp; the chimes and ticks are the bright sounds, so the two kinds stay apart |
| `meld` | a call's tiles drop together; a claimed discard arrives with its own clack | 3-4 clacks a hair apart |
| `tick` | a hand tile under the mouse, or your first tap on it (pitch follows its place in the hand); `swap` when two tiles trade places | very quiet click |
| `lift` | the moment you throw a tile | short low pluck, before the clack |
| `alert` / `alertWin` | the game asks you to decide: chow, pung, kong, fishing, the Goulash exchange / Mah Jong is on offer | bright rising two- or three-note bell |
| `notice`, `fishing` | an opponent calls / declares fishing | soft bell |
| `deal`, `win`, `lose`, `drawn` | a new hand; the hand ends | tile rattle; clatter and a rising chime; clatter and falling notes; falling pair |
| `press` | any button | small tap |

Browsers play nothing until the page has had a gesture, so cues before your
first tap or key press are dropped, and iOS is switched to the media channel so
the silent switch does not mute the game. The menu's Sound button turns all of
it off (remembered on the device). A hidden page is silent. `test/app/sound.test.ts`
checks the scheduling with a fake audio context; to hear a cue, render it with an
`OfflineAudioContext` through `createVoices` (it takes any context).

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
| `GET /api/closest` | `game=<id>` | the catalogue hands your tiles are nearest to (`closestHands`), at most three |
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

The app is live at **https://int.mah-jong.workers.dev** (Cloudflare
Workers static assets; `wrangler.jsonc` names the folder and the account).

**Automatically:** every push to `main` whose tests and build pass is
published by the `Deploy to Cloudflare` job in `.github/workflows/test.yml`.
It needs the repository secret `CLOUDFLARE_API_TOKEN` (a Cloudflare API token
from the "Edit Cloudflare Workers" template); without it the job skips with a
notice. So any session - a laptop or a cloud session from a phone - publishes
just by pushing, and installed copies update on their next launch.

The token, its renewal and the rest of the workflow: `docs/WORKFLOW.md`.

**By hand**, from a machine logged in with `npx wrangler login`:

```sh
npm run deploy       # npm test, npm run build, then upload dist/
```

Only `dist/` is uploaded; the rule documents and book pages in `rules/` stay
in the private repository (`test/table/offline.test.ts` checks this).
