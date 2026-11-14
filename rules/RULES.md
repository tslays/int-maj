# Rules of play — the framework

This is the single normative ruleset for this project. Every rule the engine
must follow is here, once, with its source. Where this document and a code path,
a test, an old note or a previous owner decision disagree, this document wins
and the code changes.

## Sources and provenance tags

| Tag | Meaning |
|---|---|
| `[I p.N]` | Transcribed from *The Game of Mah Jong Illustrated* — primary and normative. Page numbers are the book's **printed** pages; the render is `rules/pages/illustrated/pNN.jpg` (each render is a two-page spread, printed `2NN-2` and `2NN-1`). |
| `[C p.N]` | From *The Mah Jong Player's Companion* — a supplement that extends this framework where the primary book is silent, and that governs the special-hand catalogue wherever both books print a hand (owner ruling, 2026-11-11). It never overrides an `[I]` rule of play. |
| `[A]` | A recorded assumption for a question both books leave open; the reasoning is in `rules/archive/ASSUMPTIONS.md`. |

Quoted sentences are printed wording, copied from the render. Text without
quotes is still a page-cited reading of that page. Nothing here comes from OCR,
from another mahjong variant, or from the old catalogue's habits.

## How the two books combine

1. The Illustrated book states the game: set, seating, wall, deal, turns,
   claims, bonuses, kongs, winning, ground score and doubling, payments,
   penalties, goulash, and the special hands it illustrates.
2. The Companion extends it: the enlarged special-hand catalogue, the
   half/limit/**middle**/double tier ladder, and the fishing figures for each
   tier. Those extensions stand because the primary book does not contradict
   them.
3. Where both speak and disagree, the Illustrated reading replaces the
   Companion's — **except for the special-hand catalogue** (which hands exist,
   their composition, tier and fishing figure), where the owner ruled on
   2026-11-11 that the Companion governs wherever both books print the hand
   (Part III §1). The rules of play, ground score, doubles, payments and
   penalties stay the Illustrated book's. The superseded readings are
   recorded in `rules/AUDIT.md`.
4. Where both are silent, the narrowest literal reading is chosen and recorded
   as `[A]` in `rules/archive/ASSUMPTIONS.md`.

## Status

- **Part I — general play:** audited against the primary scan (Milestone A).
- **Part II — special hands and their scores:** audited against the primary
  scan (Milestone B); the catalogue is in Part II below.
- **Part III — Companion extensions:** written from the Companion (Part III);
  only additions, with the superseded readings listed in `rules/AUDIT.md`.

The engine does not yet follow this framework: `rules/AUDIT.md` lists each
conflict with the code and is the work list for Milestone C. Do not describe
the current runtime as rules-accurate.

---

# Part I — general play

### A. The set

**R-001** `[I p. 6, p. 62]` — A full set is 144 tiles plus four plain replacements.
> "A full set comprises 108 suit tiles, 16 wind tiles, 12 dragon tiles, four
> flower tiles, and four season tiles, a total of 144, not counting the plain
> tiles."

The p. 62 summary prints the same total with the closing line "8 Seasons (8)".
The arithmetic requires four flowers plus four seasons, which is what p. 6 and
p. 9 print; the literal p. 62 line is recorded under **Source ambiguities**.

**R-002** `[I p. 6]` — The set falls into three categories, and terminals count as
honours.
> "1. Suit tiles—Bamboos, Circles and Characters"
> "2. Honour tiles—Winds, Dragons, and 1s and 9s of each suit."
> "3. Flower and Season tiles—These tiles play no active part in the game, but
> do affect the final score."

A hand's "suit" always means category 1: Bamboo, Circles or Characters. Winds
and Dragons are honours, never a suit, so "in any suit" does not reach them;
where a hand may take an honour the book says so ("Pair Winds OR Dragons",
"with Winds, Dragons or both").

**R-003** `[I p. 6]` — Each suit runs 1-9 with four copies of each number.
> "Each suit is numbered from 1 to 9 inclusive, and there are four tiles for
> each number (36 × 3 suits = 108 tiles)."

**R-004** `[I p. 6]` — Terminals are worth more than 2-8 and are honours for scoring.
> "The terminals (1s and 9s) are of more value in scoring than those numbered
> 2 to 8, and are classed as Honour tiles for scoring purposes."

**R-005** `[I p. 6, p. 11]` — Four plain tiles are included as replacements for lost
tiles; some sets also contain four Joker tiles.
> "Four extra plain tiles are included as replacements in case tiles are lost."
> "Some sets contain four Joker tiles. These may be used when playing a
> Goulash hand (see page 21), otherwise the accepted practice is to use the 2
> of the Bamboo suit or the plain tiles."

**R-006** `[I p. 8]` — Four winds, four copies each, 16 in all; East leads.
> "There are four tiles for each wind (4 × 4 = 16 tiles)."
> "The word tung infers leadership, so the East Wind leads the play."
Winds may be used as a pair, pung or kong, and score higher because they are
honours (p. 8).

**R-007** `[I p. 8]` — Three dragons, four copies each, 12 in all: Green, Red, White.
> "There are three kinds of Dragons known as Green, Red and White. There are
> four tiles for each dragon (4 × 3 = 12)."
The printed faces are Green `F` (fa), Red `C` (chung) and White, often a frame
plus `P` (pai). Dragons may be a pair, pung or kong and score higher as honours
(p. 8).

**R-008** `[I p. 9]` — There are eight Flower and Season tiles, all different; they take
no part in the play.
> "The Flower and Season tiles take no part in the play: they simply add a
> bonus score at the end of the game."
> "They are the only tiles in the set which are not duplicated."

**R-009** `[I p. 9, p. 30]` — Each numbered flower/season belongs to a wind:

| No. | Season | Flower | Wind |
|---:|---|---|---|
| 1 | Spring | Plum | East |
| 2 | Summer | Orchid | South |
| 3 | Autumn | Chrysanthemum | West |
| 4 | Winter | Bamboo | North |

p. 9: "If East Wind draws Spring or Plum Blossom, bonus points are awarded
because they are East's own flower and season." The p. 30 table prints the same
four rows under "Flowers, Seasons and Winds".

**R-010** `[I p. 9, p. 30]` — A bouquet is the set of four flowers or the set of four
seasons, numbered 1-4. p. 30 adds "all in the same colour"; p. 9 says the
flowers are usually numbered red and the seasons green.

**R-011** `[I p. 9, p. 20, p. 63]` — A drawn Flower tile is exposed on the rack and
replaced from the loose tiles at the end of the wall.
> "When a player draws a Flower tile, it is placed face up on his rack. The
> player then draws an extra tile from the loose tiles at the end of the wall to
> regain the correct number of tiles."
p. 20 extends this to Seasons and forbids discarding them: "Season and Flower
tiles may only be drawn from the wall, and are not discarded."

**R-012** `[I p. 10]` — The set's accessories are four wind discs in a `mingg`, dice,
a wind cube and counters.
> "Four wind discs ... They may be used to select seats and to indicate which
> wind the player represents."
> "The discs are placed face downwards, shuffled and picked by the players. East
> Wind selects a seat first."
> "In the absence of a cube (see below) the discs may be placed in the box with
> the uppermost disc denoting the Wind of the Round."
Dice: "Four or six are included in the dice box although only two are required."
The cube is placed by the first East Wind and "changed as necessary" (p. 10).

**R-013** `[I p. 11]` — Racks are optional; a standard rack is the exact length of one
wall, 18 tiles. Some sets have three black racks and one red rack for East.
> "The standard racks usually measure the exact length of the wall (i.e. 18
> tiles), making the counting of tiles during construction unnecessary."

### B. Objective and hand shape

**R-014** `[I p. 5]` — Mah Jong is for four players, though two, three or five may
play, and uses 144 tiles.
> "Mah Jong is a game for four players (although two, three or five may play)
> played at a table with a set of 144 tiles."

**R-015** `[I p. 5]` — Players hold 13 tiles and play as individuals.
> "During the game, the players hold 13 tiles. They play as individuals, not as
> partners."

**R-016** `[I p. 5, p. 16]` — The objective is four groups of three or four tiles plus
one pair, or a special hand.
> "The objective of the game is to be the first player to obtain either a
> complete set of four defined groups of three or four tiles and one pair, or
> certain special hands."

**R-017** `[I p. 5, p. 16]` — The first to complete a hand wins, not necessarily the
highest scorer, and the winner pays nobody.
> "The first player to achieve this structure, which need not bring the highest
> score, wins the hand." (p. 5)
> "The winner does not have to pay any other player." (p. 16)

**R-018** `[I p. 17]` — The Chinese game allows mixed suits and any number of chows;
the Western game uses one cleared suit and adds special hands.
> "A TYPICAL CHINESE HAND (ANY SUITS AND MAY CONTAIN ANY NUMBER OF CHOWS)"
> "A TYPICAL WESTERN HAND (ANY ONE SUIT AND MAY CONTAIN ONLY ONE CHOW)"

**R-019** `[I p. 14, p. 62]` — In the ordinary Western hand, suit tiles are all one
suit, honours may be included, and at most one chow replaces a pung.
> "In the Chinese game, any number of Chows are permitted. In the Western game,
> only one Chow is permitted in the ordinary Mah Jong hand." (p. 14)
> "To collect four groups, all in the same suit, comprising Pungs, Kongs (one
> Chow may be substituted for one Pung) and one Pair. Honour tiles may be
> included. All tiles are used." (p. 62, Western objective)

**R-020** `[I p. 28, p. 62]` — In the Chinese game suits may be mixed and any number of
chows is allowed; the last 14 tiles of the wall are not used.
> "The suits may be mixed and may include Winds or Dragons or both ... Any
> number of Chows are permitted." (p. 28)
> "To collect four groups comprising Pungs, Kongs or Chows (as many as desired)
> and one Pair. Suits may be mixed. The last 14 tiles are not used." (p. 62)

**R-021** `[I p. 15]` — The pair is the "Sparrow's Head" or "Pillow"; the completed
hand is 14 tiles.
> "The completed Mah Jong hand must contain a pair of identical tiles, known as
> the 'Sparrow's Head' or 'Pillow', making a total of fourteen tiles."

**R-022** `[I p. 15, p. 63]` — A pair may be completed from any player's discard only
when that tile wins the hand.
> "A pair may be formed from the discard of any other player if it is the last
> tile required to complete a Mah Jong hand."
> "Only the winning hand may claim a tile to form a pair." (p. 63)

**R-023** `[I p. 21, p. 63]` — The winner declares "Mah Jong", shows all tiles, and
makes no further discard.
> "The player to win must show all his tiles face upwards." (p. 21)
> "There must be at least 14 tiles in a winning combination. The winner
> displays 14 tiles and makes no discard." (p. 63)

**R-024** `[I p. 21]` — An unclaimed discard becomes a dead tile.
> "Once a tile has been discarded and not claimed immediately by another player
> it is known as a dead tile and plays no further part in the game."

