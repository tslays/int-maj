# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.7

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.7**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: tap **Help**.

## New in alpha.7

- **Discards in a pile, like a real table.** Options › Discards › *Pile*.
  Every discard slides into one heap in the middle; nobody can see who threw
  what. Each player's wind and score sit at their edge of the table.
- **See who is fishing:** a small fish beside the player's wind.
- **Goulash:** drag to arrange your hand while you pass, and the tiles you
  just received are marked in teal.
- **Two new house rules:** *No half-limit hands in a Goulash* (on) and
  *Announce fishing to win* (off).
- **Calmer Large discards** on phones: only the tile just thrown is shown
  large, and your own throw clears it.
- **Harder Hard bots.**
- **New flower and season tiles:** big pictures you can recognise.
- **Help as a visual guide,** tips in your first game, and a redesigned
  Options sheet with New game inside it.

## Fixed thanks to your reports

Thank you to everyone who sent a report. From the last round:

- *"Discards organised in front of each player give away too much."* You can
  now play with one shared pile in the middle (Options › Discards).
- *"Flower tiles: make the numbers bigger and the pictures recognisable."*
  The flowers and seasons are now big pictures with the number in the corner.
- *"Hard feels too easy."* We measured it: a lucky deal is normal, about
  one game in three starts three tiles or fewer from Mah Jong. But Hard was
  too slow; it now races to go out and is clearly stronger.
- *"Goulash: let me rearrange during the passes, show what I received, and
  no half-limit hands."* All three are in.
- *"I won without declaring fishing" and "show who is fishing."* Neither
  book asks for an announcement to win, so by default you still don't need
  one; a table that wants it can turn on *Announce fishing to win*. Players
  who announce now show a fish.

## What works differently now

- In a **Goulash**, a hand worth half the limit no longer wins, unless you
  turn the rule off in Options. If the tiles also make another hand, they
  score as that one.
- **Hard** is noticeably tougher. Medium is still where you start.
- **New game** has moved from the menu into Options.

## What to try, and tell us

- Play a few hands with **Discards: Pile**. Does the pile feel like a real
  table? Can you still follow the game?
- If a hand is drawn, try the **Goulash** passes: arranging, the teal tiles,
  and whether the half-limit rule feels right.
- Try **Hard**. Too hard now, or just right?
- On a phone: is the single **large discard** easier to follow than the
  whole round was?
- Do you recognise every **flower and season** tile at a glance?
- Anything that broke, looked wrong or surprised you.

## How to report

Open **Options**, tap **Report a problem**, type a line about what you saw
(optional) and tap **Send**. It reaches us at once and shows you a report
number. It holds the version, your device and the moves of the game so far,
and no name or account. Without a connection it offers to share the report
as a message instead.

## Known limits

- You play against three bots only. No accounts, no multiplayer.
- House rules, in Options: which hands are in play (all hands, the
  Companion's only, or the Companion's with a picture), *No half-limit hands
  in a Goulash* (on), and *Announce fishing to win* (off). A change applies
  from the next hand. Everything else follows the rulebook.
- Where both books print a hand, its tier and score follow the Companion.
- Scores are settled at the book's intermediate level: the winner is paid by
  all three players, and a player who announced fishing also scores. Other
  losing hands are not scored against each other.
- Crazy Chows is a common way for the bots to win.

<!-- guide:end -->

## WhatsApp message

<!-- whatsapp:start -->

🀄 **Mah Jong test version alpha.7 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: discards in one shared pile like a real table (Options › Discards ›
Pile), a fish shows who is fishing, Goulash arranging with your received
tiles marked, two new house rules, tougher Hard bots and new flower and
season tiles. Thank you for your reports, most of this came from them!

What's new, what we fixed and what to try is in the attached guide. Found
something odd? Options › Report a problem.

<!-- whatsapp:end -->
