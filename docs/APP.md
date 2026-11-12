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
  to the right as the wall in front of them is used up (the wall never
  slides). `test/app/layout.test.ts` proves no meld
  touches a wall, a hand, a discard or another player's melds.
- The wall is broken and drawn as *Illustrated* pp. 18-19 and p. 62 show: the
  dice (`breakFor`) name the wall and the stack counted from its right-hand
  end; that stack is lifted off. The wall is one ring read from the open end
  (`wallPlan`): ordinary draws leave its head, left of the break, the upper
  tile then the lower, then the next stack, round the table; replacements
  leave its tail, the dead wall's column touching the break and then the next
  one away from it, along the wall and round the corner. They meet, so no tile
  is left over, and stacks vanish where they stand; nothing slides. By the
  owner's rulings on presentation (issues #56 and #60; the book's detail
  diagram puts the loose tiles on the 2nd and 7th stack, same tiles, count
  and order) both loose tiles lie on the column touching the break, 4 high;
  after one replacement it is 3 high; after the second the plain two-tile
  column is lifted onto its neighbour away from the break, which is 4 high,
  and so on: the marker advances one column per two replacements, and only
  that column is ever 3 or 4 high (`wallLook` in `layout.js`; see
  `rules/archive/ASSUMPTIONS.md`, "Wall draw animation"). The lane for melds
  ends at the highest wall slot still standing; `test/app/layout.test.ts`
  pins the order and proves no meld touches a wall.
- `app/src/tiles.js` models a tile: a rounded off-white front, a sky-blue
  lacquered back, and the face printed on it with a small corner index. The
  faces are the public-domain riichi set in `app/assets/faces/` (see its
  `LICENSE.md`).
- `app/src/stage.js` holds the renderer, the felt, the centre console, the
  table camera (solved for any screen shape) and your hand's own long-lens
  pass, plus promise-based tweens with a timer fallback, so a hidden page
  never stalls the game. `app/src/camera.js` does the framing: the hand strip
  is only as tall as the tile row needs (plus headroom for a lifted tile), and
  the table camera is solved down to the top of the standing hand tiles, so
  no screen is spent on felt between your melds and your hand.
- The pond zoom (`stage.js` `setPondZoom`, `camera.js` `fitPondCamera`): a tap
  on the table inside the walls swings the table camera straight above the
  ponds (your own pond still nearest you) and your hand slides off the bottom
  edge, so the discards have the whole screen; a tap anywhere swings back.
  The view frames the square `pondExtent` gives for the discards lying (never
  less than the three full rows). It works while the bots play; a tap with a
  hand tile lifted only puts the tile down. With `prefers-reduced-motion` the
  view changes at once. `test/app/view.test.ts` proves every discard is on
  screen and larger than in the table view.
