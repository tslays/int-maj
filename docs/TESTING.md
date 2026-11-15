# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.9

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.9**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.9

- **Closest hands show how likely each hand is,** not how many tiles are
  missing. A ring fills and brightens from *Long shot* to *Very likely*,
  worked out only from the tiles you can see. A small arrow marks a hand
  that moved since your last move. It is a guide, not advice: a long shot at
  a big hand can still be worth playing.
- **Tap a hand** to see its band named and how many copies of each tile you
  need are still unseen. In **All hands**, *Order › Likeliest for my tiles*
  sorts by it.
- **The result card shows a winning hand's real groups:** a mixed chow
  stays together and reads 2-3-4.
- **Cleaner screens on a phone:** the claim buttons step aside in the
  top-down view of the discards, and a long row of tiles stays inside the
  result card.
- **Big Robert's card** shows both values in its corner, like "500/1,000".

## Fixed thanks to your reports

Thank you for your report. From the last round:

- *"For recent wins with mixed chows (Crazy Chows, Three Philosophers) the
  winning hand shows the tiles sorted by suit. It doesn't show the mixed
  chows."* You were right. The result card now shows each group of the hand
  together, so a mixed chow reads 2-3-4.

## What works differently now

- The hints panel no longer counts tiles to go; it shows how likely each
  hand is.
- The index of all hands can be sorted by that likelihood.

## What to try, and tell us

- Look at the **rings** in Closest hands. Is it clear what they mean? Does
  the likelihood match how your hand feels as you play? Does it help you
  choose what to throw?
- Open a hand's sheet and the **All hands** index: is the *Order* choice
  useful?
- Win with a mixed chow (Crazy Chows, Three Philosophers) and check the
  **result card** reads right.
- Look at the discards from above: do you miss the claim buttons there?
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

🀄 **Mah Jong test version alpha.9 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: the Closest hands panel now shows how *likely* each hand is (a ring
from "Long shot" to "Very likely") instead of counting tiles. Also: the result
card shows winning hands in their real groups, so mixed chows read right
(thanks for your report!), and a few cleaner screens on phones.

I'd love to hear whether the new rings make sense and help you choose. The
guide is attached. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
