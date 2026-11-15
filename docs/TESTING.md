# Testing the alpha

What testers get with each test version: the **tester guide** (sent as a PDF,
built from this file and `CHANGELOG.md` by `npm run tester-guide`) and a
short **WhatsApp message**. How to play is not here: the app teaches itself
(Help, the first-game tips and the welcome card). This file only says what
is new, what to try, how to report and what the app cannot do yet.

<!-- guide:start -->

# Mah Jong — test version alpha.10

**Play here:** https://int.mah-jong.workers.dev

International mahjong in your browser, against three bots, by the rules of
*The Game of Mah Jong Illustrated*.

## Getting the new version

Open the link (or the app on your home screen) and reload it once. The
small label under the menu, top left, should read **alpha.10**. A game in progress carries on. If an update changes the game, the
hand you were playing starts again with the scores kept.

**New to the app?** On an iPhone open the link in Safari, tap Share, then
*Add to Home Screen*, and play it from the home-screen icon with the phone
turned sideways. Everything else, the app shows you: Options › **Help**.

## New in alpha.10

- **A new hand set, Rare.** In Options › **Rules**, *Hands in play* has a
  fourth step. It leaves out the easy mixed-suit hands that nearly any deal
  is halfway to (Crazy Chows, Three Philosophers, Little Robert, Big Robert
  at half limit), so the rarer hands are worth chasing. 73 hands stay in
  play. It is our own rule, not the book's.
- **Options in three tabs:** *Game*, *Table* and *Rules*. The house rules no
  longer sit below the fold on a landscape phone.
- **Hands in play shows a count,** and its note names only what the chosen
  step adds. *Announce fishing to win* now explains itself.
- **Changes start next hand:** a rule changed mid-hand shows it in the
  header, with an amber light on the Rules tab.
- **The welcome card waits** until the phone is turned sideways, so it no
  longer covers the turn-your-phone screen.

## Fixed thanks to your reports

Thank you for your report. From the last round:

- *"In goulash, the 3 received tiles are not always appearing shaded teal
  color - sometimes 3 tiles, sometimes only 2 tiles."* You were right. All
  three received tiles are now marked, also when one matches a tile you
  passed away.

## What works differently now

- The house rules are in the *Rules* tab of Options; sound and discard
  settings are in *Table*.
- Hands in play can be set to *Rare*.

## What to try, and tell us

- Open **Options** and look through the three tabs. Is everything where you
  expect it? Does the sheet fit your phone?
- Choose **Rare** under Hands in play and play a few hands. Do the rarer
  hands make the game more interesting? Does the note explain it?
- Play a **Goulash** and check that all three tiles you receive are shaded
  teal.
- On a phone, open the link for the first time (or in a private tab): does
  the welcome card appear only once the phone is sideways?
- Anything that broke, looked wrong or surprised you.

## How to report

Open **Options**, tap **Report a problem**, type a line about what you saw
(optional) and tap **Send**. It reaches us at once and shows you a report
number. It holds the version, your device and the moves of the game so far,
and no name or account. Without a connection it offers to share the report
as a message instead.

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

<!-- guide:end -->

## WhatsApp message

<!-- whatsapp:start -->

🀄 **Mah Jong test version alpha.10 is out!**

Play: https://int.mah-jong.workers.dev (reload once to update)

New: Options now has three tabs (Game, Table, Rules), and a new hand set,
*Rare*, drops the easy mixed-suit hands so the rarer ones are worth chasing.
Also: all three Goulash tiles you receive are now marked (thanks for your
report!), and the welcome card waits until your phone is sideways.

I'd love to hear whether the new Options sheet and the Rare set feel right.
The guide is attached. Found something odd? Options › Report a problem.

<!-- whatsapp:end -->
