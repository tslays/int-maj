#!/usr/bin/env node
/**
 * Build the landing page (https://www.mah-jong.workers.dev): a static folder,
 * served by its own Worker (`wrangler.site.jsonc`).
 *
 *   npm run build:site          # writes dist-site/
 *   node scripts/build-site.ts --out some/dir
 *
 * It copies `site/` as it is, and borrows the app's title font and icons
 * (with their licence notes) so the page and the game look the same without
 * keeping a second copy in the repository.
 */

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const APP = join(ROOT, "app");

/** The app's files the page uses, kept at the same paths as in the app. */
export const BORROWED = [
  "assets/fonts/InterDisplay-BlackItalic.woff2",
  "assets/fonts/LICENSE.md",
  "assets/icons/icon.svg",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/LICENSE.md",
] as const;

function parseOut(argv: readonly string[]): string {
  const index = argv.indexOf("--out");
  if (index >= 0 && argv[index + 1] !== undefined) return resolve(argv[index + 1]!);
  return join(ROOT, "dist-site");
}

async function walk(dir: string, base = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(dir, base), { withFileTypes: true })) {
    const path = base === "" ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(dir, path)));
    else files.push(path);
  }
  return files;
}

export async function buildSite(outDir: string): Promise<string[]> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const file of await walk(SITE)) {
    await mkdir(dirname(join(outDir, file)), { recursive: true });
    await cp(join(SITE, file), join(outDir, file));
    written.push(file);
  }
  for (const file of BORROWED) {
    await mkdir(dirname(join(outDir, file)), { recursive: true });
    await cp(join(APP, file), join(outDir, file));
    written.push(file);
  }
  return written.sort();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = parseOut(process.argv.slice(2));
  const files = await buildSite(out);
  console.log(`Built the landing page: ${files.length} files into ${out}`);
}
