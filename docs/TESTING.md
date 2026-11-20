# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the start screen). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.20

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

**This version has a new icon, so delete the app from your home screen and
add it again.** The icon on your home screen keeps the logo it was made with,
so the new one only appears once you add the app again. Press and hold its
icon, choose to remove or delete the app, then add it again as described
below. A game in progress may not survive the delete, so finish it first if
you can.

This is the new icon, a gold *i* on dark teal. When it is on your home screen,
the update has worked:

![The new int-maj icon: a gold italic i on dark teal](../app/assets/icons/icon-512.png)

Then open the link and reload it once. The small label under the menu, top
left, should read **alpha.20**. If an update changes the game, the hand you
were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. On Android, open the link in Chrome and tap *Install*, or
*Add to Home screen* in the menu. Everything else, the app shows you: Options
› **Help**.

## New in alpha.20

- **Play from the keyboard.** On a computer, ← and → lift a tile and Enter
  throws it. ↑ moves up to the buttons (Pung, Chow, Mah Jong...), ← → choose
  one and Enter presses it. Esc passes. The keys are listed in a *With a
  keyboard* card in the guide's Your turn tab.
- **A new icon.** The title's italic *i*, gold on felt teal, its dot a mahjong
  tile. Delete the app and add it again to see it (above). Alpha.19 was not
  sent to testers, so this is its first announcement.

## What works differently now

- The title screen uses the same font as the icon, so the two match.
- The licence sheet on the start screen says *all rights reserved*, not MIT.

## What to try, and tell us

- Delete the app from your home screen and add it again. Does the icon match
  the picture above?
- Open the app. Does the title look like the icon's *i*, in the same font?
- On a computer, play a few turns with the keyboard only. Do ← and → lift a
  tile, does Enter throw it, and does Esc pass?
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
🀄 **Mah Jong test version alpha.20 is out!**

Play: https://int.mah-jong.workers.dev

**New icon: delete the app from your home screen and add it again.** The new icon is the picture sent with this message: a gold *i* on dark teal. When it is on your home screen, the update has worked. A game in progress may not survive the delete, so finish it first if you can.

This one also carries alpha.19, which we skipped on WhatsApp: the title uses the icon's font, so the two match. New on a computer: the arrow keys lift and throw a tile, and Esc passes. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