**R-025** `[I p. 22]` — A claim is too late once the next player has drawn and placed
the tile on the rack.
> "When a player, in his turn, has drawn the next tile from the wall and placed
> it on his rack, it is too late for another player to pung the previous
> discard."

### C. Seating, winds and rounds

**R-026** `[I p. 18]` — Seats are chosen with two dice; the highest throw leads and
becomes East.
> "The four players in turn throw two dice. The highest total leads the game and
> becomes East Wind."
> "East Wind selects a seat. West Wind sits opposite East. South Wind sits to
> right of East. North Wind sits opposite South."

**R-027** `[I p. 18]` — "If one rack is red it is passed to the player who is East
Wind." Wind discs may be used for seat selection and to mark the Wind of the
Round (p. 18, referring back to p. 10).

**R-028** `[I p. 23]` — The Wind of the Round advances one wind per round:
> "During the first round, the prevailing wind is East. During the second round,
> the prevailing wind is South. During the third round, the prevailing wind is
> West. During the fourth round, the prevailing wind is North."

**R-029** `[I p. 23]` — Extra points are scored for the player's own wind and for the
Wind of the Round.
> "Extra points are awarded for holding tiles of one's own wind or the wind of
> the round both."

**R-030** `[I p. 21]` — East keeps the deal only by winning; otherwise the deal passes
one seat anticlockwise, regardless of who won.
> "Should East Wind go Mah Jong he remains East Wind until another player goes
> Mah Jong. Should East Wind not go Mah Jong (but another player does), the
> title of East Wind passes on to the next player in an anticlockwise direction,
> regardless of who went Mah Jong."

**R-031** `[I p. 63]` — Restated at the summary level: a losing East passes to the
player on his right, and every seat changes wind.
> "If East loses, the next player on the right becomes the new East Wind and all
> players change winds."

**R-032** `[I p. 23]` — A hand, a round and a game are defined as follows:
> "A hand begins when the tiles have been dealt and ends when one player
> completes the necessary groups with his tiles for Mah Jong or the hand is
> drawn."
> "A round is finished when each player has completed a turn as East Wind. It
> therefore consists of a minimum of four hands (with four players); however,
> should East Wind win, he remains East Wind, resulting in an extra hand for
> each time he wins or the hand is drawn."
> "A game ends at an agreed time or when East, South, West and North have all
> been the Wind of the Round."

### D. The wall and the deal

**R-033** `[I p. 18]` — All tiles are shuffled face down; 136 are used if flowers and
seasons are omitted.
> "144 tiles (or 136 if you are playing without Flowers or Seasons) are placed
> face down on the table and shuffled."

**R-034** `[I p. 18, p. 62]` — Four walls are built, each 18 tiles long and two tiles
high, and joined into a square.
> "each player takes 18 tiles at random and arranges them in front of him, long
> sides touching, then places another 18 tiles on top, thus forming a wall. The
> four walls should be joined at the corners—they represent the Great Wall of
> China."

**R-035** `[I p. 28]` — The Chinese game uses 136 tiles, two rows of 17 per wall, and
the last 14 tiles form the dead part of the wall.
> "Play, therefore, is with 136 tiles—two rows of 17 tiles to each wall. The
> last 14 tiles are known as the Dead Part of the Wall and are not used."
A kong replacement is the exception: "If a Kong is formed during the game,
however, a loose tile is taken from this portion of the Wall."

**R-036** `[I p. 18]` — East throws two dice to choose which wall to break, counting
anticlockwise from his own wall as 1. The printed table:

| Number thrown | Player who built the wall to break |
|---|---|
| 5 or 9 | East Wind |
| 2, 6 or 10 | South Wind |
| 3, 7 or 11 | West Wind |
| 4, 8 or 12 | North Wind |

**R-037** `[I p. 18]` — The builder of that wall counts off the same number from the
right-hand end and sets aside two tiles as loose tiles.
> "the player who built that wall counts the tiles from the right-hand side
> until the same number thrown on the dice is reached—these two tiles are
> removed and placed face downwards on top of the second and seventh tiles on
> the right side of the break. They are now known as the loose tiles."

**R-038** `[I p. 62]` — The summary restates the break: count the same number from the
right, lift out two tiles, place them on the wall to the right.

**R-039** `[I p. 18]` — Loose tiles replace kongs and bonus tiles, and are replenished
two at a time from the end of the wall to the right of the break.
> "Loose tiles are used to replace tiles taken for Kongs, Flowers and Seasons
> during the course of play. When each two are used, starting with the tile
> further from the break, two more tiles are taken from the end of the wall to
> the right of the break, and positioned on top of the wall as replacements."

**R-040** `[I p. 18, p. 62]` — The deal is four tiles at a time for three rounds (12
each), then one tile each, then one extra to East, who starts with 14.
> "Beginning with East, each player draws two pairs (four tiles) from the left
> side of the opening ... until each player has taken 12 tiles. East Wind then
> takes the next tile from the top row, the remaining three players each taking
> one tile in turn. East Wind then takes one more tile, making 14 tiles, while
> the other players each have 13 tiles. East then makes the first discard."

**R-041** `[I p. 20, p. 62]` — Flowers and seasons dealt in the opening hand are
exposed and replaced immediately, East first, then South, West and North.
> "Season and Flower tiles dealt to a player are placed face up on top of the
> rack and a loose tile taken from the wall as a replacement. Should two or more
> players be dealt one or more of these tiles, East takes the replacements
> first, followed by South, West and North in turn."

**R-042** `[I p. 20]` — Flowers and seasons drawn during play are exposed and replaced
at once and are never discarded.
> "When drawn during play they are exposed face up on top of the rack and a
> loose tile taken immediately as a replacement to correct the number in the
> hand."

**R-043** `[I p. 31]` — The children's/teaching variant uses 136 tiles with flowers and
seasons removed, no walls, and the same 12 + 1 + East-extra deal.
> "1. Remove the Seasons and Flowers. 2. Spread all 136 tiles face down on the
> table."
> "Each player takes four tiles in the order East, South, West and North ...
> until all four players have twelve tiles each. Each player then takes one tile
> and East takes a final extra tile..."

### E. Turns and discards

**R-044** `[I p. 20]` — East discards first, face up in the centre; discards are named;
play runs East, South, West, North (anticlockwise).
> "To start the play, East Wind discards one of his 14 tiles, laying it in the
> centre of the table face up. Each discard should be named clearly as a
> courtesy to the other players."
> "the order of play being East, South, West, North ('Eat Soy With Noodles')."

**R-045** `[I p. 21]` — A turn begins with a draw from the open end of the wall, or by
picking up the last discard for an exposed chow; any player may call
pung/kong/mahjong on a discard; the turn ends with a discard.
> "A player's turn may commence when he takes a turn in the normal progression
> of play, drawing a tile from the open end of the wall or picking up the last
> discard for an exposed Chow. Any player, whether it is his normal turn or not,
> may call 'Pung', 'Kong' or 'Mah Jong' and obtain a tile just discarded. His
> turn is completed when he has discarded a tile face up in the centre of the
> table."

**R-046** `[I p. 21]` — No player may draw until the previous discard has been made.
> "No player may draw from the wall until the discard of the previous player has
> been made."

**R-047** `[I p. 20, p. 62]` — After a pung or kong on a discard, the player to the
caller's right plays next; the seats between discarder and caller lose their
turn.
> "When a player pungs or kongs a discard the player to his right takes the next
> turn unless there is another call of 'Pung' or 'Mah Jong'. The players between
> the discarder and the caller lose their turn."

**R-048** `[I p. 21, p. 62]` — A claimed discard stays visible.
> "A claimed discard must remain visible to the other players."

**R-049** `[I p. 62]` — If a discard is not claimed, the player on the discarder's
right draws from the open end and then discards.

**R-050** `[I p. 21]` — Players should choose their discard while others take their
turns, and should watch discards for information.

### F. Pungs, kongs, chows and pairs

**R-051** `[I p. 14]` — The four groups are defined as:
> "Pung — Three identical tiles; Kong — Four identical tiles; Chow — A run of
> three consecutive tiles in the same suit; Pair — Two identical tiles."

**R-052** `[I p. 14]` — An exposed pung is formed from a concealed pair plus the
discarded tile, immediately, and the caller then discards unless winning.
> "If any player requires a tile being discarded to form a Pung (already holding
> a pair of the same type concealed in his hand), he must call 'Pung' and, laying
> the two tiles from his hand on his rack, join the discard to them, thus forming
> an exposed Pung. The required tile must be 'Punged' at the time it is
> discarded. He must then make a discard, unless going Mah Jong."

**R-053** `[I p. 14]` — If a pung and a win compete for the same tile, the win wins.
> "Should two players require the same tile, one for a Pung and one for Mah
> Jong, the player requiring the tile to complete his hand has precedence over
> the other."

**R-054** `[I p. 14]` — A concealed pung is made from the wall and stays hidden; it
scores more, and its middle tile is turned face down at scoring.
> "A player may hold a pair concealed in the hand and draw the third tile from
> the wall to make a Pung—this Pung remains concealed in the hand and is not
> declared face up. More points are awarded for a concealed Pung than for an
> exposed Pung."
> "When revealed at the end of the hand for scoring, the middle tile is turned
> face down to indicate that the Pung was concealed."

**R-055** `[I p. 14]` — An exposed kong may be made from three concealed tiles plus a
discard, and the caller takes a loose tile. A kong counts as three tiles for
hand size.
> "Any player holding three identical tiles concealed in his rack when the
> fourth is discarded may call Kong, then expose the three tiles in his hand
> combined with the discarded tile, all face up. This is known as an exposed
> Kong. This player must take one loose tile, otherwise he is one tile short in
> number. Always count a Kong as if it consisted of three tiles."

**R-056** `[I p. 14]` — A player may add his own drawn fourth tile to an already
exposed pung; he may not add another player's discard to it.
> "Any player holding three identical tiles previously claimed as a Pung and
> already exposed on top of the rack, who draws the fourth tile from the wall
> himself may add it to the exposed Pung to form an exposed Kong. A loose tile
> must be taken before discarding. A player having an exposed Pung when the
> fourth is discarded by another player may not claim it to form a Kong."

**R-057** `[I p. 14]` — A concealed kong is four tiles with the two middle tiles face
down; a loose tile is taken, and the hand carries one extra tile per kong.
> "A player holding three identical tiles concealed in his hand, who draws the
> fourth from the wall, may lay down the four tiles with the two middle tiles
> turned face down to form a concealed Kong. The player must then take a loose
> tile before discarding. For each Kong in a completed hand, the hand must
> contain one extra tile."

**R-058** `[I p. 14]` — A concealed kong may be held undeclared; until declared it
scores only as a concealed pung.
> "Should a player prefer to hold the concealed Kong in hand ... it will only
> score as a concealed Pung until declared."

