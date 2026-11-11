# Testing the alpha

The message to paste to the club, then the known limits. It stands alone.

## Message for the club

> **International mahjong, in your browser, against three bots.**
>
> Play here: https://int.mah-jong.workers.dev
>
> **On an iPhone:** open the link in Safari, tap Share, then Add to Home Screen.
> Open it from the home-screen icon and turn the phone on its side; the table
> is landscape only.
>
> **How it works:** tap a tile in your hand and tap it again to throw it (or
> hold it and swipe up). Claims, kongs, fishing and Mah Jong appear as buttons.
> The Hints panel lists the hands you are closest to; tap a row to see that
> hand. The All hands button above it opens every hand in both books, searchable.
> The menu has New game, Calls, Sort, Hints and Options. Options holds Sound,
> the house rule (which hands are in play), Help and Report. The game
> saves after every move and resumes where you left off. On an iPhone the
> silent switch mutes the game; flip it off (or use the Sound switch in Options).
>
> **What we would like to hear:** Is it clear what to do and whose turn it is?
> Do the buttons and the swipe feel right on your phone? Does any score or
> result surprise you? Do the bots play sensibly? Did anything break or look
> wrong?
>
> **To send a report:** open Options, tap Report, type a line about
> what you saw (optional) and tap Send. It goes straight to us and answers
> with a report number. It holds the build, your device and every move of the
> game so far, and no name or account. Without a connection it offers to
> share the report as a message instead.

## Known limits

- You play against three bots only. No accounts, no multiplayer.
- One house rule, in Options: which hands are in play. All hands (the default),
  Companion hands only (leaves out the three hands only the Illustrated book
  prints), or Companion hands with pictures (also leaves out the nine hands
  the Companion prints without a sample picture). The change applies from the
  next hand. Nothing else can be changed: the rules of play follow the one
  rulebook.
- Where both books print a hand, its tier and score follow the Companion.
  Chinese Odds, Sparrow's Sanctuary, Three Great Scholars, Four Blessings and
  Civil War pay the middle amount (1500), and every double-limit fishing hand
  pays 800.
- Settlement: the engine settles at the intermediate level. The winner is
  paid by all three players, and a player who was fishing (one tile away
  from winning) also gets a settlement. Hands further from winning are not
  scored against each other. This cannot be changed in the app.
- Crazy Chows is a common way for the bots to win.
- There is one link. When a new version is deployed it updates itself, so a
  reload may bring changes.
