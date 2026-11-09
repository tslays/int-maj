/** The built page carries the alpha version and a build id the report flow can import. */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "../../scripts/build.ts";

describe("build info", () => {
  const dirs: string[] = [];
  after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it("exports the version, stage and id, and the page shows the label", async () => {
    const out = await mkdtemp(join(tmpdir(), "int-maj-build-"));
    dirs.push(out);
    const saved = process.env.GITHUB_SHA;
    process.env.GITHUB_SHA = "abcdef0123456789";
    try {
      const result = await build(out);
      assert.equal(result.buildId, "abcdef0");
    } finally {
      if (saved === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = saved;
    }
    const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    assert.match(pkg.version, /^0\.1\.0-alpha\.1$/);
    const info = (await import(pathToFileURL(join(out, "src", "build-info.js")).href)) as {
      BUILD: { version: string; stage: string; id: string };
      BUILD_LABEL: string;
    };
    assert.deepEqual({ ...info.BUILD }, { version: pkg.version, stage: "alpha.1", id: "abcdef0" });
    assert.equal(info.BUILD_LABEL, "alpha.1 · abcdef0");
    const html = await readFile(join(out, "index.html"), "utf8");
    assert.match(html, /id="build-label"/);
    assert.match(html, /src\/build-info\.js/);
    assert.match(await readFile(join(out, "sw.js"), "utf8"), /src\/build-info\.js/);
  });

  it("falls back to the content hash without GITHUB_SHA", async () => {
    const out = await mkdtemp(join(tmpdir(), "int-maj-build-"));
    dirs.push(out);
    const saved = process.env.GITHUB_SHA;
    delete process.env.GITHUB_SHA;
    try {
      const result = await build(out);
      assert.equal(result.buildId, result.version.slice(0, 7));
    } finally {
      if (saved !== undefined) process.env.GITHUB_SHA = saved;
    }
  });
});
