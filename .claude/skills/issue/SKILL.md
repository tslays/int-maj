---
name: issue
description: Read and triage int-maj issues, above all the tester problem reports (label `report`) - read the report block, ALWAYS fetch and look at every photo it names from the private R2 store, replay the game, check whether it is already fixed, and sort it. `/issue 214` handles that one issue (several numbers allowed); `/issue` with no number handles every open issue.
argument-hint: "[issue number ...]"
---

# Read and triage issues

`$ARGUMENTS` says what to work on:

- **One or more numbers** (`214`, or `214 215`, or `#214`): only those
  issues, open or closed. Ignore every other issue.
- **Empty:** every issue that is **not closed**, report or not. List them
  with `mcp__github__list_issues` (`owner` `tslays`, `repo` `int-maj`,
  `state` `OPEN`, `perPage` 20, `fields` `["number","title","labels"]`).
  If `pageInfo.hasNextPage` is true, fetch the next page with `after`. Work
  through them oldest (smallest number) first.

This skill only **reads and reports**. Do not comment on, label, close or
edit an issue, and do not start fixing code, unless the owner asks for it
after reading your triage.

## The golden rule: photos are not optional

A report issue may name up to three photos. They are kept in a **private**
Cloudflare R2 bucket and never appear in the issue as images, only as keys.
The photo usually shows the problem better than the note does.

**You must fetch and open every photo an issue names before you say anything
about that issue.** Never sort a report "from the note alone", never write
"the photo is not accessible" without having run the script below, and never
skip photos to save time. If a photo cannot be fetched, the triage for that
issue says so in its first line and stops short of a verdict.

## Step 0: start clean

```bash
cd "$CLAUDE_PROJECT_DIR" && git pull --ff-only
```

If the session has a scratchpad directory, use it for every file below by
setting `ISSUE_DIR` to `<scratchpad>/issues`; otherwise the default
`/tmp/int-maj-issues` is fine. Never save photos or report files inside the
repository.

## Step 1: read the issue

For each issue number `N`:

1. `mcp__github__issue_read` with `method` `get`, `owner` `tslays`,
   `repo` `int-maj`, `issue_number` N.
2. `mcp__github__issue_read` with `method` `get_comments` (same ids,
   `perPage` 30). The owner often adds context or rulings in comments.

### What a report issue looks like

The title is `Report: <the tester's note> [<version> <build>]`. The body is,
in this order:

````
Sent with the app's Report button. To replay it, ...

```text
int-maj problem report
Version: 0.1.0-alpha.20          <- the release the tester ran
Build: 84202d6                   <- the commit it was built from
User agent: ...                  <- device: "iPad"/"iPhone"/"Macintosh"...
Hand: 13 (discard)               <- hand number and phase when sent
Goulash: no (...)
House rules: hand set all, ...   <- the rules in force in this hand
Decisions: 1870 (yours: 453)
Settings: bot level medium, pace faster, ... sort off
Pinned hands: none
Rules chosen: ...
Note: <the tester's own words: THE PROBLEM>

-----BEGIN REPLAY-----            (or -----BEGIN REPLAY GZIP----- for long
{ ...json... }                     games: base64 lines, unpacked by replay)
-----END REPLAY-----
```

Photo 1 of 2, in the private store (not public): `c80d5bc1-190d-44ac-9fd5-584cef6713f5`

Photo 2 of 2, in the private store (not public): `0b6f...`
````

Read these fields out and write them down before going further:

| Field | Where |
| --- | --- |
| Note | the `Note:` line. `(none)` means the tester wrote nothing: the photos are then the only description. |
| Version, Build | `Version:` and `Build:` lines |
| Device | from `User agent:` (iPhone, iPad, Mac, Android, Windows) |
| Hand / phase | `Hand:` line |
| House rules, Settings | their lines; a bug often turns on one of them |
| **Photo keys** | **every** line `Photo k of N, in the private store (not public): \`<key>\``. The key is the UUID between the backticks. Collect them **in order k = 1..N**. |

Check the photo count: the number of keys you collected must equal the `N`
in "of N". If the body has no `Photo` line at all, the report has no photos;
say "no photos" in the triage. Do not look for photos anywhere else: only the
Report button stores them, and only these lines name them.

An issue **without** the `report` label (a normal issue the owner wrote) has
no report block; read its body and comments, and if it still has `Photo k of
N` lines, fetch them the same way.

## Step 2: fetch every photo (mandatory)

Run the helper with the issue number and **all** keys, in order:

```bash
ISSUE_DIR=<scratchpad>/issues "$CLAUDE_PROJECT_DIR"/.claude/skills/issue/photos.sh 259 c80d5bc1-190d-44ac-9fd5-584cef6713f5
```

With three photos, pass three keys:
`photos.sh 214 <key-1> <key-2> <key-3>`.

What it does: `GET https://int-dev.mah-jong.workers.dev/api/report-photo/<key>`
for each key. That Worker route reads the private R2 bucket `int-maj`. The
session's network proxy adds the secret bearer token for that host by
itself: **do not** add an `Authorization` header, look for a token, or ask
the owner for one. The script saves `photo-<k>.jpg`, checks each is a real
JPEG and that no two keys return the same image, and prints the paths.

