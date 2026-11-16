# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.12

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.12**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.12

- **Hint style.** Options › **Game** › **Hint style** chooses how the
  closest-hands panel picks its hands. **Mixed** (the default) shows the two
  likeliest plus one *idea*, marked with a small spark: a hand you may not
  have tried. **Discovery** favours ideas; **Likeliest** shows only the
  likeliest hands. Ideas rotate from hand to hand.
- **Winning hands in the book's own groups.** A special hand's winning tiles
  now appear grouped as the book prints them, for about twenty-five hands
  (Wriggly Snake, Gates of Heaven, Windfall, Dragon's Breath and more).
- **A chance to build, not to win.** The Guide, the hand sheet and the screen
  reader now say that the ring is the chance your tiles build the hand by the
  end of the wall, and invite you to try hands you would not normally play.

## Fixed thanks to your reports

- **Knitting looked far too likely.** The hints counted pairs across three
  suits as Knitting, so it read about 90% on an ordinary hand. It now needs
  the same two suits throughout.

## What works differently now

- Closest hands in Mixed style show one idea beside the likeliest two. Pick
  *Likeliest* in Options › Game for the old panel. The device remembers which
  ideas you have met, so they rotate.

## What to try, and tell us

- Open Options › Game and try each Hint style. Does the panel change at once,
  and is the spark on an idea easy to read?
- Play a few hands in Mixed. Do the ideas rotate, or do the same ones keep
  coming back? Are they worth trying?
- Look at the winning hand of a special hand such as Wriggly Snake or Gates
  of Heaven. Are its tiles grouped as the book shows?
- Does Knitting stay low unless your hand really leans on two suits?
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

🀄 **Mah Jong test version alpha.12 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: a Hint style option (Options › Game) so the closest-hands panel can
suggest hands you have not tried yet, special hands shown in the book's own
groups, and a fix for Knitting looking far too likely. The ring now says it
is a chance to build a hand, not to win.

Thank you for the Knitting report. The guide is attached. Found something
odd? Options › Report a problem.

<!-- whatsapp:end -->
