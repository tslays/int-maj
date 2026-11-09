# Road to alpha-1

**Goal:** a build the owner can hand to a few members of the mahjong club to
play on their own iPhones, with a way for them to tell us what went wrong.
**Demo:** Wednesday 2026-11-11, morning. **Planned Monday 2026-11-09, afternoon.**
Release name: `v0.1.0-alpha.1` (a GitHub pre-release).

> Naming: `docs/PLAN.md` already calls the finished offline build "Alpha 1".
> That was the prototype. From here on **alpha-1 means the tester release
> below**, and PLAN's "Alpha 2" to "Alpha 4" items are sorted into it or
> after it by this document. PLAN.md gets renamed when this plan is accepted.

## Definition of done

Alpha-1 ships when all of these are true:

1. A tester can open the link, install it from Safari, and play a whole game
   (East round to North round) against three bots without help beyond a
   one-page guide.
2. The game ends on a final-standings screen, not just a last result card.
3. The app shows which build it is (`alpha.1` and a short commit id), so a
   report names the build it came from.
4. "Report a problem" produces a text a tester can send us (build, device,
   seed and every decision), and `bin/replay.ts` replays it exactly.
5. `main` is green, the 300-hand soak is green, and the install, airplane-mode
   and update-resumes-the-hand checks passed on a real iPhone.
6. `v0.1.0-alpha.1` is tagged on `main` with release notes (what to test,
   known limits).

Everything else is **not** alpha-1.

## What is where today (so we do not redo it)

Done and live: offline play, saving with a checkpoint per hand, install from
Safari, sound, claims/kongs/fishing/Goulash, undo, the result card with the
book's arithmetic, bots that plan towards hands, the closest-hands helper
with a tap-in sheet, and CI that deploys every green push to `main`.
`session.ts` already knows `gameOver` and keeps the full step log "for
reports". The game's end today is the last hand's result card with a "New
game" button: no final standings.

## How to organise it

One tracker, no duplicates. Chunks are sized to **one cloud session = one pull
request**, which is how `docs/WORKFLOW.md` already works.

| Thing | Use | Why |
| --- | --- | --- |
| Milestone `v0.1.0-alpha.1` | **yes**, the progress bar | GitHub shows closed/open and a percentage with no upkeep. This is the "track against the road" answer. |
| Issues | **yes**, one per chunk below, each holding the full brief and its acceptance check | A session prompt becomes "do #N"; the brief is read once, not re-typed. |
| Labels | `alpha-1`, `must` / `should`, `owner-task` (needs the owner or a real phone), `from-testing` (later tester findings) | Filtering for the cut line takes one click. |
| Pull requests | **not pre-made**; each session opens its own with `Closes #N` | Merging closes the issue and moves the milestone. An empty PR per task is noise. |
| A Projects board | **no** | Needs upkeep and adds nothing over the milestone for one person and ten issues. |
| This file | scope, order and rules only; **no checkboxes** | Status lives in the milestone, so there is nothing to keep in sync. |

To see status: open the milestone, or ask a session "status of milestone
`v0.1.0-alpha.1`" (it reads it through the GitHub tools).

## The work, in order

Size is relative cost: **S** a short session, **M** a normal one. Nothing is
larger; if a chunk grows past M, split it before starting.

Chunk numbers below map to GitHub issues (milestone `v0.1.0-alpha.1`):
#1 = issue 38, #2 = 39, #3 = 40, #4 = 41, #5 = 42, #6 = 43, #7 = 44, #8 = 45.

### Must (alpha-1 does not ship without these)

| # | Chunk | Size | Notes |
| --- | --- | --- | --- |
| 1 | **iPhone pass** (owner task) | 30 min | Install, play two hands, airplane mode, lock/unlock mid-hand, rotate, redeploy and reopen. Checklist below. Output: findings as issues labelled `from-testing`. Do this **first**: it decides the *should* list. |
| 2 | **Version label** | S | `package.json` to `0.1.0-alpha.1`; the build stamps the short commit id; shown small in the menu and included in every report. |
| 3 | **Tester guide** | S | Docs only: a short in-app help sheet (discard, call, hints, sound, how to report) plus a message template the owner can paste to the club. Lists known limits (bots only, no house rules, Crazy Chows is common in bot wins). Parallel-safe with #2. |
| 4 | **Report a problem** | M | Menu button builds the text (build, user agent, seed, decisions) and opens the iOS share sheet, falling back to the clipboard. No server, no account. Test: a produced report replays to the same state through the replay tool. |
| 5 | **Final standings screen** | M | After the North round: ranked scores, a winner line, "New game". Pure data from the existing `gameOver` flag and ledger; test in `test/app/`. |
| 6 | **Release gate** (owner + one S session) | S | Run the soak workflow on `main`; repeat the iPhone install/airplane/update checks on the final build; tag, write notes, publish the pre-release. |

