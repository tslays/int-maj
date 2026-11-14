# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.8

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.8**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.8

- **Counter sticks fly across the table** when a hand is paid: coloured
  sticks thrown from each payer to the winner, landing with a wooden click
  while the scores count up. A tap skips them.
- **The Fishing button names the hand** you are fishing for. Tiles that win
  only on your own draw are faded and marked *own draw only*.
- **Clearer hints:** the hand sheet says when you need *one more* of a tile
  you already hold, and which other tile would do instead.
- **Bigger melds:** your own claimed sets get a second and third row instead
  of shrinking.
- **Scoring checked line by line against the book.** Some ordinary hands
  now score differently (see below).
- **Big Robert** is one card in the index of all hands, with both scorings.
- A quieter **Goulash banner**; the explanation is in the first-game tip.

## Fixed thanks to your reports

Thank you for your report. From the last round:

- *"I should have got Mah Jong for Grand Sequence."* You were right. The two
  extra tiles of Grand Sequence pair with tiles of the run, as the book's
  picture shows, not a separate pair of any suit. That hand now wins, the
  hints count it correctly, and the Fishing button says when a tile only
  wins on your own draw.

## What works differently now

- **Ordinary-hand scores:** a pung completed by a discard counts as exposed;
  no double counts twice; East's first discard, the only-possible chow and
  robbing a kong now earn their bonus; if your tiles can be read more than
  one way, the best reading is paid.
- **Grand Sequence** is easier to complete than before.
- Options › *Dice and dealing* is now **Table animations**; Skip also skips
  the counter sticks.

## What to try, and tell us

- Win a few hands and watch the **counter sticks**. Fun, or too long?
  Can you follow who paid whom?
- When you are offered **Fishing**, does the button make clear which hand
  and which tiles?
- Check a few **scores** on the result card. Anything that looks wrong
  against your own reckoning, please report it.
- Claim three or four sets: do your **melds** stay easy to read?
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

🀄 **Mah Jong test version alpha.8 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: counter sticks fly across the table when a hand is paid, the Fishing
button names your hand, clearer hints, bigger melds, and scoring checked
line by line against the book. Grand Sequence now wins as it should, thanks
to your report!

What's new, what we fixed and what to try is in the attached guide. Found
something odd? Options › Report a problem.

<!-- whatsapp:end -->
