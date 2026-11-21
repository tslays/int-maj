# Multiplayer plan: online rooms

**Decision (owner, 2026-11-18):** multiplayer comes as online rooms on
Cloudflare Durable Objects, on the free Workers plan the project already
uses. Playing over the same Wi-Fi is the same thing: friends in one room join
one code. Peer-to-peer WebRTC (offline play over the local network, no server)
is deferred; it may follow later as its own plan. Only free options:
no paid plan, no other vendor, no accounts.

This is a phase after alpha-1. It does not change the alpha-1 scope (alone
against three bots, offline), and single-player keeps working offline, with
no network, exactly as it does today.

## Shape

```
phone (app)  --WebSocket-->  Worker /api/room/<code>  -->  Durable Object "Room"
                                                             routeApi-style table
                                                             one GameStore, 1-4 humans,
                                                             bots in the other seats
```

- **One Durable Object per room**, named by a short room code (e.g. `K7QX`,
  no look-alike letters). It holds the game, the seats, and the connected
  sockets, and it is the only authority: it deals, applies every action
  through the reducer, and runs the bots.
- **Each phone gets only its own seat's projection** (`viewFor` / the same
  `StatePayload` the app reads today) and its own event text. A concealed
  tile never leaves the room for another seat; the existing guarantee carries
  over unchanged.
- **Same engine, same layers.** The room logic is pure and lives in
  `src/table/` (tested like `routeApi`, no I/O); the Durable Object in
  `src/worker/` only stores, broadcasts and keeps time. `app` -> `src/table` ->
  `src/core` stays the call direction.
- **Free-plan fit.** SQLite-backed Durable Objects (`new_sqlite_classes`
  migration) are on the free plan. The WebSocket Hibernation API means an idle
  room costs no duration, and storage is a seed plus a list of decisions
  (a few kB per game). A hand is a few hundred small messages, far under the
  daily free limits. If a limit is ever hit, rooms refuse new games for the
  day; nothing is ever billed.

## What the engine already gives us

- `claimWindow.pending` already waits for every seat to claim or pass, so
  several human claimers need no engine change. The table only has to
  collect them.
- Bots are a pure function (`chooseAction`), so any seat without a human (or
  whose human dropped) is played by a bot from the same state.
- Games are a seed plus decisions, so a room saves and resumes exactly, as
  `GameStore.snapshot` does on the phone today.

## What has to change

1. **Sessions with several humans.** `WebSession` assumes one human `seat`
   and undo over `humanSteps`. A room session has a set of human seats; undo
   and retry are off in rooms (they would rewrite other players' turns).
2. **Who acts.** "Waiting on the human" becomes "waiting on these seats".
   The room steps bots itself (server-side), with short pauses so humans can
   follow, instead of the app calling `/api/step`.
3. **Time.** A human who does nothing would stall three others. Claim windows
   and turns get a time limit, after which the room acts for them. The book
   has no time limit; this is table etiquette, not a rule. The default action
   is the one that changes nothing in the rules' sense: **pass** a claim
   window, and on your own turn **discard the drawn tile**. Record it in
   `rules/archive/ASSUMPTIONS.md` as an `[A]` entry before it ships, and make
   the limit a room setting (off for friends who prefer to wait).
4. **Seats and presence.** Join, leave, drop and rejoin. A dropped player's
   seat is played by a bot until they reconnect (the phone keeps a seat token
   in `localStorage`; no accounts).
5. **The app.** A lobby (create room, join by code or link, see who is
   seated, fill empty seats with bots, start), a connection indicator, and
   a transport that sends actions over the socket and renders pushed state.
   The single-player path keeps `src/table/local.ts` untouched.

## Slices (one pull request each)

Each slice is tested and merged before the next one starts.

**M1 - Room core (non-visual). Done (2026-11-18):** `src/table/room.ts`; the timer is assumption A-TIMER in `rules/archive/ASSUMPTIONS.md`. `src/table/room.ts`: a pure room over the
existing session code. It holds 1-4 human seats plus bots, takes
`{ seat, action }`, returns per-seat messages (each seat's payload and event
text) plus "bots to step next" and "deadline to arm". Undo and retry are
refused. Tests in `test/table/room.test.ts`: four humans play a seeded hand to
the end; claim-window precedence with two humans claiming; no message to a
seat ever contains another seat's concealed tiles (property test over whole
games); timeout actions pass or discard the drawn tile; a dropped seat is
played by the bot and handed back on rejoin.

