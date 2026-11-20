# What changed in each test version

Newest first. Written for players: what you will see, what was fixed, and
what now works differently. Each version is a tag (`v0.1.0-alpha.N`, then `-beta.N`, `-rc.N`, and finally `v0.1.0`) on `main`;
testers get it at https://int.mah-jong.workers.dev.

## alpha.20

**New**

- **Play from the keyboard.** On a computer, ← and → lift a tile and Enter throws it. ↑ moves up to the buttons (Pung, Chow, Mah Jong...), ← → choose one and Enter presses it; when a discard is offered the buttons are chosen already. Esc passes. Nothing on the table shows the keys: a new *With a keyboard* card in the guide's Your turn tab lists them, and a tip mentions it once, after your first throw. (#255)
- **A new app icon.** The title's italic *i*, gold on felt teal, its dot a mahjong tile. To see it on your home screen, delete the app and add it again. Alpha.19 was not sent to testers, so this is its first announcement. (#251)

**Changed**

- **The title uses the icon's font,** so the icon and the title match on every device. (#251)
- **The licence is all rights reserved, not MIT.** The start screen's licence sheet says so. (#257)

## alpha.19 (20 November 2026)

**New**

- **A new app icon.** The title's italic *i*, gold on felt teal, its dot a mahjong tile. To see it on your home screen, delete the app and add it again. (#251)

**Changed**

- **The title uses the icon's font,** so the icon and the title match on every device. (#251)

## alpha.18 (20 November 2026)

**New**