**R-059** `[I p. 8, p. 14]` — A chow is a run of three consecutive tiles in one suit
and scores nothing, exposed or concealed.
> "This is a run of three consecutive tiles all in the same suit, eg. 1, 2, 3
> Characters." (p. 14)
> "Whether a Chow is concealed or exposed, it scores no points—it merely allows
> the player to complete the hand with more speed."

**R-060** `[I p. 14]` — Only the player on the discarder's right may claim a chow
normally; a player going Mah Jong has priority over all claims.
> "Only the player sitting on the right of the discarder may claim a discard to
> complete a Chow; but a player going Mah Jong has priority over all other
> claims for the discard. Any player claiming a discard for a Chow must already
> have in hand two tiles of the Chow, and expose them along with the discarded
> tile before making a discard."

**R-061** `[I p. 21]` — A chow claim from the right requires the other two tiles in
hand; another player may claim a discard for a chow only to win.
> "If no player pungs a discard, the player on the right of the discarder may
> claim this tile to complete a Chow if he holds the other two tiles. The three
> tiles must then be exposed on top of the rack. Another player may claim this
> tile for a Chow only if the tile completes his hand to go Mah Jong."

**R-062** `[I p. 21]` — Precedence is: win over pung/kong over chow; between two
winners, the player next in turn.
> "Should the same discard be needed for a Chow by a player on the right of the
> discarder and for a Pung or Kong by another player, the Pung or Kong has
> precedence. But a player requiring that tile to go Mah Jong takes precedence
> over all others. If two players require the same tile to win, the player next
> in turn claims the tile."

**R-063** `[I p. 21]` — A pung claim may not be turned into a kong with a later
discard; only the player's own drawn tile may be added.
> "The fourth identical tile may not be added to form a Kong unless that player
> draws it from the wall himself."

**R-064** `[I p. 21]` — A player holding three identical tiles may instead pung the
discard and keep the fourth for a possible chow, adding it later in one of his
own turns.
> "The player may, however, pung the discard and lay down three tiles while
> keeping the fourth concealed, preferring to hold it for a possible Chow. He
> has the option of adding this tile to his Pung to form a Kong in any one of his
> subsequent turns."

**R-065** `[I p. 21]` — A player with an exposed pung who draws the fourth may kong it,
but any player who can win on that tile may rob the kong.
> "Should a player with an exposed Pung draw the fourth matching tile from the
> wall he may join it to his Pung to form a Kong. If he does so, however, any
> other player who can use this tile immediately to go Mah Jong may claim it."

**R-066** `[I p. 21]` — For a concealed kong, the four tiles go down with the two
middle tiles face down before the replacement is taken; some clubs allow it
fully concealed if agreed before play.
> "Before drawing the replacement loose tile for a concealed Kong, the four
> tiles of the Kong must be placed on top of the rack with the two middle tiles
> turned face down. Some clubs allow the Kong to be entirely concealed, but this
> must be established before play commences."

### G. Fishing or calling

**R-067** `[I p. 21, p. 32]` — A player one tile from Mah Jong is "fishing" or
"calling"; special-hand fishing changes the scoring. The page names the state;
it does not require an announcement or say that the wait is told to anyone.
Showing that one is fishing, and only that, is the Companion's display (C p. 55,
§3.4): it is the fishing player's choice, and a fishing score is claimed only
when it was shown `[A]` (ASSUMPTIONS.md, "Showing the fish").
A table may also agree that **a win needs the fish shown**: a house rule
neither book prints, off by default (owner ruling 2026-11-13, tester report
#118). Under it a player who was offered the announcement goes out only after
showing the fish `[A]` (ASSUMPTIONS.md, "A win needs the fish shown").
> "When a player requires only one more tile to complete his hand for Mah Jong,
> his hand is said to be 'fishing' or 'calling'. When a player is fishing for a
> special hand, and another player goes Mah Jong, certain conditions apply to
> the scoring (see page 32)."

**R-068** `[I p. 62]` — A player needing one tile may take it from any discard and has
precedence over every other claimant.
> "A player needing one tile to go Mah Jong may take it from any discard. He has
> precedence over all other players."

**R-069** `[I p. 32]` — When another player wins, a player fishing for a **special**
hand scores a reduced figure fixed by the limit and the hand's tier. At a limit
of 1000:
> "Half-limit hand scores one-fifth of the limit = 200 points"
> "Limit hand scores two-fifths of the limit = 400 points"
> "Double limit hand scores one-half of the limit = 500 points"

**R-070** `[I p. 21 #24, p. 24, p. 32]` — East pays or receives double on these fishing
scores too. A fishing hand is a losing hand that is scored, and it is settled
as every losing hand is: the winner is paid first and "does not pay anyone",
then "all the other players expose their hands, total their scores and settle
the differences" (p. 21). The settlement level says which losing hands are
scored: Intermediate "winning and fishing hands", Advanced "all hands" (p. 24,
R-094). At Intermediate a fishing player scores the fishing figure and the
other losers score nothing, so each of the other two losers pays the fishing
player that figure; two fishing players settle the difference between their
figures. The winner neither pays nor receives a fishing score.
> "As with other scores, East Wind pays or receives double."
> "If he loses, he pays the other players double their scores" (p. 21)

**R-071** `[I p. 32]` — Only the ordinary cleared-suit, Purity, All Honour and
Concealed Mah Jong (Buried Treasure) hands use the ground score and doubles;
when fishing for those, score as on p. 24 but without the 20 points for going
Mah Jong.
> "When fishing for these hands, score in the same way, without the bonus of 20
> points for going Mah Jong."

**R-072** `[I p. 32]` — A bouquet drawn while attempting a special hand is paid for
immediately by each other player and the tiles are turned face down.
> "If a player draws a Bouquet (a set of four Season or Flower tiles) while
> attempting a Special hand, each of the other players immediately gives this
> player one 1000-point counter and the four tiles are turned face down."

### H. Winning, the drawn hand and payment

**R-073** `[I p. 21]` — Play continues until a player announces "Mah Jong" or the hand
is drawn.

**R-074** `[I p. 21]` — A drawn hand is one where the wall is exhausted with no winner:
all hands are abandoned and nobody scores.
> "Should no player complete a hand for Mah Jong before all tiles have been
> drawn from the wall, all hands are abandoned and no-one scores. Tiles are
> turned face down and shuffled, the wall rebuilt and a Goulash is played."
This is the Western rule; p. 63 repeats that in the Western version all tiles
are taken, in the Chinese version only the last 14 are left, and p. 28 says the
Chinese play another hand with a kitty and "The Chinese do not play Goulash."

**R-075** `[I p. 28]` — In the Chinese drawn hand East remains East and each player
puts a stake into a kitty for the winner.
> "If no player calls 'Woo' before the last 14 tiles have been used, no scores
> are counted, the tiles are shuffled, the wall rebuilt and another hand is
> played. East Wind remains East and continues as East if he wins. Each player
> puts a predetermined amount into the kitty which the winner takes as an added
> bonus."

**R-076** `[I p. 21]` — All players pay the winner; the winner pays nobody. The losers
then expose and settle the differences between their own scores.
> "The player to win counts his score and is the first to be paid. All players
> pay the winner, who does not pay anyone. When the winner has been paid, all
> the other players expose their hands, total their scores and settle the
> differences by exchanging counters."

**R-077** `[I p. 21, p. 63]` — East pays and receives double.
> "East Wind pays and receives double. If he loses, he pays the other players
> double their scores and if he wins, he receives double his score."

**R-078** `[I p. 26]` — The worked example applies the limit per payer: ground 84
doubled five times is 2688, the 1000 limit applies, South and North each pay
1000 and East pays 2000.

**R-079** `[I p. 22]` — A player who discards a tile that was visibly needed (enough
exposed tiles show the wait) pays the other two losers' debts as well as his
own, unless he was himself fishing or held at least three doubles. The
indication comes from the winner's exposed tiles, never from an announced wait;
"sufficient" is read as three exposed sets of one suit `[A]` (ASSUMPTIONS.md,
"Careless discard").
> "Careless discards If a player has a sufficient number of exposed tiles to
> indicate the tile needed to complete his hand and another player discards
> that tile, the player responsible for that discard must pay not only his debt
> to the winner, but also those of the other two losers."
> "This rule does not apply if the player discarding the winning tile was also
> Fishing or holding at least three doubles."

**R-080** `[I p. 22]` — Penalties:
> "1. Too many tiles A player holding too many tiles may not correct the number.
> He is not permitted to go Mah Jong, and scores nothing."
> "2. Too few tiles Any player holding too few tiles may not correct the error
> after discarding. He may score his hand, but is unable to go Mah Jong."
> "3. Declaration of a false Mah Jong Play may continue if the other players
> have not exposed their hands, but if they have, the player making this mistake
> must pay a half-limit to each of the other players."
> "4. Discarded tiles May not be reclaimed."

**R-081** `[I p. 63]` — The summary prints a different too-many-tiles penalty: the
offender "pays all other players, scores nothing, and cannot go Mah Jong."

**R-082** `[I p. 22]` — A player dealt a completely featureless hand may call for a
reshuffle, and the others must abandon.
> "A player may request a reshuffle if he is dealt no Winds, Dragons, Pairs,
> Pung or Chow, Terminals, Seasons or Flowers. The other players are obliged to
> abandon their hands."

### I. Scoring

**R-083** `[I p. 24]` — At scoring, exposed tiles are those taken from discards and
placed face up; concealed tiles are those drawn from the wall.
> "Exposed tiles are those which have been taken from discards and have been
> placed face up on the top of the rack or the table. Concealed tiles are those
> concealed when all the tiles on the rack have been drawn from the wall."

**R-084** `[I p. 24]` — The ground score table:

| Group | Points (exposed) | Points (concealed) |
|---|---:|---:|
| Pung, suits 2-8 | 2 | 4 |
| Pung, winds/dragons/1s/9s | 4 | 8 |
| Kong, suits 2-8 | 8 | 16 |
| Kong, winds/dragons/1s/9s | 16 | 32 |
| Chow | 0 | 0 |
| Flower or Season (if used) | 4 each | 4 each |

**R-085** `[I p. 24]` — Ground bonuses available to all players:
> "(a) Any pair of Dragons 2
> (b) A pair of player's own Wind 2
> (c) A pair of Wind of the Round 2
> (d) Claiming first discard made by East Wind 2"

**R-086** `[I p. 24]` — Winning-hand-only ground bonuses:
> "(e) For going Mah Jong by making a Chow with a tile in the only possible
> places ... 2
> (f) For drawing the winning tile from the wall 2
> (g) For completing the Pair with the winning tile 2
> (h) For going Mah Jong 20"

**R-087** `[I p. 24]` — The ground score is totalled before any doubling.
> "These scores are known as the ground or basic score and are added before the
> score is doubled for any Honour combinations."

**R-088** `[I p. 25]` — One double each, all players:
> "(a) Each Pung or Kong of Dragons
> (b) Pung or Kong of the player's own Wind
> (c) Pung or Kong of the Wind of the Round
> (d) Holding the player's own Season
> (e) Holding the player's own Flower"

**R-089** `[I p. 25]` — One double each, winning and fishing hands only:
> "(f) Any one suit with Winds or Dragons or both
> (g) No Chows
> (h) Going Mah Jong
> (i) With a loose tile off the Wall,
> (ii) With the last remaining tile of the Wall,
> (iii) By robbing the Kong"

**R-090** `[I p. 25]` — Two doubles for a concealed Mah Jong, all tiles drawn from the
wall.

**R-091** `[I p. 25]` — Three doubles, all players, for each of:
> "(j) All one suit—no Winds, no Dragons. If this hand contains the player's own
> Season, own Flower, and no Chows, add one double for each.
> (k) Honour tiles only (this includes one double for all Pungs). Add one double
> for each a, b, c, d, e (as above) and cleared suit if the terminals are of the
> same suit.
> Bouquet of Seasons (this includes one double for own Season).
> Bouquet of Flowers (this includes one double for own Flower)."

**R-092** `[I p. 26]` — The total is the ground score doubled once per double, then
capped by the limit. Worked: 84 × 2^5 = 2688, limit 1000, East pays 2000.

**R-093** `[I p. 24]` — A limit is agreed before play. Printed examples:
> "Chinese, not using Seasons 300 points
> Chinese, using Seasons 500
> Western, using Seasons 1000
> Modern American, using Seasons 500"

**R-094** `[I p. 24]` — Settlement level may be agreed:
> "Beginners Score and pay winning hand only.
> Intermediate Score and pay winning and fishing hands.
> Advanced Score and pay all hands."

**R-095** `[I p. 22]` — Payments are rounded to the nearest 100; over 50 counts up.
> "Generally the pay is made to the nearest 100 points—over 50 counts as 100, 50
> or less counts to the 100 below."

**R-096** `[I p. 22]` — Western counters per player total 16 000: 10 × 100, 8 × 500,
7 × 1000, 1 × 4000.

**R-097** `[I p. 28]` — Chinese counters per player total 2000: 10 × 2, 8 × 10, 9 ×
100, 2 × 500. The usual limits are 300 without flowers/seasons and 500 with
them.

**R-098** `[I p. 29]` — In the Chinese game a non-scoring hand of four chows and a
worthless pair is awarded 10 points; beginners score only the winning hand,
experienced players score all hands.

**R-099** `[I p. 32]` — Special hands are scored by their printed tier, not by ground
score plus doubles. The limit is 1000 and the tiers are half-limit, limit and
double limit.
> "The groups of tiles do not score as in an ordinary suit hand, the score
> being determined by the ease or difficulty of obtaining the combinations. A
> limit of 1000 points is set. The player achieving a Special hand will score
> either a half-limit, limit or double-limit, according to the score allotted
> for that particular hand."

### J. Goulash, tournament play and variants

**R-100** `[I p. 21]` — A Goulash follows a drawn Western game; the preliminaries are
the same as a normal hand, then tiles are exchanged three times:
> "three tiles are exchanged with the player opposite. Then East exchanges three
> tiles with South, West exchanges with North. Lastly East exchanges three tiles
> with North while West and South exchange. Thus the tiles are exchanged three
> times."

**R-101** `[I p. 21]` — East remains East for the Goulash but loses the privilege
afterwards regardless of who wins.

**R-102** `[I p. 21]` — No chows are allowed in a Goulash hand unless part of a
special hand, and therefore no "no Chows" doubles are awarded.

**R-103** `[I p. 21]` — Goulash jokers may be the four blank tiles (making the East
and West walls 38 tiles instead of 36) or the four 2 Bamboos. A player may
nominate a joker as any tile; a joker in an exposed kong may be swapped out when
the fourth matching tile is drawn.

**R-104** `[I p. 21]` — A pool/kitty may be agreed before the Goulash: each player
puts in a 200-point counter or agreed sum, winner takes it. Another draw repeats
the Goulash, East stays East, and each player adds another counter.

**R-105** `[I p. 63]` — Tournament suggestions:
> "1. Jokers, Season and Flower tiles are removed.
> 2. Four-handed version only is played.
> 3. Goulash is not played after a drawn game.
> 4. East passes on at the end of each hand ... A round is therefore limited to
> four hands.
> 5. The limit is set at 1000 points.
> 6. Before play commences, rules to be used should be established.
> 7. If Special hands are used, not more than fourteen hands ... should be
> selected.
> 8. No player may go Mah Jong with the same Special Hand for more than two
> consecutive turns."

**R-106** `[I p. 30]` — Special hands are optional and must be agreed before play; the
introduction also names the printed extra hands with their tiers (their
compositions are Milestone B).

**R-107** `[I p. 30]` — The Mah Jong terms glossary confirms the operative
definitions, including "Honour Tiles Winds, Dragons and terminals", "Loose
Tiles Tiles to replace Kongs, Seasons and Flowers", and "Dead Tiles Tiles
unclaimed when discarded may not be claimed later in the game."

---

### Not stated

The following are absent from these pages. They are **not** filled in from
other mahjong knowledge or the old Companion text.

1. **Two-, three- and five-player procedures.** p. 5 and p. 16 say such games
   are possible; no seating, wall or deal variant is printed. Partnerships are
   excluded (p. 5, p. 16), with no further rule.
2. **A minimum winning score.** Any complete structure wins; no minimum is
   printed. (The ground score and limit are separate.)
3. **Whether a player may decline a legal win or a claim.** Only the dead-tile
   rule (R24) and the claim deadline (R25) are printed.
4. **What happens if the loose tiles are exhausted before a kong replacement.**
   p. 18 says loose tiles are replenished from the wall, but not what occurs
   when there is no tile left.
5. **Who pays a fishing player.** Resolved from the printed pages, not
   assumed: p. 21 #24 (the winner pays no-one; the losers settle the
   differences between their scores) read with p. 24 (Intermediate scores and
   pays fishing hands) and p. 32. See R-070.
