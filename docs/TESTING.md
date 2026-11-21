# Testing the beta

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the start screen). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version beta.1

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

**This is the beta.** The game is feature-complete: from now on we are
looking for bugs and rough edges, not new features. Every report helps.

## Getting the new version

Open the link and reload it once. The small label under the menu, top left,
should read **beta.1**. If an update changes the game, the hand you were
playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. On Android, open the link in Chrome and tap *Install*, or
*Add to Home screen* in the menu. Everything else, the app shows you: Options
› **Help**.

## New in beta.1

- **More tile faces, and a Modern theme.** Settings › Style now offers the
  Riichi, Riichi Dark and Classic Chinese tile faces, and a Modern theme.
- **A landing page** at www.mah-jong.workers.dev, with screenshots and Play
  buttons to this test site.

## What works differently now

- The start screen shows no focus ring until you press a key, so a mouse
  visit no longer draws a blue ring on Continue.
- On Midnight, the large discard card takes the tile front colour, so dark
  faces keep their contrast.

## What to try, and tell us

- Open Settings › Style. Try the new tile faces and the Modern theme. Does
  each change the tiles, and does it stay after you reload?
- Play on Midnight and discard a tile. Does the large discard card read
  clearly?
- Open the start screen with the mouse. Is there no blue ring on Continue
  until you press a key?
- Open www.mah-jong.workers.dev on a phone. Do the screenshots and Play
  buttons work?
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
🀄 **Mah Jong test version beta.1 is out!**

This is the beta: the game is feature-complete, so we want bugs and rough edges now, not new features.

Play: https://int.mah-jong.workers.dev

Reload the link once; the label under the menu should read beta.1. New: Riichi, Riichi Dark and Classic Chinese tile faces in Settings › Style, and a Modern theme. A landing page at www.mah-jong.workers.dev now shows the game with Play buttons. Fixed: the large discard card on Midnight keeps its contrast, and the start screen shows no blue focus ring until you press a key. Thanks for testing. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
