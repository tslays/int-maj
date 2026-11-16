# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.11

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.11**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.11

- **Up to three photos in a report.** Options › **Report a problem** takes
  up to three photos, for problems that need several screenshots.
- **A "self-draw only" mark on Fishing.** When a Fishing offer can only win
  from the wall (Buried Treasure and its kin), its button carries a navy
  *self-draw only* tab across the top. A mixed offer reads *Some tiles:
  self-draw only*.

## What works differently now

- During a Fishing announcement, the closest-hands panel shows the real
  chance of your next draw, not 0%.
- A report can carry up to three photos. The fallback that shares a report
  as a message still sends the text only.

## What to try, and tell us

- Send a report with two or three photos attached (Options › Report a
  problem). Do they all arrive, and does the sheet stay easy to use?
- Find a Fishing offer that can only be won from the wall, such as Buried
  Treasure. Is the *self-draw only* tab clear before you tap?
- Announce fishing to win, and look at the closest-hands panel. Does it show
  a real chance rather than 0%?
- Anything that broke, looked wrong or surprised you.

## How to report

Open **Options**, tap **Report a problem**, type a line about what you saw
(optional), add up to three photos if they help, and tap **Send**. It
reaches us at once and shows you a report number. It holds the version, your
device and the moves of the game so far, and no name or account. Without a
connection it offers to share the report as a message instead.

## Known limits

- You play against three bots only. No accounts, no multiplayer.
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

🀄 **Mah Jong test version alpha.11 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: a report can now carry up to three photos, for problems that need
several screenshots. A Fishing offer that can only win from the wall says
*self-draw only* on its button, and the closest-hands panel shows real
chances during a Fishing announcement.

The guide is attached. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