**M2 - Durable Object and protocol (non-visual). Done (2026-11-18):** the
object is `src/worker/room-object.ts` in its own Worker (`wrangler.rooms.jsonc`:
`int-rooms`, `int-rooms-dev`), because Cloudflare gives no preview links to a
Worker that implements a Durable Object and only `wrangler deploy` may create
its class. The app Worker binds to it by script name (`src/worker/room-route.ts`)
and the deploy action deploys the rooms Worker first. Pull-request previews use
`int-rooms-dev` as `main` last deployed it, so a change to the room object
itself is first seen on int-dev after merging. The protocol is the comment at
the top of `room-object.ts`. Budget: each bot move is one alarm and every
change one storage write, a few hundred per hand, well inside the free daily
allowance for a group of friends. The plan as written: `src/worker/room.ts`: the
`Room` Durable Object (SQLite-backed, WebSocket Hibernation), routes
`/api/room/new` and `/api/room/<code>` in `src/worker/index.ts`, alarms for
deadlines, and saves after every applied action. The message protocol is
written down in `docs/APP.md` (client -> room: `join`, `act`, `ping`;
room -> client: `seated`, `state`, `events`, `left`, `error`). It adds
`wrangler.jsonc` bindings and migration for `int` and `int-dev`, with a
per-IP rate limit on room creation like the report limit. Tests drive the
handler with a fake socket and storage.

**M3 - Lobby and online play in the app (visual). Done (2026-11-18, released in alpha.16):**
`app/src/online.js` (Options › Play with friends, the room sheet, the turn
pill, rejoin after a reload); the time to move is 15 (default), 30 or 60
seconds, or off. The plan as written: A "Play with friends"
entry in the menu, the lobby screen, a share link
(`https://.../?room=K7QX`), the socket transport beside `local.ts`, a
connection indicator, and a turn timer shown on the table. Smoke test: two
headless pages join one room on `npm run dev` and play a hand. Review on the
PR preview by the owner on their phone.

**M4 - Hardening (mixed). Done (2026-11-18):** a phone that wakes, comes back
to the tab or back online pings the room and reconnects at once if the socket
is dead; with nobody connected the bots stop and the room is deleted after a
day (`EXPIRE_MS`); a phone on another protocol version (`PROTOCOL`, checked by
`test/app/online-protocol.test.ts`) reloads once to the current build; the
house rules are the dealer's at Deal. The plan as written: Reconnect after the phone locks or switches
network, room expiry (rooms with no one connected for a day are deleted),
version mismatch (a phone on an older build is told to reload), and the
house rules chosen by the room's creator. Settle on the timer defaults after
the owner's group tries it.

## Status (2026-11-21)

All four slices are released (alpha.16). A two-browser check on the main of
2026-11-21 (`wrangler dev -c wrangler.jsonc -c wrangler.rooms.jsonc`, which runs
both Workers and the Durable Object locally) created a room, joined it by
link, dealt, played moves from both phones and rejoined after a reload.

Known gap: the two-page smoke test planned for M3 is not in `npm run smoke`,
because `npm run dev` serves the app without the rooms Worker. It would need
the smoke run to start `wrangler dev` as above.

## Out of scope for now

Accounts, matchmaking with strangers, chat, spectators, and peer-to-peer or
offline local play. Any of these needs its own decision.

## Done when

Four phones join one room by link, play a full game together (or with
bots in empty seats), survive a phone locking mid-hand, and the game ends with
the same scores the engine would give the same decisions offline. All of it
runs on the free Cloudflare plan.