Then **open every listed file with the Read tool** and look at it. Describe
in one or two sentences what each photo shows (which screen, which tiles,
which panel or button, what looks wrong) and how it relates to the note.

If the script prints `FAIL` or `RESULT: FAILED`:

| Message | Meaning and what to do |
| --- | --- |
| `not a photo key` | You passed something that is not the UUID. Re-read the `Photo` lines and pass only the text between the backticks. |
| `HTTP 404` | The key does not exist, the photo expired (they are kept 30 days), or the proxy sent no token. Run the script once more; if it is still 404, report it: "photo k could not be fetched (404)". Do **not** try the `int` site instead: it has its own token and its 404 proves nothing. |
| `HTTP 403`, `HTTP 000`, timeout, proxy error | The network blocked it. Report it with the exact message; the owner must fix the environment's network secret for `int-dev.mah-jong.workers.dev`. |
| `the same image as photo j` | The store returned the wrong photo. Report it; do not sort the issue from the note alone. |

Never fall back to `wrangler`, the Cloudflare dashboard or a public bucket
URL: the bucket has no public access by design.

## Step 3: replay the game (reports with a hand problem)

For a report about the rules, a score, a call, a hint or a bot move, replay
it. Save the text **between** the ` ```text ` fence and the closing ` ``` `
fence, exactly as it is (every base64 line, no added spaces), with the Write
tool to `<ISSUE_DIR>/N/report.txt`, then:

```bash
npm run replay -- <ISSUE_DIR>/N/report.txt > <ISSUE_DIR>/N/replay.txt 2>&1; tail -20 <ISSUE_DIR>/N/replay.txt
```

The replay is long (every draw and discard), so never print it whole: use
`tail`, or `grep -n` for a tile or word. The tester sits at seat **E** (the
bottom of the screen); bots are S, W, N. Tiles are short codes (`src/core/tiles.ts`): `b1`-`b9`
Bamboo, `c1`-`c9` Characters, `o1`-`o9` Circles, `wE wS wW wN` winds,
`dR dG dW` dragons, `f1`-`f4` flowers, `s1`-`s4` seasons. If replay prints an error, the block was copied
wrong: copy it again rather than giving up.

A purely visual report (layout, overlap, a button, text cut off) does not
need a replay; the photo is the evidence.

## Step 4: is it already fixed?

The `Build:` line is the commit the tester ran. Compare it with `main`:

```bash
git log --oneline <build>..origin/main | head -40
git log --oneline --grep="#N" origin/main | head
```

Look for a commit whose subject matches the problem, or that names the
issue. Also check `closed_by_pull_requests` in the `get` result and any
linked pull request in the comments. If the build is unknown to git, say so.

## Step 5: sort it

Put every issue in exactly one bucket (`docs/WORKFLOW.md`, "Handling a wave
of reports"):

- **as designed:** the game follows the rules; say which rule and cite it by
  `R-` number and `[I p.N]`/`[C p.N]` page. When the answer turns on what a
  book says, attach `tslays/int-maj-rules` (`add_repo`) and read the page
  (AGENTS.md "Rule authority"). Never paste book text into an issue, a reply
  or this repository.
- **needs an owner ruling:** the books leave it open, or it is a design
  choice.
- **visual:** what the player sees or hears is wrong.
- **engine:** the rules engine, scoring, hints or bots behave wrongly.
- **already fixed** (in addition to one of the above): name the commit/PR.

## Step 6: report back

One block per issue, in this shape (no extra headings, no long quotes of the
report):

```
### #259 Report: <short title>  (https://github.com/tslays/int-maj/issues/259)
- Tester: alpha.20 (84202d6), iPad Safari, hand 13 discard, rules: all hands
- Note: <the note, or "(none)">
- Photos: 1 of 1 fetched and viewed. Photo 1: <what it shows>.
- Replay: <one line: what the replay shows at the end, or "not needed (visual)">
- Already fixed: <no / yes, by <commit> (#PR)>
- Sort: <as designed | needs an owner ruling | visual | engine>
- Why: <two or three sentences in your own words, with rule refs>
- Next step: <the fix you would make, or the question for the owner>
```

The `Photos:` line is required on every report. It reads `no photos`,
`k of N fetched and viewed`, or `photo k FAILED: <message>`.

With several issues, end with a short summary table (number, sort, next step)
and, if any need a ruling, the owner's questions together in one list, so
they can answer all at once before any code is written.

## Checklist before you answer

- [ ] Every issue in scope was read with `get` **and** `get_comments`.
- [ ] For every report, the number of photo keys equals "of N".
- [ ] `photos.sh` ran for every issue with photos, with all its keys.
- [ ] Every saved photo was opened with the Read tool and described.
- [ ] Any `FAIL` is reported as such, not hidden or guessed around.
- [ ] Nothing was posted to GitHub and no book text was quoted.
