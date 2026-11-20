---
name: release
description: Prepare the next tester release (alpha, beta, rc or the final v0.1.0) - check main, write the CHANGELOG entry, the tester guide and WhatsApp message, build the PDF and the GitHub release notes, and hand the owner everything ready to copy. Only when the owner asks for a release.
argument-hint: "[beta.1 | rc.2 | v0.1.0]"
disable-model-invocation: true
---

# Release the next test version

The owner tags; sessions cannot (a tag push gets a 403). This skill gets
everything ready on `main` and hands it over in pieces the owner can copy
one by one. The version being released has no tag yet; that is normal.
`$ARGUMENTS` names it; pass it straight to `npm run release-prep -- <arg>`,
which resolves it and prints the "next tag":

- empty: the next count in the stage of the last tag (`alpha.20` gives
  `alpha.21`, `beta.1` gives `beta.2`);
- `beta.1`, `rc.2`: that version of the current base (`v0.1.0-beta.1`);
- `v0.1.0` (or `0.1.0`): the final release, no suffix;
- a whole tag such as `v0.2.0-alpha.1` to start a new base version. After a
  final the owner must name the next version.

A release must be later than the last tag (alpha, beta, rc, final); the tool
refuses anything else, so do not work around it. Below, `<stage>.N` is the
version's label as the app shows it (`alpha.21`, `beta.1`, `rc.2`, `0.1.0`)
and `<tag>` its tag.

## Keep it small

- Never open a PDF, old or new. The guide is built from `docs/TESTING.md` and
  `docs/CHANGELOG.md`; `npm run tester-guide` checks its own output.
- Read only the newest CHANGELOG section and the guide in `docs/TESTING.md`
  (for example `awk '/^## /{n++} n==1' docs/CHANGELOG.md`), never the
  whole history.
- GitHub calls: the smallest `perPage` that answers the question, and only
  the `fields` you need (or `minimal_output`). Never fetch a PR's diff or
  files to learn what it did: its squash subject and body say it.
- `git log --oneline` with a range or `| head`; never a bare `git log`.

## 1. Check

1. `npm run release-prep -- <arg>` (no `--` when `$ARGUMENTS` is empty). It prints the last tag and its date, the next tag,
   the `main` commit, the commits since the last tag with their PR numbers,
   and whether the CHANGELOG and TESTING on `main` already name the version.
2. Open pull requests (`list_pull_requests`, state open, `perPage` 10): ask
   the owner whether any must go in before the release. Nothing else joins.
3. Open tester reports (`list_issues`, label `report`, state open,
   `perPage` 10): each fixed one is credited in the guide; say which remain.
4. CI on the `main` commit (`actions_list`, workflow runs for `test.yml`,
   branch `main`, `perPage` 3): `Tests and build`, `Smoke (browser)` and
   `Deploy dev (int-dev)` must be green for that commit. Smoke runs in CI, so
   do not run it again here. Anything red: stop and report it.
5. No book text: attach `tslays/int-maj-rules` (`add_repo`), clone it beside
   this checkout and run
   `python3 ../int-maj-rules/rules/tools/check-quotes.py . --github tslays/int-maj`.
   It must print no match. A match is book text in the code, docs, issues or
   pull requests: stop and report it; never paste the matched text anywhere.

If the docs already have the version (a release-notes PR was merged before),
still do checks 1 to 5 (they cover what has merged since), then skip to step 3.

## 2. Write the release notes

On the session's `claude/...` branch, restarted from `main`. Read the PR
subjects and bodies (`pull_request_read`, `fields` limited to title and body)
only where a subject does not say enough for a player.

- **`docs/CHANGELOG.md`:** a new `## <stage>.N` section at the top, no date.
  Give the previous section the last tag's date, as `## alpha.8 (14 November
  2026)`. Copy the previous section's shape: `**New**`, `**Changed**`,
  `**Fixed**`, `**What works differently now**`, dropping an empty one. Each
  item is for players (what they see, no code words) and ends with its PR,
  `(#156)`, or report and fix, `(#159 → #160)`. These numbers go straight into
  the GitHub release notes.
- **`docs/TESTING.md`:** replace the guide between `<!-- guide:start -->` and
  `<!-- guide:end -->` with the new version's, keeping the previous guide's
  headings: Getting the new version (the label reads **<stage>.N**), New in,
  Fixed thanks to your reports (only when a report was fixed), What works
  differently now, What to try, How to report, Known limits (update only what
  changed). Replace the WhatsApp message between its markers: version, link,
  three or four highlights in one paragraph, a thank-you for any report,
  "Options › Report a problem".
- `npm run tester-guide`: the line must read `check: <stage>.N OK`. Fix and
  rerun until it does.
- `npm test`, `npm run typecheck`, commit, push, open the pull request:
  title `Release notes: <stage>.N covers <three highlights>`, body two or three
  lines. Docs only, so enable auto-merge (squash). Subscribe to its activity
  and wait for the merge; do not poll.

## 3. Build from main and hand over

After the merge: `git pull`, `npm run release-prep` (the "to tag" commit is
the release-notes merge), `npm run tester-guide` again from `main`, and check
CI on that commit as in step 1.4. Then send the owner
`int-maj-<stage>.N-testers.pdf`, `int-maj-<stage>.N-release.md` and
`int-maj-<stage>.N-whatsapp.txt` with `SendUserFile`, and reply in exactly this
shape, every value in its own code block so each copies with one tap:

````
**<stage>.N is ready to tag.** CI is green on `<short sha>` (<one-line summary>).

**1. Create the release** on GitHub › Releases › Draft a new release.

Tag (choose "Create new tag on publish"):
```text
<tag>
```
Target (Target › Recent commits, this one):
```text
<full 40-character sha>
```
Release title:
```text
<tag>
```
Release notes:
```markdown
<contents of int-maj-<stage>.N-release.md>
```
Tick **Set as a pre-release** (not for a final), then Publish. The tag starts
`Deploy testers (int)`; when it is green, https://int.mah-jong.workers.dev
shows <stage>.N.

**2. Send the testers** the PDF (attached above) and this message:
```text
<contents of int-maj-<stage>.N-whatsapp.txt>
```
````

## Moving to a new stage

When the release is the first of a new stage (`beta.1`, `rc.1`, or the final),
do this in the same release-notes pull request, besides the steps above:
retitle `docs/TESTING.md` for the stage ("Testing the beta"), keep the
`docs/CHANGELOG.md` intro naming every tag kind in use, and have the guide
and the WhatsApp message say what the new stage means for testers (the owner
tells you; ask if unsure). Never move a stage on your own: only when
`$ARGUMENTS` asks for it.

- **alpha, beta, rc:** tick **Set as a pre-release** on the GitHub release.
- **Final (`v0.1.0`):** the label is `0.1.0`, the CHANGELOG section is
  `## 0.1.0`, and the release is **not** a pre-release: leave the box
  unticked, and say so in the hand-over.

Always give the release-notes PR's number and full URL. Use the full SHA for
the target, never a branch name: `main` can move before the owner tags.
