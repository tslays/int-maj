/**
 * Everything a release needs to know from git, in one short block.
 *
 *   npm run release-prep [-- beta]
 *
 * `-- beta` asks for the first beta tag, which moves the project on from alpha
 * for good (a stage only moves forward). It fetches `main` and the tags, then prints: the last tester tag and its
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

const STAGES = ["alpha", "beta", "rc"] as const;
type Stage = (typeof STAGES)[number];

/**
 * The tag after `tag`: `v0.1.0-alpha.8` -> `v0.1.0-alpha.9`. With `to` it
 * moves to the first of that stage (`v0.1.0-alpha.20`, "beta" ->
 * `v0.1.0-beta.1`); a stage never goes backwards, and `to` may not name the
 * stage the tag is already in.
 */
export function nextTag(tag: string, to?: Stage): string {
  const match = /^(v\d+\.\d+\.\d+-)(alpha|beta|rc)\.(\d+)$/.exec(tag);
  if (!match) throw new Error(`not a tester tag (v0.1.0-alpha.N, -beta.N): ${tag}`);
  const stage = match[2] as Stage;
  if (to === undefined) return `${match[1]}${stage}.${Number(match[3]) + 1}`;
  if (STAGES.indexOf(to) <= STAGES.indexOf(stage)) {
    throw new Error(`cannot move from ${stage} to ${to}: a stage only moves forward (to start the next ${stage}.N, leave out the stage)`);
  }
  return `${match[1]}${to}.1`;
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
  const to = process.argv[2] as Stage | undefined;
  if (to !== undefined && !STAGES.includes(to)) throw new Error(`unknown stage ${to}; use ${STAGES.join(", ")}`);
  try {
    git("fetch", "--quiet", "--tags", "origin", "main");
  } catch {
    console.log("warning: git fetch failed; using what this clone already has");
  }
  const last = git("describe", "--tags", "--abbrev=0", "--match", "v*-*.*", "origin/main");
  const next = nextTag(last, to);
  const stage = next.replace(/^v[\d.]+-/, "");
  const head = git("rev-parse", "--short", "origin/main");
  const dirty = git("status", "--porcelain") !== "";
  const behind = Number(git("rev-list", "--count", "HEAD..origin/main"));
  const docs = (file: string) => git("show", `origin/main:${file}`).includes(stage);
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