6. **Whether a fishing player may still pung, chow or kong.** No restriction is
   printed; fishing is described only as the state of needing one tile.
7. **How a chow that wins is displayed or scored as exposed or concealed.**
   p. 24 defines exposed tiles as those placed face up from discards, but does
   not classify a winning chow claim.
8. **Whether the winning tile taken from a discard counts as exposed.** p. 24's
   definition is about tiles "placed face up on the top of the rack"; the
   winner's hand is shown all at once (R23).
9. **Middle limit.** These pages print half limit, limit and double limit only
   (p. 32). A "middle limit" tier is not stated here.
10. **The exact score value of a "Calculate" hand.** The ordinary hand is
    scored by R83-R92; no separate numeric value is printed.
11. **Whether a drawn hand gives East one extra hand or an indefinite repeat.**
    p. 22 says an extra hand each time the hand is drawn; p. 63 says in the
    Western version "East remains for only one more hand and a Goulash is
    played". These are not reconciled on the page.
12. **The amount a too-many-tiles offender pays.** p. 63 says only "pays all
    other players"; it prints no figure. The engine pays each other player the
    half-limit (the only printed half-limit penalty, R80(3)), and records this
    as a reading, not a quotation.
13. **Penalties for an out-of-turn claim, an exposed tile error, or a wrong
    declaration other than a false Mah Jong.** Only the four p. 22 penalties
    and the careless-discard rule are printed.
14. **How the dead-wall boundary is accounted when a kong replacement is taken
    from it.** p. 28 says the last 14 tiles are dead but a kong takes a loose
    tile from that portion; the exact counting boundary is not printed.

### Readings chosen where a sub-case is silent

- **Goulash exchange order and choice.** R100 names the three exchanges and
  the engine asks each player for the three tiles they choose; choice is not
  printed but is the only literal reading of "three tiles are exchanged".
- **Goulash jokers.** R103 makes them a table option (four blanks or four
  2 Bamboos). The engine carries the option in state; blank-tile nomination is
  not used in the Western default described by the rest of this framework.
- **Reshuffle algorithm.** R82 orders a reshuffle but prints no shuffle. The
  engine advances the seeded wall by one set and redeals the same hand number.
- **Losing-hand score at advanced settlement.** R94 says "all hands"; R69
  prints the ordinary/fishing route "without the 20 points for going Mah
  Jong". The engine scores a losing 13-tile hand by its best waiting
  completion's ground score (or 0 when it has no wait), and settles pairwise
  differences (R76).
- **Tournament special-hand selection.** R105(7) caps the list at fourteen;
  R105(8) bans a third consecutive win with the same selected special hand.
  Ordinary Mah Jong remains available regardless of the selected list.

### Source ambiguities

Recorded with both literal readings; no reading was chosen silently.

- **p. 62 tile list.** The summary prints "8 Seasons (8)" where the arithmetic
  needs 4 flowers + 4 seasons. p. 6 and p. 9 print four of each. R1 records the
  literal line; the composition follows p. 6.
- **p. 63 vs p. 22, too many tiles.** R80 says "scores nothing" and R81 adds
  "pays all other players". The engine applies both: the offender scores
  nothing and pays; the amount is the half-limit reading above.
- **p. 63 vs p. 21-22, drawn hand.** "East remains for only one more hand"
  (Western) versus "an extra hand for each time ... the hand is drawn" (p. 22).
- **p. 21, chow from a non-right seat.** R61 says another player may claim for a
  chow "only if the tile completes his hand to go Mah Jong"; p. 14 says only the
  right-hand player may claim a chow. Read together, a non-right player's chow
  claim is legal only as a win. The pages do not say whether the resulting meld
  is exposed for scoring.
- **p. 21, robbing the kong.** The tile is "the fourth matching tile" drawn from
  the wall; p. 14 says a player may add it to an exposed pung. The pages do not
  say whether the robber's win cancels the kong and its replacement draw.
- **p. 24, "Concealed tiles are those concealed when all the tiles on the rack
  have been drawn from the wall."** The sentence is awkward; the operative
  distinction used by the tables is exposed meld versus wall-drawn tile.
- **p. 9 vs p. 30, bouquet.** p. 9 defines it by four numbered tiles; p. 30 adds
  "all in the same colour". Since flowers are red and seasons green, the two
  readings coincide for a normal set.

---

# Part II — special hands

Every hand the primary book prints, in book order, as the book prints it. A
special hand is scored by its printed tier, not by ground score and doubles.

**How to use it.** A hand matches only if its composition and its printed
conditions are met; `Concealed (except last tile)` binds, and "Exposed" marks a
hand that may be completed on a discard. Where the printed illustration shows a
choice ("any tile paired"), the caption defines it and the illustration only
exemplifies it — the catalogue row names both.

**Totals.** 53 printed entries: hands 1-51 on printed pp. 34-58 plus the two
unnumbered hands on p. 30. Printed tiers: 7 double limit, 37 limit, 5 half
limit, and 4 scored by doubling, the score sheet or 10 points.