### Should (only if #1 shows tester pain and the budget allows)

| # | Chunk | Size |
| --- | --- | --- |
| 7 | **Whose turn and who threw it**, readable at a glance (PLAN "Alpha 2") | M |
| 8 | **Fixes from the iPhone pass**: one triage session that batches what #1 found, not one session per nit | M |

### Not in alpha-1 (decided now, so nobody is tempted)

Hand catalogue browser, deal animation, beginner/intermediate/advanced
settlement as a setting (the guide states which one the engine uses), bot
tuning, a separate tester URL, multiplayer, accounts, anything cosmetic no
tester asked for.

## Schedule

Times are soft; the order is not.

| When | What |
| --- | --- |
| **Mon afternoon** | Accept this plan. Create the milestone, then the issues. Owner starts #1 on the phone. Start #3 and #2 in parallel (different files). |
| **Mon evening** | Merge #2, #3. Start #4. Read #1's findings and decide which *should* items are in. |
| **Tue morning** | Merge #4. Start #5. |
| **Tue noon** | **Cut line:** look at the usage meter. Anything not started and not a *must* is dropped, whatever the state of the list. |
| **Tue afternoon** | Merge #5, then #7/#8 if kept. **Feature freeze at about 16:00.** |
| **Tue evening** | #6: soak, a real-iPhone check of the final build, tag, notes. |
| **Wed morning** | Two hours of buffer, then the demo. Only revert or one-line fixes. |

## Spending the weekly budget

I cannot see your remaining usage, so this plan is built to be cut, not to
fit an unknown number. The habits that keep it cheap:

- **One chunk, one session, then end it.** Context cost compounds in a long
  chat. The brief is in the issue, so the opening prompt is "Do #N, deliver
  per WORKFLOW.md".
- **Order by dependency, run in parallel only across different files.**
  `app/src/main.js` (1,042 lines) and `app/index.html` are the hot spots:
  #4 and #5 both touch them, so they run one after the other, never together.
- **Sessions read only the files the issue names.** No sweeps of `rules/`;
  alpha-1 changes no rules.
- **`npm test` once before the pull request**, not after every edit. No
  screenshot loops for non-visual work.
- **Batch the phone findings** into one triage session (#8).
- **Reserve a tail:** about 20% of what remains stays unspent for Wednesday's
  surprises and the tag.

## Releasing on GitHub

- Tag `v0.1.0-alpha.1` on `main`, mark it **pre-release**, put the tester
  notes in the release body. The artefact is the hosted app
  (https://int.mah-jong.workers.dev); there is nothing to download.
- **The repository is private (the book pages are copyrighted), so testers
  cannot see the GitHub release.** It is the owner's record and changelog.
  Testers get the link and the guide by message, and send reports back by
  message. Do not make the repository public to fix this.
- **One URL moves under the testers.** Every green push to `main` redeploys
  it and installed copies update on next launch. During the test window merge
  only fixes you would want testers to have. Splitting a stable tester URL
  from a development URL (deploy on tag) is a good alpha-2 chunk, not now.

## iPhone pass checklist (#1)

1. Open the live link in Safari, Add to Home Screen, launch it from the icon.
2. Play two hands: tap sizes, lifting and swiping a tile, claim buttons
   reachable with a thumb, result card readable, pace of the bots.
3. Lock the phone mid-hand, wait a minute, unlock: the same hand resumes.
4. Airplane mode, force-quit, reopen: it still starts and plays.
5. Rotate to portrait and back.
6. After the next deploy, reopen: it updates once and resumes the hand.
7. Note anything that made you hesitate, even if it worked.

## Risks

| Risk | Answer |
| --- | --- |
| iPhone pass finds a big problem | It is first on purpose. A bug that blocks a whole game outranks every *must* except #6. |
| Budget runs short | Cut line on Tuesday noon. The *musts* are 5 small or medium chunks; *shoulds* go first. |
| A merge breaks the live link during the demo | Feature freeze Tuesday 16:00, soak before the tag, buffer on Wednesday. |
| Testers cannot describe a problem | That is what #4 is for. |
| Cloudflare token | Valid until 2027-11-08; not a risk here. |

## Decisions the owner makes before work starts

1. Accept the name: alpha-1 is the tester release, the old "Alpha 1" is the
   prototype.
2. Accept the *not in alpha-1* list, in particular no tester/dev URL split.
3. Accept the Tuesday-noon cut line and the Tuesday-16:00 freeze.
4. Create the milestone `v0.1.0-alpha.1` in GitHub (Issues > Milestones > New);
   the available tools can attach issues to a milestone but cannot create one.
