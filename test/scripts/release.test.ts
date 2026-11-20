/**
 * The release tools (`npm run release-prep`, `npm run tester-guide`): the next
 * tag, the commit list, the GitHub release notes taken from the newest
 * CHANGELOG section, and the self-check that replaces reading the PDF.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseLog, resolveTag, versionLabel } from "../../scripts/release-prep.ts";
import { embedImages, markdown, newestSection, releaseNotes, releaseProblems } from "../../scripts/tester-guide.ts";

const CHANGELOG = `# What changed

Intro.

## alpha.9

**New**

- **Odds rings** on the closest hands, worked out
  from the tiles you can see. (#156)

**Fixed**

- Result card groups. (#159 → #160)

## alpha.8 (14 November 2026)

**New**

- Counter sticks.
`;

describe("release-prep", () => {
  it("counts on in the stage of the last tag", () => {
    assert.equal(resolveTag("v0.1.0-alpha.8"), "v0.1.0-alpha.9");
    assert.equal(resolveTag("v0.1.0-alpha.12"), "v0.1.0-alpha.13");
    assert.equal(resolveTag("v0.1.0-beta.1"), "v0.1.0-beta.2");
    assert.equal(resolveTag("v0.1.0-rc.2"), "v0.1.0-rc.3");
  });

  it("takes a named version, which must be later", () => {
    assert.equal(resolveTag("v0.1.0-alpha.20", "beta.1"), "v0.1.0-beta.1");
    assert.equal(resolveTag("v0.1.0-beta.3", "rc.1"), "v0.1.0-rc.1");
    assert.equal(resolveTag("v0.1.0-beta.1", "beta.4"), "v0.1.0-beta.4");
    assert.equal(resolveTag("v0.1.0-rc.2", "v0.1.0"), "v0.1.0");
    assert.equal(resolveTag("v0.1.0-rc.2", "0.1.0"), "v0.1.0");
    assert.equal(resolveTag("v0.1.0", "v0.2.0-alpha.1"), "v0.2.0-alpha.1");
    assert.throws(() => resolveTag("v0.1.0-beta.2", "alpha.9"), /only moves forward/);
    assert.throws(() => resolveTag("v0.1.0-beta.2", "beta.2"), /not later/);
    assert.throws(() => resolveTag("v0.1.0-beta.2", "beta"), /name the count/);
    assert.throws(() => resolveTag("v0.1.0", "v0.1.0"), /not later/);
  });

  it("needs a version named after a final release", () => {
    assert.throws(() => resolveTag("v0.1.0"), /name the next version/);
    assert.equal(resolveTag("v0.1.0", "v0.1.1"), "v0.1.1");
    assert.throws(() => resolveTag("nonsense"));
  });

  it("labels a version the way the app does", () => {
    assert.equal(versionLabel("v0.1.0-beta.2"), "beta.2");
    assert.equal(versionLabel("v0.1.0"), "0.1.0");
  });

  it("splits the pull request number off a squash subject", () => {
    assert.deepEqual(parseLog("e5fdf93 Show real groups (#160)\nabc1234 A direct commit\n"), [
      { hash: "e5fdf93", subject: "Show real groups", pr: 160 },
      { hash: "abc1234", subject: "A direct commit", pr: null },
    ]);
  });
});

describe("release notes", () => {
  it("take only the newest section", () => {
    assert.equal(newestSection(CHANGELOG).version, "alpha.9");
    const notes = releaseNotes(CHANGELOG);
    assert.ok(!notes.includes("Counter sticks"));
    assert.ok(!notes.includes("## alpha"));
  });

  it("turn labels into headings and join wrapped lines", () => {
    assert.equal(
      releaseNotes(CHANGELOG),
      "### New\n\n- **Odds rings** on the closest hands, worked out from the tiles you can see. (#156)\n\n" +
        "### Fixed\n\n- Result card groups. (#159 → #160)\n",
    );
  });

  it("can be made from the real CHANGELOG", () => {
    const notes = releaseNotes(readFileSync(new URL("../../docs/CHANGELOG.md", import.meta.url), "utf8"));
    assert.match(notes, /^### /);
    assert.ok(!notes.includes("\n  "), "no wrapped continuation lines");
  });
});

describe("release self-check", () => {
  const guide = "# Mah Jong — test version alpha.9\n\nThe label should read **alpha.9**.";
  const ok = { guide, changelog: CHANGELOG, whatsapp: "alpha.9 is out", html: markdown(guide) };

  it("passes a consistent release", () => {
    assert.deepEqual(releaseProblems(ok), []);
  });

  it("catches a version that disagrees", () => {
    assert.equal(releaseProblems({ ...ok, whatsapp: "alpha.8 is out" }).length, 1);
    const old = guide.replaceAll("alpha.9", "alpha.8");
    assert.equal(releaseProblems({ ...ok, guide: old, html: markdown(old) }).length, 2, "title and label");
    const label = guide.replace("**alpha.9**", "**alpha.8**");
    assert.equal(releaseProblems({ ...ok, guide: label, html: markdown(label) }).length, 1);
  });

  it("catches unrendered Markdown", () => {
    assert.equal(releaseProblems({ ...ok, html: "<p>**bold** and [a](b) and &lt;!-- x</p>" }).length, 3);
  });

  it("accepts a beta release above the alphas", () => {
    const changelog = `# What changed\n\n## beta.1\n\n**New**\n\n- First beta. (#1)\n\n## alpha.20 (20 November 2026)\n\n**New**\n\n- Keys. (#255)\n`;
    assert.equal(newestSection(changelog).version, "beta.1");
    assert.ok(!releaseNotes(changelog).includes("Keys"));
    const guide = "# Mah Jong — test version beta.1\n\nThe label should read **beta.1**.";
    const beta = { guide, changelog, whatsapp: "beta.1 is out", html: markdown(guide) };
    assert.deepEqual(releaseProblems(beta), []);
    assert.equal(releaseProblems({ ...beta, whatsapp: "alpha.20 is out" }).length, 1);
  });

  it("accepts a final release above the rcs", () => {
    const changelog = "# What changed\n\n## 0.1.0\n\n**New**\n\n- Done. (#9)\n\n## rc.2 (1 December 2026)\n\n**New**\n\n- Polish. (#8)\n";
    assert.equal(newestSection(changelog).version, "0.1.0");
    assert.ok(!releaseNotes(changelog).includes("Polish"));
    const guide = "# Mah Jong — version 0.1.0\n\nThe label should read **0.1.0**.";
    assert.deepEqual(releaseProblems({ guide, changelog, whatsapp: "0.1.0 is out", html: markdown(guide) }), []);
  });

  it("keeps HTML comments out of the PDF", () => {
    assert.equal(markdown("Hello <!-- note --> there"), "<p>Hello there</p>");
  });
});

describe("tester guide pictures", () => {
  it("embed the app icon as a picture in the PDF", async () => {
    const guide = await embedImages("![The icon](../app/assets/icons/icon-512.png)");
    assert.match(guide, /^!\[The icon\]\(data:image\/png;base64,[A-Za-z0-9+/=]{100,}\)$/);
    assert.match(markdown(guide), /^<p><img alt="The icon" src="data:image\/png;base64,[A-Za-z0-9+/=]+"><\/p>$/);
  });

  it("leave text without a picture alone", async () => {
    assert.equal(await embedImages("Plain **text**."), "Plain **text**.");
  });
});
