# Engine reference

`src/core/` is the rules engine: pure, deterministic TypeScript with no I/O,
no clock and no dependencies. Everything the app shows comes from it. The
rules it follows are `rules/RULES.md`; this page describes its code.

| Module | What it holds |
| --- | --- |
| `tiles.ts`, `rng.ts`, `wall.ts` | tile keys, the seeded RNG, the wall and the deal |
| `hand.ts`, `shape.ts`, `decompose.ts` | hands, tile counts, standard decompositions |
| `patterns/` | the hand catalogue as data (`table.ts`), its predicates and types |
| `match.ts`, `score.ts`, `fishing.ts` | matching a hand, ground score and doubles, fishing |
| `check.ts` | the table-side checker behind `npm run check` |
| `game/` | the turn engine: state, actions, events, legal moves, reducer, replay, bot, text |

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

The terminal session lives in `src/cli/console.ts`; `bin/play.ts` is its
readline loop.

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

The bot (`src/core/game/bot.ts`) prices every decision with the hand planner
(`src/core/game/bot/plan.ts`). For each hand it could still build - a special
hand from the generated target table `bot/targets.ts`, or an ordinary or
seven-pair hand assembled around its own tiles and priced by `scoreHand` - it
counts the missing tiles and the copies it has not seen, and estimates the
chance of collecting them in the draws left (the last tile may also be claimed
off a discard). A hand's value is that chance times what the hand pays, over
its best few targets. The bot then:

- wins when legal and announces fishing whenever the engine offers it;
- calls a pung, kong or chow only when the hand is worth clearly more after
  the call, so it lets discards go when a call would forfeit a concealed hand;
- declares a kong when the replacement tile is worth more than a discard;
- discards the tile whose loss costs least, avoiding tiles another seat is
  announced fishing for and, late in a hand, tiles that feed an opponent's
  visible one-suit hand.

Each seat has a temperament (`temperamentOf`: steady, ambitious, quick,
careful) that scales its appetite for special hands, calls and caution. The bot
never sees another seat's hand. `node scripts/bot-targets.ts` regenerates the
target table from the catalogue fixtures; every target is re-checked against
its pattern in `test/core/bot-targets.test.ts`.
