/**
 * Everything a release needs to know from git, in one short block.
 *
 *   npm run release-prep [-- <version>]
 *
 * With no version it counts on in the last tag's stage (alpha.20 -> alpha.21);
 * `-- beta.1`, `-- rc.2` or `-- v0.1.0` (a final) name it, and it must come
 * later: alpha, beta, rc, final only move forward. It fetches `main` and the tags, then prints: the last tester tag and its
 * date (the date that version gets in the CHANGELOG), the next version, the
 * `main` commit to tag, whether this checkout is clean and level with `main`,
 * whether `docs/CHANGELOG.md` and `docs/TESTING.md` on `main` already name the
 * next version, and every commit since the last tag with its pull request number.
 * CI and open report issues are not here: sessions read them with the GitHub
 * tools (see `.claude/skills/release/SKILL.md`). A dev tool: nothing the game
 * runs imports it.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** Release stages in order; a final release has no suffix (`v0.1.0`). */
const STAGES = ["alpha", "beta", "rc", "final"] as const;
type Stage = (typeof STAGES)[number];

export interface Tag {
  base: string;
  stage: Stage;
  /** The count within the stage; 0 for a final. */
  n: number;
}

/** `v0.1.0-beta.2` -> base `0.1.0`, beta, 2; `v0.1.0` -> base `0.1.0`, final. */
export function parseTag(tag: string): Tag {
  const match = /^v?(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(tag);
  if (!match) throw new Error(`not a release tag (v0.1.0-alpha.N, -beta.N, -rc.N or v0.1.0): ${tag}`);
  return { base: match[1]!, stage: (match[2] as Stage | undefined) ?? "final", n: Number(match[3] ?? 0) };
}

export function formatTag(t: Tag): string {
  return t.stage === "final" ? `v${t.base}` : `v${t.base}-${t.stage}.${t.n}`;
}

/** What the app, the CHANGELOG and the guide call a version: `beta.2`, or `0.1.0` for a final. */
export function versionLabel(tag: string): string {
  const t = parseTag(tag);
  return t.stage === "final" ? t.base : `${t.stage}.${t.n}`;
}

function order(t: Tag): (number | string)[] {
  return [...t.base.split(".").map(Number), STAGES.indexOf(t.stage), t.n];
}

/** Is `a` a later release than `b`? Base version first, then stage, then count. */
export function isLater(a: Tag, b: Tag): boolean {
  const x = order(a);
  const y = order(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] as number) > (y[i] as number);
  return false;
}

/**
 * The tag to release after `last`, from what the owner typed after `/release`:
 *   (nothing)    the next count in the same stage: alpha.20 -> alpha.21
 *   beta.1, rc.2 that version of the current base (it must come later)
 *   v0.1.0       a final release (also 0.1.0)
 *   v0.2.0-beta.1 a whole tag, to start a new base version
 * After a final there is no "next", so something must be named.
 */
export function resolveTag(last: string, arg?: string): string {
  const prev = parseTag(last);
  const given = (arg ?? "").trim();
  let next: Tag;
  if (given === "") {
    if (prev.stage === "final") throw new Error(`${last} is a final release: name the next version (v0.1.1, v0.2.0-alpha.1 ...)`);
    next = { ...prev, n: prev.n + 1 };
  } else if (/^(alpha|beta|rc)\.\d+$/.test(given)) {
    const [stage, n] = given.split(".") as [Stage, string];
    next = { base: prev.base, stage, n: Number(n) };
  } else if (/^(alpha|beta|rc)$/.test(given)) {
    throw new Error(`name the count too: ${given}.1, ${given}.2 ...`);
  } else {
    next = parseTag(given);
  }
  if (!isLater(next, prev)) {
    throw new Error(`${formatTag(next)} is not later than ${last}: a release only moves forward (alpha, beta, rc, final)`);
  }
  return formatTag(next);
}

/** `<hash> <subject>` lines -> hash, subject without its `(#N)`, and N. */
export function parseLog(log: string): { hash: string; subject: string; pr: number | null }[] {
  return log
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const space = line.indexOf(" ");
      const hash = line.slice(0, space);
      const full = line.slice(space + 1);
      const pr = /\s*\(#(\d+)\)$/.exec(full);
      return { hash, subject: pr ? full.slice(0, pr.index) : full, pr: pr ? Number(pr[1]) : null };
    });
}

function main(): void {
  const arg = process.argv[2];
  try {
    git("fetch", "--quiet", "--tags", "origin", "main");
  } catch {
    console.log("warning: git fetch failed; using what this clone already has");
  }
  const last = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*", "origin/main");
  const next = resolveTag(last, arg);
  const stage = versionLabel(next);
  const head = git("rev-parse", "--short", "origin/main");
  const dirty = git("status", "--porcelain") !== "";
  const behind = Number(git("rev-list", "--count", "HEAD..origin/main"));
  // The label as a whole word: alpha.2 is not in alpha.20, 0.1.0 is not in 0.1.0-beta.1.
  const named = new RegExp(`(?<![\\w.])${stage.replaceAll(".", "\\.")}(?![\\w-])`);
  const docs = (file: string) => named.test(git("show", `origin/main:${file}`));
  const commits = parseLog(git("log", "--format=%h %s", `${last}..origin/main`));
  const lines = [
    `last tag   ${last} (${git("log", "-1", "--format=%cs", last)})`,
    `next tag   ${next}`,
    `to tag     origin/main ${head}`,
    `checkout   ${dirty ? "uncommitted changes" : "clean"}, ${behind === 0 ? "level with" : `${behind} behind`} origin/main`,
    `docs       CHANGELOG ${docs("docs/CHANGELOG.md") ? "has" : "lacks"} ${stage}, TESTING ${docs("docs/TESTING.md") ? "has" : "lacks"} ${stage}`,
    `prs        ${commits.flatMap((c) => (c.pr === null ? [] : [`#${c.pr}`])).join(" ") || "none"}`,
    `commits    ${commits.length} since ${last}:`,
    ...commits.map((c) => `  ${c.hash} ${c.pr === null ? "     " : `#${String(c.pr).padEnd(4)}`} ${c.subject}`),
  ];
  console.log(lines.join("\n"));
}

if (import.meta.main) main();
