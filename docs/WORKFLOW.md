# Workflow

How the project is worked on from any device - the owner's Mac, or a Claude
cloud session started from an iPhone - without anything getting out of sync.

## One source of truth

GitHub's `main` branch is the only place the project is shared. Devices never
sync with each other directly:

```
 Mac session (~/Documents/int-maj)  --push-->            --push-->  cloud session (from the iPhone)
                                    <--pull--   main     <--clone--
                                                 |
                                          GitHub Actions: tests, build
                                                 |  (green push to main)
                                                 v
                                   https://int.mah-jong.workers.dev
```

Everything a session needs is in the repository: the code, the rules
(`rules/RULES.md`), the book pages to check them against (`rules/pages/`) and
the deploy (`.github/workflows/test.yml`). No session needs the Mac to be on.

## A session, start to finish

1. **Start:** `git pull` before changing anything, so you work on what the
   last session pushed. Check `node --version` is 24 or later (`.nvmrc`
   names it; `npm test` stops with a clear message on an older Node).
2. **Work:** one task per session. Two sessions may run at once only if they
   do not change the same files.
3. **Check:** `npm test` passes. For anything visible, look at it with
   `npm run dev` - review boards (`/?state=...`) and `/?phone` help.
4. **Finish:** commit with a descriptive message and push. Never leave
   finished work uncommitted on one device while continuing on another.

## Autonomous delivery loop

The owner has authorized this in advance; a session does it without asking
and does not stop at "pushed to a branch". A cloud session works on the branch
it is given (`claude/...`), so delivery is a pull request:

1. `npm test` passes locally (Node 24; `npx -y node@24` if the default is older).
2. Commit, push the branch, open a pull request into `main` (mirror
   `.github/pull_request_template.md` if one exists).
3. Watch the pull request's `Tests and build` check. Red: reproduce, fix, push
   again; never skip or disable a test to get green.
4. Green and no unresolved review comments: merge it into `main` (ordinary
   merge, no force-push, no history rewriting, no merging someone else's PR).
5. The push to `main` runs `Deploy to Cloudflare`. Check that job succeeds and
   report the live URL. If the deploy job fails, say so and why; do not retry
   blindly.
6. Report what shipped. A session on `main` directly skips steps 2 and 4.

Stop and ask only for: a failing check you cannot fix, merge conflicts that
need a product decision, or anything outside the ordinary (force-push,
deleting branches or history, changing the Cloudflare token or secrets).

## Going live

- Every push to `main` whose tests and build pass is deployed by the
  `Deploy to Cloudflare` job, usually a few minutes after the push. Installed
  copies on phones update the next time they open.
- A failing test means nothing is published.
- A session that works on a branch and opens a pull request publishes only
  when the pull request is merged into `main` (the GitHub app on the phone
  can merge it).
- Sessions run autonomously and may merge their own finished, tested work into
  `main` (or open and merge a pull request) without asking first. The owner
  has given this permission in advance; it covers ordinary merges, which
  deploy on green CI, and not force-pushes or rewriting shared history.
- `npm run deploy` publishes by hand from a machine logged in with
  `npx wrangler login`; it is rarely needed now.

## What deliberately stays on one device

| What | Where | Why |
| --- | --- | --- |
| The book PDFs | the Mac, `scans/` | masters; the page images in `rules/pages/` are enough for any session |
| Saved games | each device's browser | a game belongs to the device it is played on |
| Claude's memory notes | the Mac | anything every session must know is in `AGENTS.md` instead |
| `dist/`, `.wrangler/` | wherever they are built | generated; never committed |

## The Cloudflare token

The deploy job uses the repository secret `CLOUDFLARE_API_TOKEN`, a
Cloudflare API token from the "Edit Cloudflare Workers" template (Workers
permissions on the owner's account only). It expires on **2027-11-08**: the
deploy job then fails. Create a new token the same way, replace the secret
(GitHub > Settings > Secrets and variables > Actions), and re-run the job.
Never paste a token into a chat, a file or a screenshot; if one leaks, roll it
in Cloudflare and replace the secret.

## Private material

`rules/pages/` holds the owner's copies of copyrighted books. The repository
stays private, and the build never ships those files (a test checks it).
