# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.14

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.14**. A game in
progress carries on. If an update changes the game, the hand you were playing
starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.14

Nothing new to play with this time. The changes below fix a counter and add
to what a problem report holds.

## Fixed thanks to your reports

- **The Wall counter counts the last two tiles.** It read 0 while two loose
  tiles were still to be drawn. It now counts them until the hand is drawn.
  Thank you for the report.

## What works differently now

- **Problem reports list your settings.** A report now also lists the
  Settings you have stored on the device, your pinned hands, and the house
  rules chosen for the next deal, marked as in force or waiting for the next
  hand.

## What to try, and tell us

- Near the end of the wall, watch the Wall counter. Does it count the last two
  tiles down to 0, and read 0 only once they have been drawn?
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

🀄 **Mah Jong test version alpha.14 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

Fixed: the Wall counter now counts the last two tiles until the hand is drawn, so it no longer reads 0 while two are still to come. Changed: a problem report also lists your stored settings, pinned hands and house rules. Thank you to the tester whose report found the counter problem!

Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