- The turn light (`stage.js`, `updateConsole`): the console is painted in three
  layers (panel, light, lettering) so the light can move under the text. The
  seat whose turn it is glows along its edge with a soft, edgeless light, wide
  (it spans most of the edge) and weak (peak about 0.4 of the cyan, so the
  lit seat's score keeps its contrast at phone size), that
  breathes very slowly (about 5 s a cycle, drawn at roughly 16 frames a second
  only while the light is lit and the page visible); when the turn passes the
  light travels round the corner to the next seat in about a quarter of a
  second. With `prefers-reduced-motion` it neither breathes nor travels: the
  old edge fades out as the new one fades in. Nothing else is animated.
- Who threw what (`board.js`, `layout.js` `pondPad` / `latestPlate`): a faint
  pad tints each seat's pond (the dealer's in coral, as on the console) and the
  latest discard (the view's `lastDiscard`) lies on a soft cyan plate, the
  console light's colour. Both are still and flat on the felt;
  `test/app/layout.test.ts` proves the pads never touch and the plates stay
  clear of the console and other ponds.
- `app/src/board.js` compares each game answer with the table and animates
  only the difference: throws, claims flying to the claimer, melds, draws and
  the shrinking wall. Two parts of the `Board` live in their own files and
  are installed on it: `board-wall.js` (building and showing the wall) and
  `board-hand.js` (your own hand: its tiles, layout, picking, lifting,
  dragging). The page's CSS is `app/styles.css`.
- `app/src/main.js` is the boot, the turn loop (bots one decision per beat,
  automatic draws and passes), the decision buttons and call-outs, and the
  wiring of the modules below. Its siblings, each a plain ES module:
  `shared.js` (the one mutable `state` - api, latest answer, busy, calls
  off - plus the board, storage, `request`, `toast`, `faceChip` and other
  small helpers), `input.js` (hand input: tap, lift, drag, swipe-to-throw,
  the goulash picks), `goulash.js` (the Goulash banner over the middle of the
  table during the three exchanges: what the hand is, which exchange, who your
  tiles go to, how many are picked), `hints.js` (closest-hands panel, the hand
  sheet with the book's own sample hand, and the Hints toggle), `handbook.js`
  (the index of all hands), `result.js` (the result card and the final
  standings), `menu.js`
  (the Calls, Sort, New game buttons and the help sheet), `options.js` (the
  Options sheet: the Sound switch, the house rules, and the Help and Report
  buttons) and `report.js` (report a problem). Modules that need the loop (`input`,
  `result`, `menu`) get its functions from `main.js` through an `installX`
  call, so imports never run in a circle.
- `app/src/standings.js` ranks the seats by total score for the final standings
  shown after the last hand's result card (its button reads "Final standings",
  the standings carry "New game"). Seats with equal totals share a rank and a
  tie for first names every tied seat a winner: the book says only that the
  highest score wins the game (Illustrated p. 16) and gives no tie-break. The
  open standings are kept in storage, so a reload resumes them.
- `app/src/settlement.js` words the result card's account of the points from
  the ledger (every entry is tagged with its kind in `src/core/game/state.ts`).
  The card shows only the result: each seat's change in green or red and its
  total, which fits a phone held sideways without scrolling (checked down to
  667x375). Tapping a seat opens its payments ("Pays South 1,200") each with
  the reason (winning hand, East's double, fishing, careless discard,
  penalties; or why nothing moved on a drawn hand). Pure, so it is tested in
  `test/app/settlement.test.ts` on real engine hands.

- `app/src/sound.js` is the sound, synthesised live with Web Audio: no audio
  files, so nothing to license, ship or cache. See "Sound" below.

Tap a tile to lift it and tap it again to discard; or hold it and swipe up (a mouse can drag it up the same way) and let go to throw it onto the table: it swells once the swipe is far enough, and sliding back down cancels. Tap a second tile while one is lifted and the lift moves to it (so touch can compare discard options like hovering with a mouse); drag a tile along the hand and it trades places with every tile it passes, so you can arrange the hand your own way (it stays arranged for the hand). Arranging, and lifting a tile to look at it, works at any time, the bots' turns included (issue #99); only a throw needs your turn, so a tile swiped up or clicked on the bots' turns just settles back into the hand, and a hover lifts nothing. Claims, kongs, fishing,
Mah Jong, reshuffle and the Goulash exchange appear as buttons when the engine
offers them. The table is landscape only.

The panel at the top right lists the closest hands: up to three catalogue
hands your tiles are nearest to. A row and the hand's sheet give the same facts
in the same order: the hand's name, how it is played (Concealed or Exposed),
how many tiles you are from it ("3 to go", "Complete"), and last what it pays. It is asked for when your own tiles change and at
each of your decisions, and hides on the result card. The menu's Hints button
turns it off (remembered on the device).

**Pinning.** A hand's sheet (from the panel or from All hands) has a pin
button, an icon at the top right beside the close cross (gold and filled while
pinned; a fourth pin is refused with a one-line message). A pinned hand takes the panel's first place, the next pin the
second, a third pin the third; what the planner suggests fills the places the
pins leave (`GET /api/closest?pins=a,b,c`, `closestWithPins` in
`src/core/game/closest.ts`). A pinned row carries a pin mark and says how many
tiles you are from the hand, or "Out of reach" when it is more than six away
or can no longer be made (the copies are in sight, or an exposed meld rules
out a concealed-only hand). Unpinning gives the place back: the pins behind it
move up and the suggestions return. At most three hands can be pinned (the
panel shows three in all, for a phone's sake); the fourth is refused until one
is unpinned. Pins belong to the game (`app/src/pins.js`, kept on the device):
they survive a reload and the next hand, and a new game starts with none. With
Hints off the panel shows only the pinned hands, since a pin is the player's
own choice. The cards in All hands carry a "Pinned" mark.

The panel is deliberately small and quiet (176px, muted colours, no tile
chips) so it never competes with the table, even on a phone. Each row is the
hand's name and one line in the books' own words and order: how it is played
("Concealed" when any exposed meld rules the hand out, as for most special
hands; "Exposed" when exposed melds are allowed), "n to go", and last its value.
No icons: the Illustrated prints "Concealed" or "Exposed" under each hand and
the Companion prints "LIMIT (Concealed) HALF LIMIT (Exposed)", so players
already know the words. Tapping a row opens the hand's sheet
(`GET /api/hand`), laid out to fit a phone's height without scrolling (600px
wide, one column): the name with the pin and the close cross at the right; one
row of chips - the play chip (the word "Concealed" or "Exposed"; tapping it opens the explanation of what it means for calling
discards and self-drawn wins, which a player needs once), "Self-drawn only",
how far your hand is ("3 to go" or "Complete") when you have the hand in play
and, last, what it pays (one value, or concealed and exposed when they
differ); the book's sample hand first, in its own dashed panel headed "Sample hand from the
book" (or "Sample hands from the books"), each picture followed below by a pill
for the book and page (and its version), so two books read title, 1st hand,
1st source, 2nd hand, 2nd source; the hand's composition below it; then,
set apart by a soft gold edge, "Tiles you still need" with the tiles to
collect, so the book's tiles and yours are never confused. Close it with the cross, the backdrop or Escape.

Above the panel, **All hands** opens the index of every catalogue hand
(`app/src/handbook.js`, `GET /api/hands`), so nobody has to reach for either
book. It stays there with Hints off. Each card shows the hand's name, value, an
example in tiles, its composition and the concealed/exposed icon; tapping it
opens the same hand sheet, which also lists the example and the page in each
book. The rail on the left filters by:

- **Kind of hand**: the headings of the Companion's "Full synopsis of special
  hands" (C pp. 56-61) - Runs, Chows, Pairs, Pungs & Kongs, Winds, Dragons,
  All Honours, Winds &/or Dragons with Suits, One/Two/Three Suits and the
  Bamboo, Circle and Character suits - with the hands in the book's order. A
  hand the book files under several headings is under each. The transcription
  is `src/core/patterns/reference.ts`. All Kong and Mixed Pung (Illustrated
  p. 30, not in the synopsis) are filed under Pungs & Kongs by composition;
  Buried Treasure and the Chinese ordinary hand have no heading and sit under
  "Other".
- **Value** (the concealed tier), **Play** (Concealed or Exposed)
  and **Book** (printed in the Illustrated book, or only in the Companion).

The search box matches every typed word against the name, composition,
headings, value and book of a hand ("dragon pairs", "1-9 wind"). While a hand
is being played, cards within reach of your tiles carry "n to go"
(`/api/closest?limit=100`), the sheet lists the tiles still needed, and
**Order** can sort the nearest hands first.

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
| `tick` | a hand tile under the mouse, or your first tap on it (pitch follows its place in the hand); `swap` when a dragged tile trades places with one it passes | very quiet click |
| `lift` | the moment you throw a tile | short low pluck, before the clack |
| `alert` / `alertWin` | the game asks you to decide: chow, pung, kong, fishing, the Goulash exchange / Mah Jong is on offer | bright rising two- or three-note bell |
| `notice`, `fishing` | an opponent calls / declares fishing | soft bell |
| `deal`, `win`, `lose`, `drawn` | a new hand; the hand ends | tile rattle; clatter and a rising chime; clatter and falling notes; falling pair |
| `press` | any button | small tap |

Browsers play nothing until the page has had a gesture, so cues before your
first tap or key press are dropped. On iOS the page asks for the "ambient"
audio session (`navigator.audioSession.type`), so the game no longer shows a
speaker symbol in the Dynamic Island (issue #49); the price is that the phone's
silent switch mutes the game. After 5 seconds with no cue the audio context is
suspended (so iOS sees no audio activity) and the next cue resumes it; that cue
is scheduled at once and starts when the clock runs again. The Sound
switch in Options turns all of it off (remembered on the device), and is the control for
desktop and Android, which have no silent switch. A hidden page is silent. `test/app/sound.test.ts`
checks the scheduling with a fake audio context; to hear a cue, render it with an
`OfflineAudioContext` through `createVoices` (it takes any context).

Two URL options help when testing:

| URL | Opens |
| --- | --- |
| `/?state=turn\|claim\|wait\|fishing\|announce\|ron\|win\|drawn\|result\|goulash` | one fixed review board, replayed from a seed |
| `/?phone` | the table inside an iPhone-landscape frame, on any screen |
| `/?install=ios\|android\|ios-webview\|android-webview` | that install guide on the turn-your-phone screen, on any phone held upright |

`npm run smoke` (`scripts/smoke.ts`) opens every one of these boards in
headless Chromium, then plays a fresh game by touch: drag and sort, tap twice
to throw, hints and help, a few turns, and a reload that resumes the save. It
is the only test that runs `main.js`, `input.js`, `hints.js` and `result.js`.

## The table service

The table never holds a `GameState`. It calls `routeApi` (`src/table/api.ts`)
in the page through `src/table/local.ts`, and every answer is built from
`viewFor(state, seat)`: your own hand, the public melds, discards and bonus
tiles of the other seats, and their hand counts only.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/state` | `game=<id>` | the view, legal actions, wall count, per-seat table, ledger, wait panel, result and `scoresBefore` |
| `GET /api/closest` | `game=<id>` | the catalogue hands your tiles are nearest to (`closestHands`), at most three; `limit=<n>` raises that to at most 100 |
| `GET /api/hand` | `pattern=<id>` | one catalogue hand's conditions: composition, concealed-only, self-drawn, concealed and open value, its example, book headings and the page in each book (`handDetail`) |
| `GET /api/hands` | - | the whole catalogue for the index: every hand as above, and the book's headings with their hands in book order (`handIndex`) |
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
  resuming replays only the current hand. If a new version can no longer
  replay that hand (the engine or the bots changed), the hand starts again
  from its checkpoint, the scores of the finished hands are kept, and a
  toast says so.
- **Offline.** A generated service worker pre-caches every file under a cache
  named after the build's content hash. Once opened, the app starts in
  airplane mode; a new deploy replaces the cache and reloads the page once,
  which resumes the saved hand.
- **Version label.** The menu shows `<stage> · <id>` small under the
  buttons: `alpha.3 · <id>` on the tester site, `dev · <id>` everywhere else.
  A release build takes its version from its tag (`v0.1.0-alpha.3` gives
  `0.1.0-alpha.3`), so nothing is bumped by hand; other builds take
  `package.json`'s `0.1.0-dev`. The id is the short commit (`GITHUB_SHA`, as
  in CI) or else the content hash. `src/build-info.js` exports `BUILD`
  (`version`, `stage`, `id`) and `BUILD_LABEL`; import it to put the build in
  a problem report. Unbuilt, the label reads `dev · local`.
- **Options and house rules.** The menu's Options button opens a sheet with
  the Sound switch, the house rules, and the Help and Report buttons (their
  sheets open on top of it). A house rule is a preference kept on the device
  (`int-maj:house-rules`); `houseRules()` in `options.js` is sent with every
  `/api/new` and `/api/next`, and the table fixes a hand's rules at its deal
  (`GameState.excludedHands`), so a change made mid-hand reads "Takes effect
  with the next hand" until then. Every payload carries the rules in force
  (`houseRules`), `/api/house-rules` names the hands each hand set leaves out, and a
  problem report carries the rules so it replays. The one rule so far is which hands are in play
  (all, the Companion's, or the Companion's with sample pictures); see
  `rules/RULES.md` Part III §5. Hand values are the Companion's in every set;
  in the two Companion sets the hand sheet and result card name only Companion
  pages (`pages.js`) and the payment explanations drop their Illustrated page
  citations (`explainSettlement({ cite: false })`).
- **Report a problem.** The Report button in Options (accessible name "Report a
  problem") opens a sheet of that title with an optional one-line note and a
  Send button (accessible name "Send report"; the keyboard's return key sends
  too). `app/src/report.js` posts the text to `api/report` on its own site,
  and the Worker in front of the static files (`src/worker/`, the only server
  code) files it as an issue labelled `report` in this repository, titled
  with the note and the build; the sheet answers "Sent as report #N". The
  issue holds the text in a code block, so save that block as `report.txt` to
  replay it. A game too long for an issue (about nine hands) has its replay
  block gzipped and base64-encoded by the Worker (`src/worker/pack.ts`);
  `npm run replay` unpacks it. The endpoint takes only a same-origin post of
  one well-formed report of at most 300 000 characters, five a minute per
  address, and needs the Worker secret `REPORT_GITHUB_TOKEN`
  (`docs/WORKFLOW.md`, "Problem reports"). When the post fails (offline, or
  no token on that site, as under `npm run dev`) the sheet says so and offers
  "Share it instead": `navigator.share` (the iOS share sheet) or, where that
  is missing or fails, the clipboard with a toast.

  A phone's keyboard covers the page instead of resizing it, most of it in
  landscape, so the sheet is kept on `window.visualViewport` (the part still
  in sight) and aligned to its top, with the note and Send side by side;
  under 240px of visible height it drops its small print. It also opens over
  the turn-your-phone screen, so a report can be typed in portrait.

  `src/table/report.ts` builds the text (`LocalApi.report`), so `app/` only
  collects the note and delivers. The text:

  ```
  int-maj problem report
  Version: 0.1.0-alpha.3
  Build: <build id>
  User agent: <navigator.userAgent>
  Hand: <n> (<phase>)
  Decisions: <all steps> (yours: <human steps>)
  Note: <one line, 280 characters at most, or (none)>

  -----BEGIN REPLAY-----
  {"format":"int-maj-report/1","seed":...,"dealer":"E","steps":[...],"humanSteps":[...]}
  -----END REPLAY-----
  ```

  The JSON is the seed, the first dealer and every decision in order, bots
  included, as `ReplayStep`s (public actions: discards, claims, wins). It
  carries no `GameState`, checkpoint or tile lists; the seed deals the wall, so
  replay rebuilds the hands, which is all a replayable report must hold.
  `npm run replay -- report.txt` replays a pasted report (`replayReport` in
  code) to the same state.
- **Install.** Safari > Share > Add to Home Screen (Android: browser menu >
  Add to Home screen) gives a full-screen app with its own icon
  (`app/assets/icons/`). Service workers need https, so install from the
  deployed site, not from a `--lan` address.
- **Install guide.** A phone's browser shows the steps for that phone under
  "Turn your phone sideways" (`app/src/install.js`): Share steps on iOS, a
  one-tap Install button on Android once the browser offers it
  (`beforeinstallprompt`) and the menu steps until then, and "open in
  Safari/Chrome" inside another app's browser. An installed copy and a
  computer never see it.

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
