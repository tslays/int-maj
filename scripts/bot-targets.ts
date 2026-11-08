/**
 * Generates src/core/game/bot/targets.ts: the special hands the bots aim for.
 *
 *   node scripts/bot-targets.ts
 *
 * The bots never learn a hand by name. They read a list of concrete winning
 * hands (fourteen tiles each, tagged with the catalogue pattern they make)
 * and measure how far their own tiles are from each one. This script builds
 * that list from the engine itself:
 *
 *   1. Seeds: the positive example of every fixed-tier catalogue hand in
 *      test/core/catalogue.test.ts.
 *   2. Symmetry: every seed is re-dealt under suit swaps, rank mirroring and
 *      wind/dragon permutations. A variant is kept only when the pattern's own
 *      predicate still accepts it, so asymmetric hands (one fixed suit, fixed
 *      winds) stay as printed.
 *   3. Flexibility: tiles are swapped one kind at a time, breadth first, and
 *      kept when the predicate still accepts the hand ("plus any pair", "a
 *      pung of any wind"), up to a fixed number of hands per pattern.
 *
 * Every emitted hand is therefore one the engine accepts as that pattern;
 * test/core/bot-targets.test.ts re-checks the whole file against matchHand.
 * Hands with a kong (more than fourteen tiles) and the "calculate" hands are
 * left out: the bot builds ordinary hands itself.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHand } from "../src/core/hand.ts";
import { normalizeHand } from "../src/core/shape.ts";
import { PATTERNS } from "../src/core/patterns/table.ts";
import { PLAY_TILE_KEYS } from "../src/core/tiles.ts";

/** Most hands kept per pattern; rigid patterns have far fewer. */
const CAP = 160;

const catalogue = readFileSync(new URL("../test/core/catalogue.test.ts", import.meta.url), "utf8");
const SEEDS = new Map<string, string>();
for (const match of catalogue.matchAll(
  /"([a-z-]+)": \{\s*positive: \{\s*concealed:\s*"([^"]+)"/g,
)) {
  SEEDS.set(match[1]!, match[2]!);
}

const permutations = <T>(items: readonly T[]): T[][] =>
  items.length <= 1
    ? [[...items]]
    : items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
          item,
          ...rest,
        ]),
      );

const SUIT_PERMS = permutations(["b", "c", "o"]);
const WIND_PERMS = permutations(["E", "S", "W", "N"]);
const DRAGON_PERMS = permutations(["R", "G", "W"]);

function transforms(): ((key: string) => string)[] {
  const out: ((key: string) => string)[] = [];
  for (const suits of SUIT_PERMS) {
    for (const flip of [false, true]) {
      for (const winds of WIND_PERMS) {
        for (const dragons of DRAGON_PERMS) {
          out.push((key) => {
            if (key[0] === "w") return `w${winds["ESWN".indexOf(key[1]!)]}`;
            if (key[0] === "d") return `d${dragons["RGW".indexOf(key[1]!)]}`;
            const suit = suits["bco".indexOf(key[0]!)]!;
            const rank = Number(key[1]);
            return `${suit}${flip ? 10 - rank : rank}`;
          });
        }
      }
    }
  }
  return out;
}

const ORDER = new Map(PLAY_TILE_KEYS.map((key, index) => [key, index]));
const canonical = (tiles: readonly string[]): string =>
  [...tiles].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!).join("");
const split = (text: string): string[] => text.match(/../g) ?? [];

const lines: string[] = [];
let total = 0;
const report: string[] = [];
const TRANSFORMS = transforms();

for (const pattern of PATTERNS) {
  if (pattern.tier === "calculate") continue;
  const seed = SEEDS.get(pattern.id);
  if (seed === undefined) throw new Error(`no catalogue seed for ${pattern.id}`);
  const seedTiles = seed.trim().split(/\s+/);
  if (seedTiles.length !== 14) {
    report.push(`${pattern.id}: skipped (${seedTiles.length} tiles)`);
    continue;
  }

  const accepts = (tiles: readonly string[]): boolean => {
    if (tiles.some((key) => tiles.filter((other) => other === key).length > 4)) return false;
    const hand = createHand({ concealed: tiles.join(" "), selfDrawn: pattern.requiresSelfDrawn });
    return pattern.match({
      shape: normalizeHand(hand),
      hand,
      isConcealed: true,
      isSelfDrawn: pattern.requiresSelfDrawn,
    });
  };
  if (!accepts(seedTiles)) throw new Error(`seed for ${pattern.id} does not match its pattern`);

  const found = new Set<string>();
  const queue: string[] = [];
  for (const transform of TRANSFORMS) {
    const tiles = seedTiles.map(transform);
    const key = canonical(tiles);
    if (found.has(key) || !accepts(tiles)) continue;
    found.add(key);
    queue.push(key);
  }

  for (let head = 0; head < queue.length && found.size < CAP; head++) {
    const tiles = split(queue[head]!);
    const kinds = [...new Set(tiles)];
    const candidates: string[][] = [];
    for (const from of kinds) {
      for (const to of PLAY_TILE_KEYS) {
        if (to === from) continue;
        candidates.push(tiles.map((key) => (key === from ? to : key)));
        const one = [...tiles];
        one[one.indexOf(from)] = to;
        candidates.push(one);
      }
    }
    for (const next of candidates) {
      if (found.size >= CAP) break;
      const key = canonical(next);
      if (found.has(key) || !accepts(next)) continue;
      found.add(key);
      queue.push(key);
    }
  }

  total += found.size;
  report.push(`${pattern.id}: ${found.size}`);
  lines.push(`  [${JSON.stringify(pattern.id)}, ${JSON.stringify([...found].sort().join(" "))}],`);
}

const output = `/**
 * GENERATED by scripts/bot-targets.ts - do not edit by hand.
 *
 * Concrete winning hands for the bots to aim at: for each fixed-tier
 * catalogue pattern, its hands as concatenated two-character tile keys
 * ("b1b1b2..."), fourteen tiles each, separated by spaces. Every hand is
 * accepted by its pattern's own predicate (test/core/bot-targets.test.ts).
 */

export const SPECIAL_TARGETS: readonly (readonly [string, string])[] = [
${lines.join("\n")}
];
`;

writeFileSync(new URL("../src/core/game/bot/targets.ts", import.meta.url), output);
console.log(report.join("\n"));
console.log(`${total} hands, ${output.length} bytes`);
