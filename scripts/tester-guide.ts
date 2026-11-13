/**
 * The tester guide as a PDF, for the owner to send with each test version.
 *
 *   npm run tester-guide [-- out.pdf]
 *
 * It takes the guide from `docs/TESTING.md` (between `<!-- guide:start -->`
 * and `<!-- guide:end -->`), adds the full `docs/CHANGELOG.md`, renders the
 * little Markdown they use (headings, paragraphs, lists, bold, italics,
 * links) to a styled page and prints it to A4 with Playwright's Chromium.
 * The default output is `int-maj-<stage>-testers.pdf` in the working
 * directory, named after the guide's version; it is not committed.
 *
 * It also prints the WhatsApp message (between `<!-- whatsapp:start -->` and
 * `<!-- whatsapp:end -->`), ready to paste. A dev tool: nothing the game runs
 * imports it, and it holds no book pages or book text, only our own words.
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");

function between(text: string, name: string): string {
  const start = text.indexOf(`<!-- ${name}:start -->`);
  const end = text.indexOf(`<!-- ${name}:end -->`);
  if (start < 0 || end < start) throw new Error(`docs/TESTING.md has no ${name} section`);
  return text.slice(start + `<!-- ${name}:start -->`.length, end).trim();
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Bold, italics, links and code inside one line. */
function inline(text: string): string {
  return escape(text)
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
  for (const raw of source.split("\n")) {
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
  footer { margin-top: 18pt; font-size: 8.5pt; color: #6b7b7b; }
`;

async function main(): Promise<void> {
  const testing = await readFile(join(ROOT, "docs/TESTING.md"), "utf8");
  const changelog = await readFile(join(ROOT, "docs/CHANGELOG.md"), "utf8");
  const guide = between(testing, "guide");
  const stage = /alpha\.\d+/.exec(guide)?.[0] ?? "alpha";
  const out = resolve(process.argv[2] ?? `int-maj-${stage}-testers.pdf`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
    <main>${markdown(guide)}</main>
    <section class="changelog">${markdown(changelog.replace(/^# .*$/m, "# Every version so far"))}</section>
    <footer>Made for the Mah Jong test group. Please don't share this guide outside it.</footer>
  </body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: out, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
  console.log(`wrote ${out}`);
  console.log("\n--- WhatsApp message ---\n");
  // WhatsApp keeps every line break: one line per paragraph, and its own *bold*.
  const message = between(testing, "whatsapp")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split("\n").map((line) => line.trim()).join(" "))
    .join("\n\n")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
  console.log(message);
}

if (import.meta.main) await main();
