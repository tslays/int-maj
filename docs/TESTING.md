# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the start screen). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.17

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.17**. A game in
progress carries on. If an update changes the game, the hand you were playing
starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.17

- **A start screen, and Practice.** Every visit opens a start screen:
  Continue, Play vs bots (with the bot level), Play with friends, Practice,
  and links to the guide, all hands, settings and install. In Practice you
  name the hand, the winning tile and the best aim, and the game grades you.
  Missed hands come back sooner, and a streak builds as you get them right.

## Fixed thanks to your reports

Thank you to the testers whose reports these fix:

- With Sort off, the opening deal is no longer sorted in pieces of four.
- A Goulash no longer lets a chow win, wait or announce fishing in an
  Ordinary or Purity hand.
- After a win with a claimed chow, the result sheet shows the full hand.

## What works differently now

- Every visit opens the start screen. Options › **Main menu** brings it back.
- The turn pill sits under the round badge.

## What to try, and tell us

- Tap **Practice** and name a few hands. Does the grading match the hand you
  see? Does the streak count right?
- Start a Goulash and look for a chow in an Ordinary or Purity hand. Is it
  barred? After a win with a claimed chow, is every tile on the result sheet?
- With Sort off, deal a hand. Is the first deal in the table's order?
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
🀄 **Mah Jong test version alpha.17 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: a start screen, and Practice to name hands, winning tiles and best aims. Fixed: a Goulash no longer lets a chow win in an Ordinary or Purity hand, the result sheet shows the full hand after a chow win, and with Sort off the opening deal stays in table order.

Thank you to everyone who sent a report. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
