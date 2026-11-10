# Workflow

How the project is worked on: entirely in Claude Code cloud sessions (from
claude.ai/code, the desktop app or the iPhone), in the `int-maj` cloud
environment. There is no local copy on any machine (since 2026-11-09).

## One source of truth

GitHub's `main` branch is the only copy of the project. Each cloud session
clones it fresh, works on its own `claude/...` branch and delivers through a
pull request:

```
 prompt -> cloud session (fresh clone) -> claude/... branch -> pull request
                                                                   |
                                   GitHub Actions: types, tests, build, preview
                                                  |                          |
                                                  | green: squash-merge      v PR comment: preview link
                                                  v                            (pr-N-int-dev, never `int`)
        main -> tests, build -> Deploy dev (int-dev) -> https://int-dev.mah-jong.workers.dev
        tag v* -> tests, build -> Deploy testers (int) -> https://int.mah-jong.workers.dev
```

Two sites: **int-dev** is the development site (every green push to `main`,
plus a preview link per pull request); **int** is the tester site, which
changes only when a release tag is pushed.

Everything a session needs is in the repository: the code, the rules
(`rules/RULES.md`), the book pages and their OCR text to check them against
(`rules/pages/`) and the deploy (`.github/workflows/test.yml`).

The `int-maj` cloud environment (personal, linked to this repository) allows
the package registries and the live sites, so a session can confirm a deploy.
It needs no setup script: the game has no dependencies, and the SessionStart
hook picks Node 24 and installs the dev-only tools (the type checker and the
smoke test's browser driver; the container already has a Chromium for it).

## A session, start to finish

1. **Start:** `git pull` before changing anything, so you work on what the
   last session pushed. Node must be 24 or later (`.nvmrc` names it; `npm
   test` stops with a clear message on an older Node). Cloud containers
   default to Node 22 but ship 24: the SessionStart hook
   (`.claude/hooks/session-start.sh`) puts the `.nvmrc` Node first on PATH
   for the whole session and runs `npm ci` if the dev tools are missing, so
   nothing needs doing by hand.
2. **Work:** one task per session. Two sessions may run at once only if they
   do not change the same files.
3. **Check:** `npm test` and `npm run typecheck` pass. After a change under
   `app/`, `npm run smoke` passes too (the built app in headless Chromium, a
   few minutes). For anything visible, look at it with `npm run dev` - review
   boards (`/?state=...`) and `/?phone` help.
4. **Finish:** commit with a descriptive message and push. Never leave
   finished work uncommitted on one device while continuing on another.

## Autonomous delivery loop

The owner has authorized this in advance; a session does it without asking
and does not stop at "pushed to a branch". A cloud session works on the branch
it is given (`claude/...`), so delivery is a pull request:

1. `npm test` and `npm run typecheck` pass locally (the hook has already
   picked Node 24 and installed the type checker).
2. Commit, push the branch, open a pull request into `main` (mirror
   `.github/pull_request_template.md` if one exists). The pull request gets
   a comment with its preview link (`pr-<number>-int-dev...workers.dev`).
3. Then the route depends on the kind of change:
   - **Non-visual** (engine, rules, docs, tests, CI): enable auto-merge
     (GitHub MCP `enable_pr_auto_merge`, squash) and end the session. Do not
     poll for CI or the deploy. If auto-merge cannot be enabled (repository
     setting off), fall back to watching `Tests and build` and squash-merging
     it when green, as below.
   - **Visual** (anything the player sees or hears): report the preview link
     and leave the pull request open. The owner looks at it on their phone
     and sends corrections into the same session; merge only when the owner
     says so.
   - **Release to testers:** sessions cannot push tags (the push gets a 403).
     Tell the owner the next `v0.1.0-alpha.N` and the `main` commit to tag;
     the owner pushes the tag. This is the only way testers get a new build.
     Nothing is bumped first: the build reads its version from the tag
     (`scripts/build.ts`), and `package.json` stays at `0.1.0-dev`.
4. Waiting for green by hand: `Tests and build` red means reproduce, fix, push
   again; never skip or disable a test to get green. Green and no unresolved
   review comments: squash-merge into `main` (one commit per pull request; no
   force-push, no history rewriting, no merging someone else's PR). GitHub
   then deletes the merged `claude/...` branch (repository setting
   "Automatically delete head branches"); the pull request keeps its history
   and can restore the branch.
5. The push to `main` runs `Deploy dev (int-dev)`; it never changes the tester
   site. Check it only when the task is about the deploy; if it fails, say so
   and why, and do not retry blindly.
6. Report what shipped. A session on `main` directly skips steps 2 and 4.

Owner settings this relies on: **Allow auto-merge** (Settings > General) and a
ruleset on `main` that requires the `Tests and build` check. Without the
first, sessions fall back to merging by hand; without the second, auto-merge
would merge at once without waiting for tests.

Stop and ask only for: a failing check you cannot fix, merge conflicts that
need a product decision, or anything outside the ordinary (force-push,
deleting branches or history, changing the Cloudflare token or secrets).

## Going live

- **Development site, https://int-dev.mah-jong.workers.dev:** every push to
  `main` whose tests and build pass is deployed by `Deploy dev (int-dev)`,
  usually a few minutes after the push.
- **Pull-request previews:** every pull request from this repository gets
  `https://pr-<number>-int-dev.mah-jong.workers.dev` (the `Preview (PR link)`
  job uploads a version of `int-dev` and posts or updates one comment). A
  preview never touches `int`.
- **Tester site, https://int.mah-jong.workers.dev:** deployed by
  `Deploy testers (int)` only when a tag `v*` is pushed, or when the workflow
  is run by hand (`workflow_dispatch`) on a tag ref, which re-deploys or rolls
  back to that tag. Merges to `main` never move it. The URL stays `int`
  because installed home-screen apps and saved games belong to the address.
- One build per run: the `Tests and build` job type-checks, tests, builds
  `dist/` and uploads it; the deploy and preview jobs publish exactly that
  folder through `.github/actions/deploy`.
- `Smoke (browser)` runs `npm run smoke` beside it on pull requests and on
  `main`. It is not a required check; look at it after changing `app/`.
- A failing test means nothing is published.
- A tag is the only way testers get a new build.
- Installed copies on phones update the next time they open.
- Sessions run autonomously and may merge their own finished, tested work into
  `main` (or open and merge a pull request) without asking first. The owner
  has given this permission in advance; it covers ordinary merges, which
  deploy to `int-dev` on green CI, and not force-pushes or rewriting shared history.
- `npm run deploy` publishes the tester site `int` by hand from a machine logged in with
  `npx wrangler login`; with no local copy it is not used.

## What is not in the repository

| What | Where | Why |
| --- | --- | --- |
| The book PDFs | the owner's own offline backup | masters; sessions read the page images and OCR text in `rules/pages/` |
| Saved games | each device's browser | a game belongs to the device it is played on |
| Anything a session must remember | `AGENTS.md`, not Claude's memory | memory notes stay on one machine; a cloud session never sees them |
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