**Against the table.** `rules/AUDIT.md` classifies every entry in
`src/core/patterns/table.ts`: 38 verified, 12 corrected, 3 missing from the
table, and 35 that the book does not print (the Companion supplement of Part
III). None of the 12 corrections or 3 additions is implemented yet.

| # | Printed name | Printed score line | Composition read from the illustration and caption | p. | Notes printed on the page |
|---:|---|---|---|---|---|
| 1 | ORDINARY HAND | `See score-sheet, pp. 24 and 25` | Any one suit. Illustration: `4C×3`, `7C×3`, `1C-2C-3C`, `中×3`, `8C×2`. | `[I p. 34]` | "Pungs or Kongs and a Pair. A Chow may be substituted for a Pung. May include Winds, Dragons or both." If all tiles including the last come from the wall, "the hand is known as a concealed Mah Jong and scores 2 extra doubles." |
| 2 | PURITY HAND | `THREE DOUBLES PLUS EXTRAS (see score-sheet)` | Any one suit, no honours. Illustration: `1O×3`, `2O×3`, `7O×3`, `9O×3`, `4O×2`. | `[I p. 34]` | "Pungs or Kongs and a Pair. A Chow may be substituted for a Pung. No Winds or Dragons." Concealed Mah Jong scores 2 extra doubles. |
| 3 | HEAVENLY TWINS | `LIMIT` | One suit, seven pairs: `1O×2`, `3O×2`, `4O×2`, `5O×2`, `6O×2`, `8O×2`, `9O×2`. | `[I p. 34]` | "Any one suit. 7 Pairs. No Winds or Dragons. Concealed (except last tile)." |
| 4 | ALL PAIR | `HALF LIMIT` | One suit plus honours: `1C×2`, `2C×2`, `8C×2`, `9C×2`, `E×2`, `S×2`, `發×2`. | `[I p. 34]` | "Any one suit. 7 Pairs. With Winds, Dragons or both. Concealed (except last tile)." |
| 5 | GATES OF HEAVEN | `LIMIT` | One suit: `1B×3`, `9B×3`, run `2B-3B-4B-5B-6B-7B-8B`, extra tile 2–8 (illustration uses a blank "any tile 2–8 paired" card). | `[I p. 36]` | "Any one suit. Pung of 1s. Pung of 9s. Run of 2–8. Any tile 2–8 paired. No Winds or Dragons. Concealed (except last tile)." |
| 6 | RUN, PUNG AND A PAIR | `LIMIT` | One suit: run `1C-2C-3C-4C-5C-6C-7C-8C-9C`, `4C×3`, `7C×2`. | `[I p. 36]` | "Any one suit. Run of 1–9. A Pung and a Pair. No Winds or Dragons. Concealed (except last tile)." |
| 7 | GERTIE'S GARTER | `LIMIT` | Two suits: run `1B-2B-3B-4B-5B-6B-7B` and run `1C-2C-3C-4C-5C-6C-7C`. | `[I p. 37]` | "Run of 1–7 in one suit. Run of 1–7 in another suit. No Winds or Dragons. Concealed (except last tile)." |
| 8 | KNITTING | `HALF LIMIT` | Two suits, seven matching-number pairs: `1B+1C`, `2B+2C`, `2B+2C`, `4B+4C`, `5B+5C`, `7B+7C`, `8B+8C`. | `[I p. 37]` | "Two suits. One tile from one suit paired with corresponding number from the other suit. Concealed (except last tile)." The printed illustration repeats rank 2 and omits 3 and 6. |
| 9 | TRIPLE KNITTING | `HALF LIMIT` | Four three-suit sets plus a two-suit pair: `[1B,1C,1O]`, `[4B,4C,4O]`, `[7B,7C,7O]`, `[9B,9C,9O]`, pair `[1B,1O]`. | `[I p. 37]` | "4 Sets and a knitting Pair. One of each suit of same number. Concealed (except last tile)." |
| 10 | WRIGGLY SNAKE | `LIMIT` | One suit: run `1O-2O-3O-4O-5O-6O-7O-8O-9O`, `E`, `S`, `W`, `N`, any tile paired (illustration uses a blank "Any tile paired" card). | `[I p. 38]` | "Any one suit. Run of 1–9. One of each Wind. Any tile paired. No Dragons. Concealed (except last tile)." |
| 11 | CONCEALED MAH JONG (BURIED TREASURE) | `10 POINTS FOR NON-SCORING HAND` | One suit: chows `2O-3O-4O`, `3O-4O-5O`, `6O-7O-8O`, `6O-7O-8O`, pair `9O×2`. | `[I p. 38]` | "As many Chows or Pungs as desired. May include Winds, Dragons or both and a Pair. Every tile from wall including last. If all the tiles are in same suit (as in above example) score 3 doubles (as for Purity). No Kongs." The synopsis prints `(2 doubles and extras)`. |
| 12 | UNIQUE WONDER | `DOUBLE LIMIT` | `1B`, `1C`, `1O`, `9B`, `9C`, `9O`, `E`, `S`, `W`, `N`, `發`, `中`, `白`, plus any tile paired (illustration uses a blank card). | `[I p. 38]` | "1s and 9s from each suit. One of each Wind. One of each Dragon. Any tile paired. Concealed (except last tile)." |
| 13 | ALL PAIR HONOURS | `LIMIT` | Seven terminal/honour pairs: `1B×2`, `9B×2`, `9C×2`, `1O×2`, `9O×2`, `W×2`, `發×2`. | `[I p. 38]` | "Pairs of 1s and 9s in any suit. May include Winds, Dragons or both. May be Winds and Dragons only, or 1s and 9s only. Concealed (except last tile)." |
| 14 | ALL HONOUR HAND | `THREE DOUBLES PLUS EXTRAS (see score-sheet)` | `1C×3`, `9C×3`, `1O×3`, `N×3`, `中×2`. | `[I p. 38]` | "Pungs or Kongs of 1s and 9s in any suit with Winds, Dragons or both. A Pair of Honours. Exposed. If all tiles including last are drawn from the wall ... concealed Mah Jong and scores 2 extra doubles." |
| 15 | HEADS AND TAILS (1s AND 9s) | `LIMIT` | `1B×3`, `9C×3`, `1O×3`, `9O×3`, `9B×2`. | `[I p. 40]` | "Pungs or Kongs of 1s and 9s in any suit. A Pair of 1s or 9s. No Winds or Dragons. Exposed." |
| 16 | CHINESE ODDS | `LIMIT` | One suit: `1O×3`, `3O×3`, `5O×3`, `7O×3`, `9O×2`. | `[I p. 40]` | "Any one suit. Pungs or Kongs of odd numbers. Any Pair of odd numbers. No Winds or Dragons. Exposed." |
| 17 | DRAGONFLY | `LIMIT (if all tiles from wall except last)` / `HALF LIMIT (Pungs from discard)` | `發`, `中`, `白` (one each); `2B×3`; `6C×3`; `8O×3`; `5C×2`. | `[I p. 40]` | "One of each Dragon. Pung or Kong in each of the three suits. A Pair of any suit. No Winds." |
| 18 | WINDY CHOW | `HALF LIMIT` | `E`, `S`, `W`, `N`, one extra Wind; chows `7B-8B-9B`, `2C-3C-4C`, `5O-6O-7O`. | `[I p. 41]` | "One of each Wind with one paired. A Chow in each suit. No Dragons. Concealed (except last tile)." |
| 19 | WINDY ONES | `LIMIT (if all Pungs concealed)` / `HALF LIMIT (Pungs from discard)` | `E`, `S`, `W`, `N`, one extra Wind; `1B×3`, `1C×3`, `1O×3`. | `[I p. 42]` | "One of each Wind. Any Wind paired. Pungs or Kongs of each of the 1s in each suit. No Dragons." |
| 20 | WINDY NINES | `LIMIT (if all pungs concealed)` / `HALF LIMIT (Pungs from discard)` | `E`, `S`, `W`, `N`, one extra Wind; `9B×3`, `9C×3`, `9O×3`. | `[I p. 42]` | "One of each Wind. Any Wind paired. Pungs or Kongs of each of the 9s in each suit. No Dragons." |
| 21 | GRETA'S GARDEN | `LIMIT` | One suit: run `1B-2B-3B-4B-5B-6B-7B`; `E`, `S`, `W`, `N`; `發`, `中`, `白`. | `[I p. 43]` | "Any one suit. Run of 1–7. One of each Wind. One of each Dragon. No Pairs. Concealed (except last tile)." |
| 22 | GRETA'S DRAGON | `LIMIT` | One suit: run `1O-2O-3O-4O-5O-6O-7O`; `E`, `S`, `W`, `N`; `發×3`. | `[I p. 43]` | "Any one suit. Run of 1–7. One of each Wind. Pung of any Dragons. No Pairs. Concealed (except last tile)." |
| 23 | SPARROW'S SANCTUARY | `LIMIT` | `1B×4` (two pairs); pairs `2B×2`, `3B×2`, `4B×2`, `6B×2`, `8B×2`. | `[I p. 44]` | "2 Pairs of 1 Bamboos ('Sparrow's Head'). 1 Pair of each green Bamboos (2, 3, 4, 6 and 8). No Winds or Dragons. Concealed (except last tile)." |
| 24 | ALL PAIR JADE | `LIMIT` | Seven pairs: `2B×2`, `3B×2`, `4B×4` (two pairs), `6B×2`, `8B×2`, `發×2`. | `[I p. 44]` | "6 Pairs of green Bamboos (2, 3, 4, 6 and 8). (2 Pairs do not count as a Kong.) At least one Pair of Green Dragons. No Winds. Concealed (except last tile)." |
| 25 | IMPERIAL JADE | `DOUBLE LIMIT` | `發×3`; `2B×3`, `3B×3`, `4B×3`; `6B×2`. | `[I p. 44]` | "Pung of Green Dragons. Pungs or Kongs of Green Bamboos (2, 3, 4, 6 and 8). Pair of Green Bamboos. One Chow allowed (beware of making Kongs—the fourth tile may be required to form a Chow). No Winds. Exposed." |
| 26 | LILY OF THE VALLEY | `DOUBLE LIMIT` | `發×3`; `白×3`; `2B×3`, `4B×3`; `8B×2`. | `[I p. 44]` | "Pung or Kong of Green Dragons. Pung or Kong of White Dragons. 2 Pungs or Kongs of Green Bamboos. Pair of Green Bamboos (2, 3, 4, 6 and 8). No Winds. Exposed." |
| 27 | ALL PAIR RUBY JADE | `LIMIT` | Seven pairs: `中×2`, `發×2`, `3B×2`, `5B×2`, `7B×2`, `8B×2`, `9B×2`. | `[I p. 46]` | "Pair of Red Dragons. Pair of Green Dragons. 5 Pairs of Red and Green Bamboos, mixed. No Winds. Concealed (except last tile)." |
| 28 | RUBY JADE | `LIMIT` | `中×3`, `發×3`; `9B×3`, `2B×3`; `7B×2`. | `[I p. 46]` | "Pung of Red Dragons. Pung of Green Dragons. Pung of Red Bamboos. Pung of Green Bamboos. Pair of any Bamboos. No Winds. Exposed." |
| 29 | ROYAL RUBY | `DOUBLE LIMIT` | `中×3`; `1B×3`, `5B×3`, `7B×3`; `9B×2`. | `[I p. 46]` | "Pungs or Kongs of Red Dragons and Red Bamboos (1, 5, 7 and 9). Pair of Red Bamboos. No Winds. No Chows. Exposed." |
| 30 | RED LILY | `DOUBLE LIMIT` | `中×3`, `白×3`; `5B×3`, `9B×3`; `7B×2`. | `[I p. 46]` | "Pung or Kong of Red Dragons. Pung or Kong of White Dragons. 2 Pungs or Kongs of Red Bamboos. Pair of Red Bamboos (1, 5, 7 and 9). No Winds. Exposed." |
| 31 | RED LANTERN | `DOUBLE LIMIT (if all tiles from wall except last)` / `LIMIT (Pungs from discard)` | `中×3`; own Wind `×3` (illustration `E×3`); run `1C-2C-3C-4C-5C-6C-7C`; extra tile 1–7 (illustration uses a blank "Any tile 1–7 paired" card). | `[I p. 48]` | "Pung or Kong of Red Dragons. Pung or Kong of Own Wind. Run of 1–7 in same suit. Any tile 1–7 paired." |
| 32 | WINDY DRAGONS | `LIMIT` | `E×2`, `S×2`, `W×2`, `N×2`; `發×3`, `中×3`. | `[I p. 48]` | "Pair of each Wind. 2 Pungs of any Dragons. Dragons may be punged from a discard." |
| 33 | ALL WINDS AND DRAGONS | `LIMIT` | `S×3`, `W×3`; `發×3`, `中×3`; `白×2`. | `[I p. 48]` | "Pungs or Kongs of Winds and Dragons only. Pair of Winds or Dragons. Exposed." |
| 34 | THREE GREAT SCHOLARS (DRAGONS) | `LIMIT` | `發×3`, `中×3`, `白×3`; `8O×3`; `5O×2`. | `[I p. 49]` | "Pungs or Kongs of all three Dragons. Pung, Kong or a Chow and a Pair of any one suit or Winds. Exposed. A limit is scored for any hand containing the Three Great Scholars." |
| 35 | THE FOUR BLESSINGS (WINDS) | `LIMIT` | `E×3`, `S×3`, `W×3`, `N×3`; `9C×2`. | `[I p. 49]` | "Pungs or Kongs of each of the four Winds and a Pair of anything. Exposed. A limit is scored for any hand containing Pungs of each Wind." |
| 36 | DRAGON'S TAIL | `LIMIT (if concealed)` / `HALF LIMIT (if exposed)` | First version: `中×3`, `W×2`, run `1O-2O-3O-4O-5O-6O-7O-8O-9O`. Second version: `白×2`, `S×3`, run `1C-2C-3C-4C-5C-6C-7C-8C-9C`. | `[I p. 52]` | "1st Version: Pung of Dragons. Pair of Winds. Run of 1–9 in any one suit." "2nd Version: Pair of Dragons. Pung of Winds. Run of 1–9 in any one suit." |
| 37 | DRAGON'S BREATH | `LIMIT (concealed)` | `發`, `中`, `白` (one each), one extra Dragon; pairs `1B×2`, `3B×2`, `5B×2`, `6B×2`, `8B×2`. | `[I p. 53]` | "One of each Dragon. Any Dragon paired. 5 Pairs in any one suit." |
| 38 | WINDFALL | `LIMIT` | `E`, `S`, `W`, `N`; pairs `2B×2`, `3B×2`, `4B×2`, `6B×2`, `8B×2`. | `[I p. 53]` | "One of each Wind. 5 Pairs of any one suit. No Dragons. Concealed (except last tile)." |
| 39 | CIVIL WAR (1861-1865) | `DOUBLE LIMIT` | `N×3`, `S×3`; `1O`, `8O`, `6O`, `1O`; `1C`, `8C`, `6C`, `5C`. | `[I p. 53]` | "Pung of North Winds. Pung of South Winds. 1,8,6,1 in one suit. 1,8,6,5 in another suit. No Dragons. Concealed (except last tile)." |
| 40 | RED WARATAH | `LIMIT` / `HALF LIMIT (Pungs from discard)` | `中×3`; `發×2`; `5B×3`; `6C×3`; `9O×3`. | `[I p. 54]` | "Pung of Red Dragons. Pair of Green Dragons. Pung of Red Bamboos. Pung of Circles. Pung of Characters. No Winds." |
| 41 | LILYPILLY | `LIMIT` / `HALF LIMIT (Pungs from discard)` | `發×3`; `白×2`; `4C×3`, `8C×3`, `9C×3`. | `[I p. 54]` | "Pung of Green Dragons. Pair of White Dragons. 3 Pungs of Circles. No Winds." |
| 42 | SEVEN BROTHERS | `LIMIT (if all tiles from wall except last)` / `HALF LIMIT (Pungs from discard)` | `7B×3`, `7C×3`, `7O×3`; `E`, `S`, `W`, `N`, one extra Wind. | `[I p. 55]` | "Pungs or Kongs of 7s in each suit. One of each Wind. Any Wind paired. No Dragons. Exposed." |
| 43 | THREE SISTERS | `LIMIT (if all tiles from wall except last)` / `HALF LIMIT (Pungs from discard)` | `3B×3`, `3C×3`, `3O×3`; `E`, `S`, `W`, `N`, one extra Wind. | `[I p. 55]` | "Pungs or Kongs of 3s in each suit. One of each Wind. Any Wind paired. No Dragons. Exposed." |
| 44 | GREEN JADE | `LIMIT` | `發×3`; `1B×3`, `4B×3`, `7B×3`; `8B×2`. | `[I p. 56]` | "Pung of Green Dragons. 3 Pungs and a Pair of Bamboos. No Winds. Exposed." |
| 45 | RED CORAL | `LIMIT` | `中×3`; `3O×3`, `5O×3`, `8O×3`; `9O×2`. | `[I p. 56]` | "Pung of Red Dragons. 3 Pungs and a Pair of Characters. No Winds. Exposed." |
| 46 | WHITE OPAL | `LIMIT` | `白×3`; `4C×3`, `6C×3`, `7C×3`; `9C×2`. | `[I p. 56]` | "Pung of White Dragons. 3 Pungs and a Pair of Circles. No Winds. Exposed." |
| 47 | FIVE ODD HONOURS | `HALF LIMIT` | `發`, `中`, `S`, `W`, `N` (five different honours); run `1O-2O-3O-4O-5O-6O-7O-8O-9O`. | `[I p. 56]` | "Five odd Honours, Winds and Dragons. No Pair. 1–9 in any one suit. Concealed (except last tile)." |
| 48 | HACHI BAN | `LIMIT` | Run `1B-2B-3B-4B-5B-6B-7B-8B`; pairs `E×2`, `S×2`, `W×2`. | `[I p. 57]` | "A sequence of 8 tiles in any one suit (1–8 or 2–9). Three Pairs of Winds or three Pairs of Dragons. Concealed (except last tile)." |
| 49 | CONFUSED GATES | `LIMIT` | `1O×3`; `9B×3`; run `2C-3C-4C-5C-6C-7C-8C`; extra tile 2–8 (illustration uses a blank "Any tile 2–8 paired" card). | `[I p. 57]` | "A Pung of 1s in any one suit. A Pung of 9s in a second suit. A sequence of 2–8 in a third suit. Any 2–8 paired. No Winds or Dragons. Concealed (except last tile)." |
| 50 | CHOW MEIN | `LIMIT` | Chows `7B-8B-9B`, `7C-8C-9C`, `7O-8O-9O`; `E`, `S`, `W`, `N`, one extra Wind. | `[I p. 58]` | "Chow 7,8,9 in each suit. One of each Wind. Any Wind paired. No Dragons. Concealed (except last tile)." |
| 51 | CHOP SUEY | `LIMIT` | Chows `1B-2B-3B`, `1C-2C-3C`, `1O-2O-3O`; `E`, `S`, `W`, `N`, one extra Wind. | `[I p. 58]` | "Chow 1,2,3 in each suit. One of each Wind. Any Wind paired. No Dragons. Concealed (except last tile)." |
| — | ALL KONG | `Limit` | Four Kongs and one Pair, all in one suit; either Winds, Dragons or both may be included. No illustration. | `[I p. 30]` | Printed only in the "Special hands" list: "Four Kongs and one Pair, all in one suit. Either Winds, Dragons or both may be included." |
| — | MIXED PUNG | `Limit` | Four Pungs and a Pair in any of the three suits; either Winds, Dragons or both may be included. Every tile including the last drawn from the wall. No illustration. | `[I p. 30]` | Printed only in the "Special hands" list. |
**Notation.** `B` bamboo, `C` circles, `O` characters. `1B` is rank 1 bamboo.
`×2` pair, `×3` pung, `×4` kong; `1B-2B-3B` a chow. Winds `E S W N`; dragons
`發` (green), `中` (red), `白` (white). "extra" is the fourteenth tile for a hand
whose caption says "any tile paired".

