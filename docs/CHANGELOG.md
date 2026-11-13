# What changed in each test version

Newest first. Written for players: what you will see, what was fixed, and
what now works differently. Each version is a `v0.1.0-alpha.N` tag on `main`;
testers get it at https://int.mah-jong.workers.dev.

## alpha.7

**New**

- **Discards in a pile, like a real table.** Options › Discards › Pile throws
  every discard into one shared heap in the middle of the table. Each tile
  slides in from the thrower's side and nudges the tiles it hits; nothing
  shows who threw what, or when. In this layout the middle console steps
  aside: each player's wind and score sit at their edge of the table (the
  player whose turn it is glows), and the round and tiles left are under
  the menu. Rows, as before, stay the default.
- **See who is fishing.** A player who has announced fishing shows a small
  fish for the rest of the hand, beside their wind.
- **Goulash: arrange while you pass.** During the three exchanges you can
  drag tiles sideways to arrange your hand, and a tap still picks a tile to
  pass. After each exchange the tiles you just received are marked in teal.
- **Two new house rules** in Options › House rules:
  - *No half-limit hands in a Goulash* (from the Companion, p. 55). **On** by
    default.
  - *Announce fishing to win*: a player who was offered the fishing
    announcement can only go out after announcing it. Neither book asks for
    this, so it is **off** by default.
- **Help is a visual guide**, with tips during your first game and a welcome
  card.
- **Options redesigned.** New game is now inside Options. Phones that will
  not turn sideways get help, and the app offers to install itself.

**Changed**

- **Hard bots are harder.** They go for quick hands instead of chasing big
  special hands, and call tiles more readily. In our tests a Hard bot now
  wins clearly more often than the previous Hard bot.
- **Flower and season tiles show pictures** (plum, orchid, chrysanthemum,
  bamboo; seedling, sun, maple, snowflake) instead of brush characters. The
  pictures are big, with a thin frame in each tile's own colour, and the
  number in the corner as before (red flowers, green seasons).
- **Large discards** (phones) show only the tile just thrown, not the whole
  round, and step aside when it is your turn, so nothing distracts you
  while you draw and throw.
- The extra copy of the discarded tile beside the claim buttons is gone.

**Fixed**

- Auto sort stays on when you swipe a tile up to throw it.
- A tile you picked out while the bots played stays picked when they move.

**What works differently now**

- In a Goulash, a hand worth half the limit no longer wins (unless you turn
  the new house rule off). If the tiles also make another hand, they score
  as that hand.
- Hard is noticeably tougher. Medium is still the starting level.
- New game has moved from the menu into Options.

## alpha.6 (12 November 2026)

**New**

- Dice are thrown to choose East, and each hand opens with the dice, the
  break of the wall and the deal (Options › Dice and dealing › Skip leaves
  it out; a tap skips it too).
- **Large discards** on phones: this round's discards show their face at
  twice the size until you throw (switch in Options).
- **Bot level** in Options: Easy, Medium (the default) or Hard.

**Fixed**

- Little Robert: its pung and pair must be suited tiles, not honours.
- Options: the Sound switch sits on its label's line.

## alpha.5 (12 November 2026)

**New**

- **Pace** in Options: Slower, Normal or Faster bots.
- Arrange your hand while the bots play; a tile is only thrown on your turn.
- **Play this hand again**, a quiet link on the result card.
- Pin hands from *All hands* to the hints panel.
- The hand sheet is redesigned: the book's sample hand first, the books' own
  words, one order everywhere.

**Fixed**

- The zoomed view of the discards keeps the scores in the middle readable.

## alpha.4 (11 November 2026)

**New**

- **Options** sheet, with the first house rule: which hands are in play (all,
  Companion hands only, or Companion hands with a picture).
- **All hands**: a searchable index of every hand in both books, above the
  hints panel.
- Tap the discards to zoom onto them from above; tap again to go back.
- The hand sheet shows the book's own sample hand.
- A Goulash is announced in the middle of the table.
- **Report** sends a problem report straight to us.
- Help rewritten as a guide to using the app.

**Fixed**

- The hints measure exactly how far you are from each hand (Crazy Chows no
  longer read "4 to go" with one tile missing).
- Dragon's Run and other hands the Companion prints without a dot are
  concealed-only.
- The report sheet stays above the keyboard.
- The Goulash exchange could get stuck.

## alpha.3 (11 November 2026)

**New**

- An install guide on the "turn your phone" screen.
- A game in progress survives an update of the app.

## alpha.2 (10 November 2026)

**Changed**

- Testers have their own site, which changes only when a new test version
  is released.
- Tapping a second hand tile moves the selection to it instead of swapping.
- The turn light waits until a move has finished, and is brighter.

**Fixed**

- The table fits the screen again when the home-screen app is reopened.
- iPhone no longer zooms in on the report note field.

## alpha.1 (9 November 2026)

The first test version: international mahjong by the rules of *The Game of
Mah Jong Illustrated*, with the hands of *The Mah Jong Player's Companion*,
on a 3D table against three bots. Tap or swipe to throw; claims, kongs,
fishing and Mah Jong as buttons; a hints panel with the hands you are
closest to; the game saves after every move; Report to send us a problem.
