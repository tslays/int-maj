# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the start screen). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.21

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link and reload it once. The small label under the menu, top left,
should read **alpha.21**. If an update changes the game, the hand you were
playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. On Android, open the link in Chrome and tap *Install*, or
*Add to Home screen* in the menu. Everything else, the app shows you: Options
› **Help**.

## New in alpha.21

- **A Style tab in Settings.** Choose the table's felt, the tile backs and
  fronts, the room, the button colours and whole themes.
- **A tile numbers setting.** Show or hide the small numbers on the tiles.
  Received Goulash tiles also get a slim edge ring, so you can tell them apart.
- **Fish marks.** With Hints on, a small fish sits above each hand tile whose
  throw would leave you fishing. Lift it to see which hand you would be
  fishing for. If a throw leaves a shown fish waiting on nothing, it comes
  down with a *Fish down* call-out.
- **The hand sheet lists every tile that completes an Ordinary hand,** so you
  can see all the winning tiles at once.

## Fixed thanks to your reports

- **Sort no longer switches itself off without a word.** Dragging a tile past
  a neighbour turned Sort off silently. Now a note appears just above your
  hand, and on a phone a finger needs a wider sideways drag before it counts
  as arranging. (Thanks to the report from an iPhone.)
- **The hand sheet** now lists every tile that completes an Ordinary hand.
  (Thanks to the report about fishing with three different winning tiles.)

## What works differently now

- Settings has a More tab in place of the footer, and the reset works the
  same on every tab.
- Dragging a tile: the row makes way, and the tile you carry stays in front.
  A hover no longer stops a tile sliding into its place.
- The licence and credits are pages in the app, with no links out to GitHub.

## What to try, and tell us

- Open Settings › Style. Does each choice change the table, the tiles and
  the buttons, and does it stay after you reload?
- Turn Hints on and play a few turns. Do the small fish appear above the
  tiles that would leave you fishing? Does lifting one name the hand?
- Drag a tile past a neighbour with Sort on. Does the note above your hand
  say so? On a phone, does a sideways drag with a finger feel right?
- Anything that broke, looked wrong or surprised you.

## How to report

Open **Settings**, then **More**, tap **Report a problem**, type a line about what you saw
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
🀄 **Mah Jong test version alpha.21 is out!**

Play: https://int.mah-jong.workers.dev

Reload the link once; the label under the menu should read alpha.21. New: a Style tab in Settings (felts, tile backs and fronts, room, button colours, whole themes), a tile numbers setting, and fish marks above the tiles that would leave you fishing when Hints are on. Sort no longer turns itself off without a word, and the hand sheet lists every tile that completes an Ordinary hand. Thank you to everyone who sent a report. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