# Part III — Companion extensions

*The Mah Jong Player's Companion* (Patricia A. Thompson and Betty Maloney,
Kangaroo Press, 1997) is the supplement. This part records **only what the
Companion adds** to Parts I and II, and where it overrides Part II. The
Illustrated book wins every conflict about the rules of play; the Companion
wins the conflicts about a hand's tier, composition and fishing figure
(owner ruling, 2026-11-11, §1). The Companion readings of play rules that
differ are listed in `rules/AUDIT.md` under "Catalogue and Part III
conflicts" and are not applied here.

Page tags `[C p. N]` are the Companion's **printed** pages. The render
`rules/pages/companion/pNN.jpg` is the spread of printed pages `2NN-4` and `2NN-3`
(so `p04.jpg` is printed pp. 4-5, `p30.jpg` is pp. 56-57).

## 1. The tier ladder

The Companion prints four tiers with a fishing figure for each `[C p. 4]`:

| Tier | Winning | Fishing |
|---|---:|---:|
| Half limit | 500 | 200 |
| Limit | 1000 | 400 |
| Middle limit | 1500 | 600 |
| Double limit | 2000 | 800 |

> "This book introduces a new level of scoring, positioned between Limit and
> Double Limit. It is called the Middle Limit and scores 1500 points. The
> fishing score for a Double Limit has been under review and now scores 800
> points (i.e. two-fifths of a Double Limit). New scores are indicated in bold
> type." `[C p. 4]`

### How this reconciles with Parts I and II

