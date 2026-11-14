# What changed in each test version

Newest first. Written for players: what you will see, what was fixed, and
what now works differently. Each version is a `v0.1.0-alpha.N` tag on `main`;
testers get it at https://int.mah-jong.workers.dev.

## alpha.8

**New**

- **Counter sticks fly across the table.** When a hand is settled, each
  payer throws coloured counter sticks to the winner over the result card
  (yellow 100, green 500, blue 1000, red 4000, the colours from the
  Companion). They land, skid and knock together with a wooden click, and
  the numbers on the card count up as each one lands. A tap skips it.
- **The Fishing button names the hand** you would be fishing for, beside the
  tiles you wait on. A tile that only wins if you draw it yourself (for
  example for Buried Treasure) is shown faded and marked *own draw only*.
- **Clearer hints.** The hand sheet now says when you need *one more* of a
  tile you already hold, and which other tile would complete the hand
  *instead*.
- **Room for your melds.** Your own claimed sets get a second and a third
  row when the wall leaves the lane short, so they stay large even with
  four melds and flowers out.

**Changed**

- **Big Robert is one card** in the index of all hands, showing both
  scorings: limit with the same numbers, half limit otherwise. *Dragon's
  Tail* and *Buried Treasure* lose their bracketed extras.
- **Goulash banner is quieter:** it shows only the exchange, who your tiles
  go to and how many are picked. What a Goulash is, is now explained once in
  the first-game tip. On a laptop the banner is solid and larger.
- Options › *Dice and dealing* is now **Table animations**, and its Skip
  also skips the counter sticks.
- On a computer, no more grey browser tooltip boxes pop up on hover.

**Fixed**

- **Grand Sequence** (from your report): the two extra tiles pair with tiles
  of the run (the same tile twice is fine too), not a separate pair of any
  suit. A hand that was one tile away now counts as one tile away, and
  Mah Jong is offered on the winning discard.
- **Ordinary-hand scores checked line by line against the book's scoring
  sheet:**
  - a pung completed by a discard scores as exposed, not concealed;
  - each double counts once (some hands counted their own flower or season,
    "no chows" and similar doubles twice);
  - every way of reading your tiles is scored and the best one counts;
  - East's first discard, the only-possible chow and robbing a kong now earn
    their bonus;
  - a hand that is both a half-limit hand and a higher-scoring ordinary
    hand is paid the higher score;
  - four sets of honours and a suited pair is an ordinary hand.
- **Buried Treasure** with a pung paid nothing when won on your own draw;
  it now scores, and fishing on it is offered.

**What works differently now**

- Some ordinary hands score differently: usually less where a double was
  counted twice, sometimes more where a bonus was missing.
- Grand Sequence is easier to complete than before.
- *Table animations › Skip* now also skips the counter sticks.

## alpha.7 (13 November 2026)

**New**

- **Discards in a pile, like a real table.** Options › Discards › Pile throws
  every discard into one shared heap in the middle of the table. Each tile
  slides in from the thrower's side and nudges the tiles it hits; the heap
  grows round, and nothing shows who threw what, or when. In this layout the
  middle console steps aside: a small badge under the menu shows the round,
  the hand, your own wind and the tiles left in the wall. Rows, as before,
  stay the default.
- **See every player's claims.** Tap a player's side of the table, where
  their flowers, seasons and melds lie, to open a sheet with everyone's
  claimed tiles shown large, one row per player. A tap closes it.
- **See who is fishing.** A player who has announced fishing shows a small
  fish for the rest of the hand: beside their wind on the console with
  rows; with the pile, next to their melds (your own fish is on the badge).
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
- **Options redesigned.** New game and Help are now inside Options. Phones
  that will not turn sideways get help, and the app offers to install
  itself.

**Changed**

- **Hard bots are harder.** They go for quick hands instead of chasing big
  special hands, and call tiles more readily. In our tests a Hard bot now
  wins clearly more often than the previous Hard bot.
- **Flower and season tiles look like a real set's**: the traditional
  pictures of plum, orchid, chrysanthemum and bamboo, and of the four
  seasons, each with its character and its number printed on the tile, as
  on the tiles you play with at home (from Cangjie6's tile set on Wikimedia
  Commons, CC BY-SA 4.0).
- **Large discards** (phones) show only the tile just thrown, not the whole
  round, each for the same short beat, so the table stays calm.
- The extra copy of the discarded tile beside the claim buttons is gone.

**Fixed**

- Auto sort stays on when you swipe a tile up to throw it.
- A tile you picked out while the bots played stays picked when they move.

**What works differently now**

- In a Goulash, a hand worth half the limit no longer wins (unless you turn
  the new house rule off). If the tiles also make another hand, they score
  as that hand.
- Hard is noticeably tougher. Medium is still the starting level.
- New game and Help have moved from the menu into Options.

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
