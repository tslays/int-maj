/**
 * The tester guide as a PDF, for the owner to send with each test version.
 *
 *   npm run tester-guide [-- out.pdf]
 *
 * It takes the guide from `docs/TESTING.md` (between `<!-- guide:start -->`
 * and `<!-- guide:end -->`), adds the full `docs/CHANGELOG.md`, renders the
 * little Markdown they use (headings, paragraphs, lists, bold, italics,
 * links, pictures) to a styled page and prints it to A4 with Playwright's
 * Chromium. A picture line, `![alt](../app/assets/icons/icon-512.png)`, is
 * embedded in the PDF itself; its path is relative to `docs/`, as on GitHub.
 * The default output is `int-maj-<stage>-testers.pdf` in the working
 * directory, named after the guide's version; it is not committed.
 *
 * It also prints the WhatsApp message (between `<!-- whatsapp:start -->` and
 * `<!-- whatsapp:end -->`), ready to paste and also saved as
 * `int-maj-<stage>-whatsapp.txt`, and writes the GitHub release notes,
 * `int-maj-<stage>-release.md`, from the newest CHANGELOG section: its
 * `**New**` labels become `### New` headings and wrapped lines are joined.
 * The pull request numbers, `(#156)` at the end of each item, come along.
 *
 * Last, it checks its own output and prints one line, so nobody needs to open
 * the PDF: the version agrees across the guide, the CHANGELOG and the message,
 * no Markdown is left unrendered, and the page count. It exits non-zero on a
 * problem. A dev tool: nothing the game runs imports it, and it holds no book
 * pages or book text, only our own words.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function between(text: string, name: string): string {
  const start = text.indexOf(`<!-- ${name}:start -->`);
  const end = text.indexOf(`<!-- ${name}:end -->`);
  if (start < 0 || end < start) throw new Error(`docs/TESTING.md has no ${name} section`);
  return text.slice(start + `<!-- ${name}:start -->`.length, end).trim();
}

/** HTML comments in the Markdown are notes for us, never for the PDF. */
function stripComments(text: string): string {
  return text.replace(/\s*<!--.*?-->/g, "");
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bold, italics, links, code and pictures inside one line. */
function inline(text: string): string {
  return escape(text)
    .replace(/!\[([^\]]*)\]\((data:[^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https:\/\/[^\s)<]+)/g, '<a href="$1">$1</a>');
}

/** The Markdown these two files use: headings, paragraphs and one or two levels of list. */
export function markdown(source: string): string {
  type Item = { text: string; children: Item[] };
  const out: string[] = [];
  let paragraph: string[] = [];
  let items: Item[] | null = null;
  let last: Item | null = null;
  const renderItems = (list: Item[]): string =>
    `<ul>${list.map((item) => `<li>${inline(item.text)}${item.children.length > 0 ? renderItems(item.children) : ""}</li>`).join("")}</ul>`;
  const flushParagraph = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (items !== null) out.push(renderItems(items));
    items = null;
    last = null;
  };
  for (const raw of stripComments(source).split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    const item = /^( *)- (.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (item) {
      flushParagraph();
      const entry: Item = { text: item[2]!, children: [] };
      if (items === null) items = [];
      if (item[1]!.length >= 2 && items.length > 0) items[items.length - 1]!.children.push(entry);
      else items.push(entry);
      last = entry;
    } else if (line.trim() === "") {
      flushParagraph();
    } else if (last !== null && /^ {2,}/.test(raw)) {
      last.text += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return out.join("\n");
}

/** The newest version section of the CHANGELOG: its version and its lines. */
export function newestSection(changelog: string): { version: string; body: string } {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => /^## alpha\.\d+/.test(line));
  if (start < 0) throw new Error("docs/CHANGELOG.md has no ## alpha.N section");
  const next = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const version = /alpha\.\d+/.exec(lines[start]!)![0];
  return { version, body: lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim() };
}

/**
 * The GitHub release notes from the newest CHANGELOG section: `**New**` becomes
 * `### New`, and each paragraph and list item is one line (GitHub keeps line
 * breaks).
 */
export function releaseNotes(changelog: string): string {
  const { body } = newestSection(changelog);
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const label = /^\*\*([^*]+)\*\*$/.exec(line);
    if (label) out.push(`### ${label[1]}`);
    else if (line === "" || /^ *- /.test(line) || out.length === 0 || out[out.length - 1] === "") out.push(line);
    else out[out.length - 1] += ` ${line.trim()}`;
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/** What is wrong with a release's texts and rendered guide; empty when all is well. */
export function releaseProblems(parts: { guide: string; changelog: string; whatsapp: string; html: string }): string[] {
  const problems: string[] = [];
  const guide = /alpha\.\d+/.exec(parts.guide)?.[0];
  const { version } = newestSection(parts.changelog);
  if (guide !== version) problems.push(`guide is ${guide ?? "unversioned"} but the newest CHANGELOG section is ${version}`);
  const label = /should read \*\*(alpha\.\d+)\*\*/.exec(parts.guide)?.[1];
  if (label !== undefined && label !== version) problems.push(`guide says the label reads ${label}, not ${version}`);
  if (!parts.whatsapp.includes(version)) problems.push(`WhatsApp message does not name ${version}`);
  const text = parts.html.replace(/<[^>]*>/g, " ");
  for (const [mark, what] of [
    ["**", "bold"],
    ["<!--", "comment"],
    ["](", "link"],
  ] as const) {
    if (text.includes(mark) || (mark === "<!--" && parts.html.includes("&lt;!--"))) problems.push(`unrendered ${what} markup in the guide`);
  }
  return problems;
}

/**
 * Each `![alt](file.png)` line becomes the picture itself, as a data address,
 * so the PDF is complete on its own.
 */
export async function embedImages(text: string): Promise<string> {
  let out = text;
  for (const [whole, alt, file] of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+\.png)\)/g)) {
    const picture = await readFile(join(ROOT, "docs", file!), "base64");
    out = out.replace(whole, `![${alt}](data:image/png;base64,${picture})`);
  }
  return out;
}

const STYLE = `
  @page { size: A4; margin: 18mm 17mm 18mm 17mm; }
  body { font: 10.5pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1d2a2a; }
  h1 { font-size: 22pt; margin: 0 0 4pt; color: #0f5a50; }
  h2 { font-size: 13.5pt; margin: 16pt 0 5pt; color: #0f5a50; border-bottom: 1.5pt solid #9fd9cf; padding-bottom: 2pt; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; break-after: avoid; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 7pt; padding-left: 15pt; }
  li { margin: 0 0 3pt; }
  a { color: #0f6e8c; text-decoration: none; }
  strong { color: #10302c; }
  .changelog { break-before: page; }
  .changelog h1 { font-size: 17pt; }
  .changelog h2 { font-size: 12pt; }
  .changelog p, .changelog li { font-size: 9.5pt; }
  img { width: 56pt; height: 56pt; border-radius: 12pt; display: block; margin: 2pt 0 8pt; }
  footer { margin-top: 18pt; font-size: 8.5pt; color: #6b7b7b; }
`;

async function main(): Promise<void> {
  const testing = await readFile(join(ROOT, "docs/TESTING.md"), "utf8");
  const changelog = await readFile(join(ROOT, "docs/CHANGELOG.md"), "utf8");
  const guide = between(testing, "guide");
  const stage = /alpha\.\d+/.exec(guide)?.[0] ?? "alpha";
  const out = resolve(process.argv[2] ?? `int-maj-${stage}-testers.pdf`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
    <main>${markdown(await embedImages(guide))}</main>
    <section class="changelog">${markdown(changelog.replace(/^# .*$/m, "# Every version so far"))}</section>
    <footer>Made for the Mah Jong test group. Please don't share this guide outside it.</footer>
  </body></html>`;
  // Imported here, so tests can load this file without a browser.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let pdf: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    pdf = await page.pdf({ path: out, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
  const notes = resolve(`int-maj-${stage}-release.md`);
  await writeFile(notes, releaseNotes(changelog));
  const whatsapp = between(testing, "whatsapp");
  const problems = releaseProblems({ guide, changelog, whatsapp, html });
  if (pages < 2) problems.push(`the PDF has ${pages} page(s); the guide and the CHANGELOG need at least 2`);
  console.log(`wrote ${out} (${pages} pages) and ${notes}`);
  console.log(problems.length === 0 ? `check: ${stage} OK` : `check: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  if (problems.length > 0) process.exitCode = 1;
  console.log("\n--- WhatsApp message ---\n");
  // WhatsApp keeps every line break: one line per paragraph, and its own *bold*.
  const message = whatsapp
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split("\n").map((line) => line.trim()).join(" "))
    .join("\n\n")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
  const text = resolve(`int-maj-${stage}-whatsapp.txt`);
  await writeFile(text, `${message}\n`);
  console.log(message);
  console.log(`\n(also in ${text})`);
}

if (import.meta.main) await main();