The owner ruled on 2026-11-11 that **the Companion governs the special-hand
catalogue**: for a hand both books print, the Companion's tier, composition and
fishing figure are used, in every game and whichever hands are in play (§5).
The Illustrated book still states the game itself and is the only source for
the three hands the Companion does not print.

- **Fishing figures** are the Companion's: half 200, limit 400, middle 600,
  double limit **800** `[C p. 4]`. The Illustrated 500 for a double limit
  `[I p. 32]`, Part I R69, is superseded for the catalogue (AUDIT C9).
- **Middle limit** is used for every hand the Companion prints at 1500: Odds &
  Evens, Numbers in Parallel, Numbers Doubled and Dragon's Run, and the five
  hands the Illustrated book prints lower: Three Great Scholars (C p. 33,
  exposed allowed; I p. 49 LIMIT), Four Blessings (C p. 30, exposed allowed; I
  p. 49 LIMIT), Civil War (C p. 30, exposed allowed; I p. 53 DOUBLE LIMIT),
  Chinese Odds (C p. 49, exposed allowed; I p. 40 LIMIT) and Sparrow's
  Sanctuary (C pp. 21 and 49, concealed; I p. 44 LIMIT) (AUDIT C8).
- **All Pair Jade** `[C pp. 23, 32]`: "GG or GG/GG + five or six pairs of Green
  Bamboos (2, 3, 4, 6, 8)": one green-dragon pair with six bamboo pairs, or two
  with five. The Illustrated book prints only the first shape `[I p. 44]`.
- Every other hand both books print was compared on its tier, composition and
  fishing figure and agrees. The comparison read the Companion's synopsis for
  all of them and the hand pages for All Pair Jade, Three Great Scholars,
  Hachi Ban, Sparrow's Sanctuary, Chinese Odds, Civil War and Four Blessings;
  concealed/exposed wording on the other hand pages was not compared line by
  line.
- The Companion's tier names are otherwise the Illustrated ones.

## 2. The Companion-only hands

The 35 entries that `rules/AUDIT.md` lists as "not printed in this book",
with their printed composition, printed tier and page. Thirty-four are
distinct printed hands; Big Robert has two scoring variants and therefore two
table ids. `N/I` means the Companion prints the hand in its synopsis but does
not illustrate it `[C p. 4: N/I = Not Illustrated]`.

| Table id | Companion name | Printed composition | Printed tier (winning / fishing) | Page | Note |
|---|---|---|---|---|---|
| `chow-chow` | Chow Chow | Four chows + pair, all one suit; every tile from the wall including the last. | HALF LIMIT (500 / 200) | `[C p. 15]` | "All tiles from wall—INCLUDING LAST" — table `requiresSelfDrawn: true` is correct. |
| `guardian-winds` | Guardian Winds | Run 1–9 in one suit + pung/kong of Winds + pair of Winds. | LIMIT (1000 / 400) | `[C p. 10]` | Concealed. |
| `wriggly-dragon` | Wriggly Dragon | Run 1–9 in one suit + one of each Dragon (green, red, white) + pair of Dragons. | LIMIT (1000 / 400) | `[C p. 11]` | Also synopsis p. 31. |
| `guardian-dragons` | Guardian Dragons | Run 1–9 in one suit + pung/kong of Dragons + pair of Dragons. | LIMIT (1000 / 400) | `[C p. 10]` | "As Guardian Winds ... with Run 1-9, Pung/K Dragons and Pair Dragons." |
| `grand-sequence` | Grand Sequence | Run 1–9 in one suit + any two tiles 1–9 paired (a suited pair) + pung/kong of Winds or Dragons. | LIMIT (1000 / 400) | `[C p. 11]` | Two illustrations, p. 40; same shape. |
| `dragons-gates` | Dragon's Gates | All one suit: run 2–8 + any tile 2–8 paired + pung/kong of 1s or 9s + pung/kong of the corresponding Dragon. | LIMIT (Concealed 1000 / 400) / HALF LIMIT (Exposed 500 / 200) | `[C p. 12]` | Corresponding Dragon: Bamboo–Green, Characters–Red, Circles–White. |
| `dragons-teeth` | Dragon's Teeth | Run 1–7 or 2–8 in Characters or Circles + any tile 1–7 or 2–8 paired + pung/kong White Dragons + pung/kong Red Dragons. | LIMIT (Exposed 1000 / 400) | `[C p. 12]` | Also p. 33; no half-limit printed. |
| `yin-yang` | Yin Yang | `11 / 234 / 55` in one suit; `55 / 678 / 99` in another suit. | LIMIT (Concealed 1000 / 400) | `[C p. 14]` | Also p. 50. |
| `big-robert` | Big Robert | Three runs of four tiles, one in each suit + pair of Winds or Dragons; the same four numbers in all three runs. | LIMIT (Concealed 1000 / 400) | `[C p. 14]` | The page: "LIMIT for same numbers (Otherwise) HALF LIMIT (Concealed)". |
| `big-robert-mixed` | Big Robert | The same hand with the three runs not all using the same numbers. | HALF LIMIT (Concealed 500 / 200) | `[C p. 14]` | Table's second id for the same printed hand. |
| `moon-at-bottom-of-well` | Moon at Bottom of Well | All Circles: four chows — 123, 456 and 789 in ascending order, plus any fourth Circle chow — + pair of Circles. | LIMIT (Concealed 1000 / 400) | `[C p. 15]` | Also pp. 47 and 60. Illustration: 123, 456, 789, 123, 44. |
| `three-philosophers` | Three Philosophers | Chow in each suit + one mixed chow (three consecutive numbers, one from each suit) + pair in any suit. | LIMIT (Concealed 1000 / 400) | `[C p. 15]` | |
| `crazy-chows` | Crazy Chows | Four mixed chows + mixed pair (same number in two suits). | HALF LIMIT (Concealed 500 / 200) | `[C p. 16]` | Illustration: 456, 234, 678, 123 mixed chows; pair 6B + 6C. |
| `little-robert` | Little Robert | Chow in each suit + pung/kong in any suit + pair in any suit. | HALF LIMIT (Concealed 500 / 200) | `[C p. 16]` | Printed "Pung/K in any suit" and "Pair any suit". A suit is Bamboo, Characters or Circles (R-002 category 1), so the pung and the pair are suited: no Winds or Dragons. Illustration: 567 C, 456 O, 234 B chows; 333 O pung; 22 B pair. |
| `hovering-angel` | Hovering Angel | Chow in each suit + pung/kong of own Wind + pair of Dragons. | LIMIT (Concealed 1000 / 400) | `[C p. 17]` | Also p. 41. |
| `little-brother` | Little Brother | Chow in each suit + another chow in any suit + pair of own Wind. | HALF LIMIT (Concealed 500 / 200) | `[C p. 17]` | |
| `apple-blossom` | Apple Blossom | Three mixed chows + pung/kong of White Dragons + pair of Green Dragons. | LIMIT (Concealed 1000 / 400) | `[C p. 19]` | Also p. 33. |
| `professors` | The Professors | Three mixed chows + one of each Dragon + pair of own Wind. | HALF LIMIT (Concealed 500 / 200) | `[C p. 19]` | |
| `seven-twins` | Seven Twins | Seven pairs of any tiles; every tile from the wall including the last. | HALF LIMIT (Concealed 500 / 200) | `[C p. 22]` | Table `requiresSelfDrawn: true` is correct: "INCLUDING LAST" means the last tile is self-drawn (a loose tile counts), so the hand can never be completed by a claim (discard or robbed kong). `[A]` Owner ruling: a kong (four of a kind) counts as two pairs; the page is silent. |
| `dragonette` | Dragonette | Three pairs in one suit (no 1s or 9s) + one of each Wind + one of each Dragon + one Wind or Dragon paired. | LIMIT (Concealed 1000 / 400) | `[C p. 24]` | **Correction:** the page says "Any Wind or Dragon paired"; the table pairs a Dragon only. Allow the extra honour to be a Wind or a Dragon. |
| `windvane` | Windvane | One of each Wind + one Wind paired + pung/kong in each suit. | LIMIT (Concealed 1000 / 400) | `[C p. 28]` | |
| `golden-gates` | Golden Gates | All one suit: pairs 2,2 / 4,4 / 6,6 / 8,8 + pung/kong of 1s or 9s + pung/kong of the corresponding Dragon. | LIMIT (Concealed 1000 / 400) / HALF LIMIT (Exposed 500 / 200) | `[C p. 25]` | Also p. 34; Dragon correspondence as above. |
| `sunrise` | Sunrise | Pung/kong of East Winds + pair of White Dragons + pung/kong in each suit, no 1s or 9s. | LIMIT (Concealed 1000 / 400) / HALF LIMIT (Exposed 500 / 200) | `[C p. 42]` | |
| `sunset` | Sunset | Pung/kong of West Winds + pair of Red Dragons + pung/kong in each suit, no 1s or 9s. | LIMIT (Concealed 1000 / 400) / HALF LIMIT (Exposed 500 / 200) | `[C p. 42]` | |
| `ods-evens` | Odds & Evens | The five odd numbers in two suits + the four even numbers in the third suit, one tile of each number (10 + 4 = 14). | 1500 / 600 (middle limit) | `[C p. 60]` | N/I. The synopsis prints the figures, not the tier word; middle by the p. 4 ladder. Concealed: the synopsis row has no red dot `[C p. 4]`. |
| `robin` | Robin | Chow in the first suit + two chows in the second suit + chow and pair in the third suit. | 500 / 200 (half limit) | `[C p. 60]` | N/I. Concealed: the synopsis row has no red dot `[C p. 4]`. |
| `blue-mountains` | Blue Mountains | Pung/kong of Green Dragons + three pung/kongs + pair of blue Circles (2, 3, 4, 5, 8, 9). | 1000 / 400 (limit) | `[C p. 60]` | N/I. |
| `white-elephant` | White Elephant | Pung/kong of White Dragons + three pung/kongs + pair of even Circles (2, 4, 6, 8). | 1000 / 400 (limit) | `[C p. 60]` | N/I. |
| `driven-snow` | Driven Snow | Pung/kong of White Dragons + three pung/kongs + pair of odd Characters (1, 3, 5, 7, 9). | 1000 / 400 (limit) | `[C p. 60]` | N/I. |
| `dragons-scales` | Dragon's Scales | Pung/kong of Red Dragons + three pung/kongs + pair of even Characters (2, 4, 6, 8). | 1000 / 400 (limit) | `[C p. 60]` | N/I. |
| `up-you-go` | Up You Go | One of each Wind + 2, 44, 666, 8888 in one suit; the 8888 kong is concealed. | DOUBLE LIMIT (2000 / 800) | `[C p. 57]` | N/I. The 800 is the Companion's double-limit fishing figure; see §1. Concealed: the synopsis row has no red dot `[C p. 4]`. |
| `down-you-go` | Down You Go | One of each Wind + 2222, 444, 66, 8 in one suit; the 2222 kong is concealed. | DOUBLE LIMIT (2000 / 800) | `[C p. 57]` | N/I. The table note says "8888" by mistake; the printed kong is 2222, which the predicate already uses. Concealed: the synopsis row has no red dot `[C p. 4]`. |
| `numbers-in-parallel` | Numbers in Parallel | Pung/kong and pair of Dragons or Winds + pung/kong of the same number in each suit, no 1s or 9s. | MIDDLE LIMIT (Exposed 1500 / 600) | `[C p. 43]` | |
| `numbers-doubled` | Numbers Doubled | Pair of Winds or Dragons + two pung/kongs of each of two numbers in each of two suits, no 1s or 9s. | MIDDLE LIMIT (Exposed 1500 / 600) | `[C p. 43]` | |
| `dragons-run` | Dragon's Run | Run 1–9 in one suit + one of each Dragon + pair of Winds. | 1500 / 600 (middle limit) | `[C p. 59]` | N/I. Distinct from Wriggly Dragon (1000 / 400). Concealed: the synopsis row has no red dot `[C p. 4]`, so a chow claimed for the run forfeits the hand. |

