# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.16

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.16**. A game in
progress carries on. If an update changes the game, the hand you were playing
starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.16

- **Play with friends.** Options › **Play with friends**: create a room, or
  join one by its code or link, deal, and fill any empty seats with bots. A
  turn timer (15, 30 or 60 seconds, or off) sits in a pill on the table. The
  game reconnects when your phone wakes, and an empty room stops and expires
  on its own.

## What works differently now

- **The odds bands are re-cut.** *Very likely* is gone, and the new lowest
  band, *Remote* (under 1 in 50), sits under *Long shot*. The hand's sheet
  says what the band means in plain odds.
- **A tile you need several times** shows as a small fan of overlapping chips
  over one count of the copies still unseen, so "three of these four" is
  plain at a glance.

## What to try, and tell us

- Open Options › **Play with friends**, start a room, and send the code or
  link to a friend, or open it on a second phone or browser. Deal a hand. Does
  the table stay in step on both? Does it pick up again after the phone has
  been asleep?
- Find a hand with a tile you need several times and look at the fan of
  chips. Does the band in the chance note make sense for what is still unseen?
- Anything that broke, looked wrong or surprised you.

## How to report

Open **Options**, tap **Report a problem**, type a line about what you saw
(optional), add up to three photos if they help, and tap **Send**. It
reaches us at once and shows you a report number. It holds the version, your
device and the moves of the game so far, and no name or account. Without a
connection it offers to share the report as a message instead.

## Known limits

- You play against three bots, or with friends in a room (Play with friends).
  No accounts. Empty seats in a room are filled by bots.
- House rules, in Options › Rules: which hands are in play (all hands, the
  Companion's only, the Companion's with a picture, or the rare ones only),
  *No half-limit hands in a Goulash* (on), and *Announce fishing to win*
  (off). A change applies from the next hand. Everything else follows the
  rulebook.
- Where both books print a hand, its tier and score follow the Companion.
- Scores are settled at the book's intermediate level: the winner is paid by
  all three players, and a player who announced fishing also scores. Other
  losing hands are not scored against each other.
- Crazy Chows is a common way for the bots to win, unless you play Rare.
- Closest hands are ranked by chance, so a hand that can only be won from the
  wall, such as Seven Twins, can drop out of the top three.

<!-- guide:end -->

## WhatsApp message

<!-- whatsapp:start -->
🀄 **Mah Jong test version alpha.16 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: play with friends. Options › Play with friends makes a room you join by code or link, with bots in any empty seats. Changed: the odds bands on the hand sheet are re-cut, with a new Remote band for the longest shots.

Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
