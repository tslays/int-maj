# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the start screen). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->
# Mah Jong — test version alpha.18

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.18**. A game in
progress carries on. If an update changes the game, the hand you were playing
starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.18

- **Reset buttons, and a Support link.** Settings has a Reset settings
  button, and All hands has a Reset filters button. Settings also has a
  quiet *Support int-maj* link: it opens a small sheet with one button to
  Ko-fi, and nothing loads from Ko-fi until you tap it.
- **More guide cards.** The guide now covers Practice, the start screen,
  Play with friends, the hands in play, Table settings and the Goulash.

## Fixed thanks to your reports

Thank you to the testers whose reports these fix:

- Dragonette takes a paired wind or dragon as the spare tile. Alpha.17 said
  this was fixed, but the fix missed that build.

## What works differently now

- Scoring explains itself: the paid line shows what each loser paid, and
  Score opens the breakdown. The last Goulash exchange is labelled.
- Barred hands stay in All hands, marked as barred.
- The game is called int-maj, and its title glints every five seconds.
- Practice's back button is a round chevron.
- In the guide, Next opens the next topic at its top.

## What to try, and tell us

- Finish a hand with a win. Is the paid line right, and does Score show the
  breakdown?
- Play a Goulash to its last exchange. Is it labelled? Does the Goulash bar
  make sense to you?
- Open All hands, set some filters, and tap Reset filters. Do they clear?
- In Settings, tap Reset settings. Then tap Support int-maj: does the sheet
  open, and does Ko-fi load only after you tap?
- Look for a Dragonette whose spare tile is a paired wind. Is a wait or a
  fishing offer given?
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
🀄 **Mah Jong test version alpha.18 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: a Support int-maj link in Settings (Ko-fi, opens only when you tap it), Reset buttons in Settings and All hands, and guide cards for Practice, the start screen and the Goulash. Fixed: Dragonette takes a paired wind as the spare tile, a fix that missed alpha.17.

Thank you to everyone who sent a report. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
