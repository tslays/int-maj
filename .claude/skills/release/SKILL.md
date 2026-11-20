---
name: release
description: Prepare the next tester release (v0.1.0-alpha.N) - check main, write the CHANGELOG entry, the tester guide and WhatsApp message, build the PDF and the GitHub release notes, and hand the owner everything ready to copy. Only when the owner asks for a release.
argument-hint: "[alpha.N]"
disable-model-invocation: true
---

# Release the next test version

The owner tags; sessions cannot (a tag push gets a 403). This skill gets
everything ready on `main` and hands it over in pieces the owner can copy
one by one. The version being released has no tag yet; that is normal.
`$ARGUMENTS` names it (`alpha.9`); if empty, use the "next tag" that
`npm run release-prep` prints.

## Keep it small

- Never open a PDF, old or new. The guide is built from `docs/TESTING.md` and
  `docs/CHANGELOG.md`; `npm run tester-guide` checks its own output.
- Read only the newest CHANGELOG section and the guide in `docs/TESTING.md`
  (for example `awk '/^## alpha/{n++} n==1' docs/CHANGELOG.md`), never the
  whole history.
- GitHub calls: the smallest `perPage` that answers the question, and only
  the `fields` you need (or `minimal_output`). Never fetch a PR's diff or
  files to learn what it did: its squash subject and body say it.
- `git log --oneline` with a range or `| head`; never a bare `git log`.

## 1. Check

1. `npm run release-prep`. It prints the last tag and its date, the next tag,
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
skip to step 3.

## 2. Write the release notes

On the session's `claude/...` branch, restarted from `main`. Read the PR
subjects and bodies (`pull_request_read`, `fields` limited to title and body)
only where a subject does not say enough for a player.

- **`docs/CHANGELOG.md`:** a new `## alpha.N` section at the top, no date.
  Give the previous section the last tag's date, as `## alpha.8 (14 November
  2026)`. Copy the previous section's shape: `**New**`, `**Changed**`,
  `**Fixed**`, `**What works differently now**`, dropping an empty one. Each
  item is for players (what they see, no code words) and ends with its PR,
  `(#156)`, or report and fix, `(#159 → #160)`. These numbers go straight into
  the GitHub release notes.
- **`docs/TESTING.md`:** replace the guide between `<!-- guide:start -->` and
  `<!-- guide:end -->` with the new version's, keeping the previous guide's
  headings: Getting the new version (the label reads **alpha.N**), New in,
  Fixed thanks to your reports (only when a report was fixed), What works
  differently now, What to try, How to report, Known limits (update only what
  changed). Replace the WhatsApp message between its markers: version, link,
  three or four highlights in one paragraph, a thank-you for any report,
  "Options › Report a problem".
- `npm run tester-guide`: the line must read `check: alpha.N OK`. Fix and
  rerun until it does.
- `npm test`, `npm run typecheck`, commit, push, open the pull request:
  title `Release notes: alpha.N covers <three highlights>`, body two or three
  lines. Docs only, so enable auto-merge (squash). Subscribe to its activity
  and wait for the merge; do not poll.

## 3. Build from main and hand over

After the merge: `git pull`, `npm run release-prep` (the "to tag" commit is
the release-notes merge), `npm run tester-guide` again from `main`, and check
CI on that commit as in step 1.4. Then send the owner
`int-maj-alpha.N-testers.pdf`, `int-maj-alpha.N-release.md` and
`int-maj-alpha.N-whatsapp.txt` with `SendUserFile`, and reply in exactly this
shape, every value in its own code block so each copies with one tap:

````
**alpha.N is ready to tag.** CI is green on `<short sha>` (<one-line summary>).

**1. Create the release** on GitHub › Releases › Draft a new release.

Tag (choose "Create new tag on publish"):
```text
v0.1.0-alpha.N
```
Target (Target › Recent commits, this one):
```text
<full 40-character sha>
```
Release title:
```text
v0.1.0-alpha.N
```
Release notes:
```markdown
<contents of int-maj-alpha.N-release.md>
```
Tick **Set as a pre-release**, then Publish. The tag starts
`Deploy testers (int)`; when it is green, https://int.mah-jong.workers.dev
shows alpha.N.

**2. Send the testers** the PDF (attached above) and this message:
```text
<contents of int-maj-alpha.N-whatsapp.txt>
```
````

Always give the release-notes PR's number and full URL. Use the full SHA for
the target, never a branch name: `main` can move before the owner tags.