**Corrections to `src/core/patterns/table.ts` settled by these pages**

- `dragonette`: the paired honour may be a Wind or a Dragon (C p. 24). The
  table's `singleGroup(isDragon)` is too narrow; the Companion's synopsis says
  "ESWN + GRW (one paired)" (C p. 58).
- `down-you-go`: note text says the 8888 kong; the printed hand is 2222
  (C p. 57). The predicate already uses 2222.
- The Companion pages settle the provisional readings of `moon-at-bottom-of-well`
  (C pp. 15, 47: four Circle chows, three ascending, pair Circles),
  `crazy-chows` (C p. 16: pair 6B + 6C), and `white-elephant`, `driven-snow`,
  `dragons-scales` (C p. 60: three pungs, pair restricted by parity/suit).
  Their compositions match; the `provisional` flags can be cleared.
- No Companion-only hand needs a tier change: all 35 table tiers match the
  printed figures. The only tier conflict is the middle-limit group of
  Illustrated hands in §1 (AUDIT C8).

## 3. Other Companion additions to play

These are additions where Parts I and II are silent; none overrides an
Illustrated rule.

### 3.1 Notation and corresponding dragons `[C p. 4]`

The Companion's shorthand, for reading its catalogue:

| Abbreviation | Meaning |
|---|---|
| P/K or Pung/K | Pung or Kong |
| Pr | Pair |
| N/I | Not Illustrated |
| L | Limit |
| ESWN | one of each Wind |
| GRW | one of each Dragon (W = white) |

> "Corresponding Dragons: Red Dragon — Characters; Green Dragon — Bamboo;
> White Dragon — Circles" `[C p. 4]`

This correspondence is what Dragon's Gates and Golden Gates use.

### 3.2 Settlement by units `[C p. 55]`

The Companion offers a simplified points-to-units payment table for the
ordinary, Purity and All Honour hands, whose scores are calculated as in the
Illustrated book (pp. 24-26):

> "Payments are made at the end of each hand and the following point score
> system does this simply. Limit is set at 1000 points." `[C p. 55]`

| Points | Pay | Fishing |
|---|---|---:|
| 50–150 | 1 unit | — |
| 150–250 | 2 units | — |
| 250–350 | 3 units | — |
| 350–450 | 4 units | — |
| 450–550 | 5 units | 2 units |
| 550–650 | 6 units | — |
| 650–750 | 7 units | — |
| 750–850 | 8 units | — |
| 850–950 | 9 units | — |
| 950+ | 10 units | 4 units |

The same page allocates 16 000 points of counters exactly as Part I R96 does:
one red (4000), seven blue (7 × 1000), eight green (8 × 500), ten yellow
(10 × 100).

### 3.3 Optional Goulash variants `[C p. 55]`

The Companion suggests, without changing Part I's Goulash procedure:

1. "Goulash may be played as a warm-up at the start of a game. Each player puts
   a 100 point counter in the kitty for the winner."
2. "Playing into the box: The last hand may be played as a Goulash hand, with
   the tiles gradually placed in their trays as the game proceeds."
3. "When the Wind of the Round is West, this round may be played as a Goulash
   round."
4. "No half-limit hands are permitted during a Goulash."

All four are optional table agreements. They do not alter Part I's rule that a
Goulash follows a drawn hand; §4 lists the Companion sentence that does, and
why it is not applied.

Item 4 is a house rule at this table, **on by default** (owner ruling,
2026-11-13, after a tester report): in a Goulash hand nothing that scores at
half limit is a win or a fishing hand; tiles that also make another hand score
as that hand. A hand that is half limit only when exposed (for example Dragon's
Tail, C p. 12) still counts concealed, at limit. The table may turn the rule
off. `[A]` (ASSUMPTIONS.md, "No half-limit hands in a Goulash")

### 3.4 Showing that you are fishing `[C p. 55]`

> "Many players display a small fish (not real!) to indicate that they are
> fishing; this must be done if a fishing score is to be claimed." `[C p. 55]`

Only the fact of fishing is shown, not the wait. Part I (R67) prints no
announcement of its own, so this display is how a fishing score is claimed.

### 3.5 Drawing and discarding `[C pp. 63-64]`

- Draw only after the previous discard is face up:
  > "A player may not draw a tile from the wall until the previous players
  > discard has been made—face up and in full view of the other players. Tiles
  > must be drawn from the wall in their correct sequence. If any player draws
  > the wrong tile from the wall, it must be returned to its correct position."
  > `[C p. 64]`
- Miscalling a discard:
  > "There is no penalty for miscalling a discard but it should not be done
  > deliberately. To avoid disclosing any combination of tiles concealed in the
  > hand players should wait until the discarded tile is placed on the table,
  > face up, before a Pung or Chow is made." `[C p. 63]`
- An exposed combination laid down wrongly:
  > "the error should be corrected prior to the next player's discard. If the
  > mistake is not corrected at this time, the hand containing the irregular
  > combination is then considered dead." `[C p. 64]`
- A too-hasty draw:
  > "Should a player draw from the wall before or after the preceding player
  > has relinquished their discard, said player is committed to this draw and
  > may not claim the discarded tile. If another player requires the discarded
  > tile, he may take it up and the too-hasty player must replace the tile in
  > the wall." `[C p. 64]`

The Companion's sentence allowing a declared Pung or Chow to be changed and a
tile drawn instead contradicts Part I R52 and is listed in AUDIT C7; it is not
adopted here.

### 3.6 Concealed Kong house rule `[C p. 63]`

The Companion records an optional club rule:

> "It is provoking to conceal a Kong and if this is unacceptable, then implement
> the House Rule; this allows a Kong to be concealed only until a further
> exposed Pung is made (in that same hand). The concealed Kong must then be
> exposed—it still scores as a concealed Kong, of course." `[C p. 63]`

Part I's default (R57, R66: the kong is laid down with the two middle tiles
face down, and full concealment requires agreement before play) governs unless
the table adopts this house rule.

### 3.7 Several tables `[C p. 55]`

> "When several tables are playing, a bell is rung at a pre-arranged time and
> East and West Winds move on to the next table." `[C p. 55]`

A tournament movement convention; it does not change the four-player table
rules.

## 4. Companion statements not applied

These Companion statements conflict with Part I or Part II and are recorded in
`rules/AUDIT.md` (C1-C9), not applied:

- Goulash is **not** played after a drawn hand `[C p. 62]`; Part I R74 says it
  is.
- East plays only once per round regardless of a win `[C p. 55]`; Part I R30
  keeps East on a win.
- A bouquet may be saved for three doubles instead of the immediate payment
  `[C p. 63]`; Part I R72 makes the payment immediate.
- No cleared-suit double in the Western game `[C p. 63]`; Part I R25(f) and
  R91(j) award it.
- No all-one-suit double when fishing `[C p. 55]`; Part I R71 scores the
  fishing hand as p. 24 less only the 20-point bonus.
- A declared Pung or Chow may be changed and a tile drawn instead `[C p. 64]`;
  Part I R52 requires the discard.
- Middle limit 1500 for five hands the Illustrated book prints at limit or
  double `[C pp. 30, 52, 58, 59]`; the Illustrated tier governs.
- Double-limit fishing 800 for Illustrated hands `[C p. 4]`; the Illustrated
  figure is 500.
- No player may win with the same hand in consecutive games `[C p. 62]`;
  Part I R105 permits the same Special Hand for up to two consecutive turns.

## 5. House rules of this table

Neither book prints these. They are options a table may switch on; with every
one off, the game is exactly Parts I-III. A hand keeps the rules it was dealt
under: a change takes effect with the next deal.

- **Which hands are in play** `[A]`. One of three sets, each the one before
  it with more left out. A left-out hand is no winning hand, no wait and no
  fishing hand for any player, and it is not hinted. Tiles that also make
  another hand in play score as that hand; tiles that make only a left-out
  hand (four pungs across three suits, say) are not Mah Jong. Nothing else
  changes: the Illustrated tiers, fishing figures and rules of play of
  Parts I-III still govern.
  1. **All hands** (the default): every hand either book prints, with or
     without a sample picture. This is Parts I-III as written.
  2. **Companion hands**: the Companion's catalogue. Left out are the three
     hands only the Illustrated book prints: Concealed Mah Jong (Buried
     Treasure) `[I p. 38]`, All Kong and Mixed Pung `[I p. 30]` (`rules/AUDIT.md`,
     "Missing from the table"). Every other Illustrated hand is also in the
     Companion's short list, synopsis and hand pages (checked page by page).
  3. **Companion hands with pictures**: set 2 less the nine hands the
     Companion's synopsis marks "N/I" `[C p. 4]`, printed without a sample
     picture: Up You Go, Down You Go `[C p. 57]`, Dragon's Run `[C p. 59]`,
     Odds & Evens, Robin, Blue Mountains, White Elephant, Driven Snow and
     Dragon's Scales `[C p. 60]` (Part III §2). Twelve hands in all are left out.

  Whichever set is chosen, the values are the Companion's (§1). In the
  Companion sets the app also shows no Illustrated page reference and no
  Illustrated page citation in a payment's explanation: a table that chose the
  Companion has no use for the other book. The ground score, doubles and
  payments themselves are still computed by the Illustrated book's rules.

  In the table: `illustratedOnly` and `companionUnillustrated` on the pattern,
  `HAND_SET_EXCLUDED` for the sets, `excludedHands` on the game,
  `pages` (by book) for the page references.

# Appendix — evidence

- `rules/archive/PRIMARY-RULES.md` — the raw Milestone A extraction (this framework's
  Part I is that text, renumbered, unchanged).
- `rules/AUDIT.md` — conflicts with `rules/archive/PLAY.md`, `rules/archive/ASSUMPTIONS.md` and
  the engine; Milestone C work list.
- `rules/archive/SOURCE-AUDIT.md` — the audit plan, spread map and evidence rules (completed).
- `rules/SOURCE.md` — source precedence and how to read a page.