- **Support int-maj.** Settings has a quiet *Support int-maj* link. It opens a small sheet with one button to Ko-fi, so Apple Pay and PayNow work; nothing loads from Ko-fi until you tap it. (#243)
- **Reset buttons.** Settings has a Reset settings button, and All hands has a Reset filters button. (#237, #241)
- **Guide cards for more features.** The guide now covers Practice, the start screen, Play with friends, the hands in play, Table settings and the Goulash. (#239)

**Changed**

- **Scoring is explained where you look.** The paid line shows what each loser paid, and Score opens the breakdown. Barred hands stay in All hands, marked. The last Goulash exchange is labelled, and each house-rule subtitle says what its rule does. (#249)
- **The game is called int-maj, and its title glints every five seconds.** (#242)
- **Settings has a cleaner footer.** (#237)
- **Practice's back button is a round chevron** in place of the text link. (pushed directly, no PR)
- **In the guide, Next opens the next topic at its top,** and Closest hands is four short cards instead of one long paragraph. (#240, #239)

**Fixed**

- **Dragonette takes a paired wind or dragon as the spare tile.** Alpha.17 listed this as fixed, but the fix missed that build. (#244 → #248)

## alpha.17 (19 November 2026)

**New**

- **Start screen and Practice.** Every visit opens a start screen: Continue, Play vs bots (with the bot level), Play with friends, Practice, and links to the guide, all hands, settings and install. Practice asks you to name the hand, the winning tile and the best aim, and grades you with the game's own check, with a grouped reveal, a streak, and missed hands coming back sooner. (#234)

**Changed**

- **The turn pill sits under the round badge.** (#229)

**Fixed**

- **Dragonette takes a paired wind.** The book prints the spare tile as "Any Wind or Dragon paired"; a paired wind was refused, so no wait or fishing announcement was offered. (#244)
- **With Sort off, the opening deal keeps its order.** It was sorted in pieces of four; now it stays in table order. (#230 → #231)
- **A Goulash bars a chow in Ordinary and Purity.** A chow can no longer make a win, wait or fishing announcement there, and a chow claimed to win follows the fish rule. (#233 → #235)
- **The result sheet shows the full hand.** A win with a claimed chow keeps every tile on the sheet. (#232 → #235)

**What works differently now**

- **Every visit opens the start screen.** Options › Main menu brings it back.

## alpha.16 (18 November 2026)

**New**

- **Play with friends.** Options › Play with friends: create a room, or join one by its code or link, deal, and fill any empty seats with bots. A turn timer (15, 30 or 60 seconds, or off) sits in a pill on the table. The game reconnects when your phone wakes, and an empty room stops and expires on its own. (#225, #226, #227)

**Changed**

- **Chance bands are re-cut.** Most hands in the panel are small chances, and *Long shot* used to cover everything under 20 %. The five bands are now *Likely* (half or better), *Possible*, *Unlikely*, *Long shot* and the new lowest, *Remote* (under 1 in 50); *Very likely* is gone. The hand's sheet says what the band means in plain odds. (#223)
- **A tile you need several copies of is shown as a small fan.** Three White Dragons overlap over one count of the copies still unseen, so "three of these four" is plain at a glance. (#223)

## alpha.15 (18 November 2026)

**New**

- **A Goulash is marked on the table.** The round badge and the table console both read GOULASH, and when half-limit hands are barred they add NO HALF LIMIT. (#214 → #220, #221)
- **The result card breaks the score down.** Under Score, each ground item and the double are listed, with notes on rounding and on how the losers settle. (#212 → #217)

**Changed**

- **The home-screen name matches the site.** On the tester site the app is int-maj on the home screen; on the dev site it is int-dev. (#215)

**Fixed**

- **Sort stays as you set it.** It is now a setting that holds across hands and games. With Sort off the game never re-orders your hand, it no longer turns itself back on in a new game, and on a Goulash hand it no longer sorts on the first tile drawn. (#213 → #218)
- **A Goulash tile no longer stays raised.** In a Goulash, the copy you pick for a pass or a throw is the one that leaves your hand, not the first of that face, and the raised tile comes down once no exchange is offered. (#210, #214 → #218)
- **Hints say when a nearer hand is out of reach.** The closest-hands entry names the scoring it is for and a nearer version you cannot play: a half-limit scoring barred in a Goulash, or a tile with every copy in sight. The hand sheet drops barred scorings and explains both. (#209, #211 → #219)
- **Win-line wording.** The hand is spelt CHOW MEIN, and your own discard reads "on your discard", not "on You's discard". (#208)

## alpha.14 (17 November 2026)

**Changed**

- **Problem reports list your settings.** A report now also lists the Settings you have stored on the device, your pinned hands, and the house rules chosen for the next deal, marked as in force or waiting for the next hand. (#206)

**Fixed**

- **The Wall counter counts the last two tiles.** It read 0 while two loose tiles were still to be drawn. It now counts them until the hand is drawn. (#204 → #205)

## alpha.13 (17 November 2026)

**New**

- **The hand sheet explains its pills.** Tap *New*, *chance*, *Self-drawn* or
  *Pays* on a hand's sheet and a short note opens, one at a time. Tiles with
  alternatives sit together in a capsule, and the panel row shows Self-drawn.

**Changed**

- **All hands leaves out half-limit hands in a Goulash.** With the half-limit
  rule on, the All hands index in a Goulash round leaves out the half-limit
  hands, as the hints already did, so the two agree. A hand stays listed if
  any of its scorings is above half limit. Normal rounds are unchanged. (#201)
- **Problem reports say whether a hand was a Goulash.** The report header now
  notes whether the hand was a Goulash and whether half-limit hands were
  barred in it. (#201)

**Fixed**

- **Raised tiles no longer flicker.** Moving the pointer from a lifted tile
  down into the gap beneath it dropped the tile and lifted it again. The gap
  now counts as part of the tile. (#197)

## alpha.12 (16 November 2026)

**New**

- **Hint style.** Options › Game › Hint style chooses how the closest-hands
  panel picks its hands: *Likeliest*, *Mixed* (the default: the two likeliest
  plus one idea) or *Discovery* (hands you have not met yet). An idea carries
  a small spark, and ideas rotate from hand to hand rather than repeating.
  (#194, #195)
- **Winning hands shown in the book's own groups.** A special hand's winning
  tiles now appear grouped as the book prints them (Wriggly Snake, Gates of
  Heaven, Windfall, Dragon's Breath, Dragonette and about twenty more), not
  as one lump or split into the wrong sets. (#187)

**Changed**

- **Closest hands say the chance is a building chance.** The ring shows how
  likely your tiles are to build a hand by the end of the wall, not to win
  with it; the Guide, the hand sheet and the screen reader now say so, and
  invite you to try hands you would not normally play. (#183)
- Triple Knitting and Mixed Pung show their winning tiles grouped by their
  own sets. (#184 → #186)

**Fixed**

- **Knitting no longer looks far closer than it is.** The hints counted
  pairs across three suits as Knitting, so it showed 90% on an ordinary
  opening hand. It now needs the same two suits throughout, and Triple
  Knitting needs four different sets. (#191 → #192)

**What works differently now**

- Closest hands in Mixed style show one idea beside the likeliest two. Choose
  *Likeliest* in Options › Game to see only the likeliest hands, as before.
  The device remembers which ideas you have met, and halves that memory with
  every new game.

## alpha.11 (16 November 2026)

**New**

- **Up to three photos in a problem report.** Options › Report a problem
  now takes up to three photos (it took one), for problems that need several
  screenshots. (#176)

**Changed**

- **A Fishing offer that can only win from the wall says so.** Buried
  Treasure and its kin now read *self-draw only* on a navy tab across the top
  of the Fishing button, so nobody fishes for them by accident. A mixed offer
  reads *Some tiles: self-draw only*. (#181)

**Fixed**

- **Closest hands show the real chance during a Fishing announcement.** They
  showed 0% while you were offered the announcement; they now show the chance
  of your next draw. (#178)

**What works differently now**

- A report can carry up to three photos. The fallback that shares a report
  as a message still sends the text only.

## alpha.10 (15 November 2026)

**New**

- **A fourth step for Hands in play: Rare.** It leaves out the easy
  mixed-suit hands that nearly any deal is halfway to (Crazy Chows, Three
  Philosophers, Little Robert and Big Robert at half limit), so the rarer
  hands are worth chasing. 73 hands stay in play. It is our own rule, not
  the book's, and the Options sheet says so. (#166, #167)

**Changed**

- **Options is now three tabs:** *Game* (bot level, pace, table animations),
  *Table* (sound, large discards, discards) and *Rules* (house rules). The
  house rules no longer sit below the fold on a landscape phone. New game,
  Help and Report stay under every tab. (#167)
- **Hands in play shows a count** ("73 of 88 hands") and a note naming only
  what the chosen step adds. *Announce fishing to win* now explains itself:
  you go out only after announcing you need one tile. (#167)
- A rule changed in the middle of a hand shows *Changes start next hand* in
  the header, with an amber light on the Rules tab. It now covers all three
  house rules, not only the hand set. (#167)

**Fixed**

- **A Goulash exchange marks all three tiles you received** (from your
  report): sometimes only two were shaded teal, when a received tile matched
  one you had passed away. (#163 → #164)
- **The welcome card waits until the phone is turned sideways.** On a first
  visit it covered the turn-your-phone screen and its install steps. It
  steps aside again if you turn the phone back upright. (#168)

**What works differently now**

- The house rules are in the Options sheet's *Rules* tab; sound and discard
  settings are in *Table*.
- Hands in play can be set to *Rare*.

## alpha.9 (15 November 2026)

**New**

- **Closest hands show how likely each hand is**, not how many tiles are
  missing. Each hand in the panel leads with a ring: how far it is filled
  and how bright it is says how likely you are to complete that hand before
  the wall runs out, from *Long shot* through *Unlikely*, *Possible* and
  *Likely* to *Very likely*. It is worked out only from the tiles you can
  see. A small arrow marks a hand that moved a band since your last move.
  It is a guide, not advice: a long shot at a big hand can be a fair play.
  The hand's sheet names the band and shows how many copies of each tile you
  need are still unseen, and in the index of all hands *Order › Likeliest
  for my tiles* sorts by it. (#156)

**Changed**

- **Claim buttons step aside in the top-down view** of the discards, so the
  whole table shows. Pass and Mah Jong stay; the others return when you go
  back to the table. (#157)
- **Big Robert's card shows both values in its corner** ("500/1,000", lowest
  first) instead of a line per scoring; its sheet still lists each scoring
  and when it applies. (#155)

**Fixed**

- **The result card shows a winning hand's real groups** (from your report):
  a mixed chow, as in Crazy Chows or Three Philosophers, stays together and
  reads 2-3-4 instead of falling apart by suit. (#159 → #160)
- **A long row of tiles stays inside the result card** on a phone: a hand
  with no melds, such as Seven Twins, no longer ran over the score column.
  (#158)
- Cards in the index of all hands are no longer clipped on a narrow phone.
  (#155)

**What works differently now**

- The closest-hands panel no longer counts tiles to go; it shows how likely
  each hand is.
- The index of all hands can be sorted by that likelihood.

## alpha.8 (14 November 2026)

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
