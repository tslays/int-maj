/**
 * Rasterise app/assets/icons/icon.svg into the PNG icons the page and the
 * manifest name: icon-512 and icon-192 (install) and apple-touch-icon (180,
 * the iPhone home screen). Run after scripts/art/app-icon.py:
 *
 *     node scripts/art/app-icon-png.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const ICONS = join(import.meta.dirname, "..", "..", "app", "assets", "icons");
const SIZES = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
] as const;

const svg = await readFile(join(ICONS, "icon.svg"), "utf8");
const browser = await chromium.launch();
try {
  for (const [name, size] of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;background:#0b3334}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: join(ICONS, name), omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}
