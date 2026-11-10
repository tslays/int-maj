/** The built page carries its version (the release tag's, else the development one) and a build id. */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { build, buildVersion } from "../../scripts/build.ts";

/** Run `task` with these environment variables set (or removed, for undefined), then put them back. */
async function withEnv<T>(values: Record<string, string | undefined>, task: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const set = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  set(values);
  try {
    return await task();
  } finally {
    set(saved);
  }
}

/** A build on a branch: CI itself may be running these tests on a tag. */
const BRANCH = { GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" };

describe("build info", () => {
  const dirs: string[] = [];
  after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });
  const outDir = async () => {
    const out = await mkdtemp(join(tmpdir(), "int-maj-build-"));
    dirs.push(out);
    return out;
  };

  it("exports the version, stage and id, and the page shows the label", async () => {
    const out = await outDir();
    const result = await withEnv({ ...BRANCH, GITHUB_SHA: "abcdef0123456789" }, () => build(out));
    assert.equal(result.buildId, "abcdef0");
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    // Not a tag build, so the version is package.json's development version.
    assert.equal(pkg.version, "0.1.0-dev");
    const info = (await import(pathToFileURL(join(out, "src", "build-info.js")).href)) as {
      BUILD: { version: string; stage: string; id: string };
      BUILD_LABEL: string;
    };
    assert.deepEqual({ ...info.BUILD }, { version: pkg.version, stage: "dev", id: "abcdef0" });
    assert.equal(info.BUILD_LABEL, "dev \u00b7 abcdef0");
    const html = await readFile(join(out, "index.html"), "utf8");
    assert.match(html, /id="build-label"/);
    assert.match(html, /src\/build-info\.js/);
    assert.match(await readFile(join(out, "sw.js"), "utf8"), /src\/build-info\.js/);
  });

  it("takes a release build's version from its tag, never from package.json", () => {
    const tag = { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v0.1.0-alpha.3" };
    assert.equal(buildVersion(tag, "0.1.0-dev"), "0.1.0-alpha.3");
    assert.equal(buildVersion(BRANCH, "0.1.0-dev"), "0.1.0-dev");
    assert.equal(buildVersion({ GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "nightly" }, "0.1.0-dev"), "0.1.0-dev");
    assert.equal(buildVersion({}, "0.1.0-dev"), "0.1.0-dev");
  });

  it("stamps the tag's version into a release build", async () => {
    const out = await outDir();
    await withEnv({ GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v0.1.0-alpha.3" }, () => build(out));
    const text = await readFile(join(out, "src", "build-info.js"), "utf8");
    assert.match(text, /"version":"0\.1\.0-alpha\.3","stage":"alpha\.3"/);
  });

  it("falls back to the content hash without GITHUB_SHA", async () => {
    const out = await outDir();
    const result = await withEnv({ GITHUB_SHA: undefined }, () => build(out));
    assert.equal(result.buildId, result.version.slice(0, 7));
  });
});
