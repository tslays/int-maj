# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.13

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.13**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.13

- **The hand sheet explains its pills.** Tap **New**, **chance**,
  **Self-drawn** or **Pays** on a hand's sheet and a short note opens, one at
  a time. Tiles with alternatives sit together in a capsule, and the panel
  row shows Self-drawn.

## What works differently now

- **Raised tiles hold still.** Moving the pointer from a lifted tile down into
  the gap beneath it no longer drops the tile and lifts it again.

## What to try, and tell us

- Open a hand's sheet from the closest-hands panel and tap each pill (New,
  chance, Self-drawn, Pays). Does each note explain itself, and does opening
  one close the one before?
- Does the hand sheet of a hand you have not met show a spark and **New**
  beside its Concealed or Exposed chip?
- Move the pointer over a raised tile, then down into the gap beneath it.
  Does the tile stay up?
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

🀄 **Mah Jong test version alpha.13 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: the hand sheet now explains its New, chance, Self-drawn and Pays pills,
one note at a time. Also fixed: a raised tile no longer drops and lifts again
when the pointer moves down into the gap beneath it.

Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
