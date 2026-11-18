# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.15

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.15**. A game in
progress carries on. If an update changes the game, the hand you were playing
starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.15

- **A Goulash is marked on the table.** The round badge and the table
  console both read GOULASH, and when half-limit hands are barred they add
  NO HALF LIMIT.
- **The result card breaks the score down.** Under Score, each ground item
  and the double are listed, with notes on rounding and on how the losers
  settle.

## Fixed thanks to your reports

- **Sort stays as you set it.** It holds across hands and games, it no longer
  turns itself back on in a new game, and on a Goulash hand it no longer
  sorts on the first tile drawn. Thank you for the report.
- **A Goulash tile no longer stays raised.** The copy you pick for a pass or
  a throw is the one that leaves your hand, and the raised tile comes down
  once no exchange is offered. Thank you for the reports.
- **Hints say when a nearer hand is out of reach.** The closest-hands entry
  names the scoring it is for, and a nearer version you cannot play: a
  half-limit scoring barred in a Goulash, or a tile with every copy in sight.
  Thank you for the reports.
- **The score breakdown you asked for** is on the result card (see New
  above). Thank you for the report.

## What works differently now

- **Sort is a setting that holds.** Turn it off and it stays off, across hands
  and games, until you turn it on again.
- **The home-screen name is int-maj** on the tester site (int-dev on the dev
  site).

## What to try, and tell us

- On a Goulash hand, look at the round badge and the table console. Both
  should read GOULASH, with NO HALF LIMIT when half-limit hands are barred.
- Turn Sort off, start a new game, and check that it stays off.
- After a win, open the result card and tap Score. Do the items add up to the
  total?
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
🀄 **Mah Jong test version alpha.15 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: a Goulash is marked on the round badge and the table console, and the result card breaks the score down. Fixed: Sort stays as you set it, a Goulash tile no longer stays raised, and hints say when a nearer hand is out of reach. Thank you to the testers whose reports made these fixes!

Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
