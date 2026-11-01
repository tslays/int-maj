#!/usr/bin/env node
/**
 * Table checker CLI.
 *
 *   npm run check -- "b1 b2 b3 (b4 b5 b6) c7 c8 c9 wE wE"
 *   echo "b1 ..." | npm run check
 *
 * This is the only place that reads stdin: src/core/check.ts stays pure.
 */

import {
  checkHand,
  parseTiles,
  summarizeMatch,
  type CheckResult,
  type MatchSummary,
  type ParsedTiles,
} from "../src/core/check.ts";
import { tileKey, type PlayTile } from "../src/core/tiles.ts";

const USAGE = `Usage: npm run check -- "b1 b2 b3 (b4 b5 b6) c7 c8 c9 wE wE"
       echo "b1 b2 b3" | npm run check
Options:
  --json  machine-readable result
  --all   one line per match for each wait instead of one joined line`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function formatTiles(parsed: ParsedTiles): string {
  const groupAt = new Map<number, PlayTile[]>();
  parsed.meldGroups.forEach((group, index) => {
    groupAt.set(parsed.exposedMelds[index]!, group);
  });

  const parts: string[] = [];
  for (let index = 0; index < parsed.tiles.length; ) {
    const group = groupAt.get(index);
    if (group) {
      parts.push(`(${group.map(tileKey).join(" ")})`);
      index += group.length;
    } else {
      parts.push(tileKey(parsed.tiles[index]!));
      index += 1;
    }
  }
  return parts.join(" ");
}

function describeMatch(match: MatchSummary): string {
  const lead = match.points === null ? "calculate" : `${match.points} ${match.tier}`;
  return `${lead}  ${match.name} (${match.concealed ? "concealed" : "exposed"})`;
}

function jsonResult(result: CheckResult, parsed: ParsedTiles): unknown {
  const common = {
    tiles: parsed.tiles.map(tileKey),
    bonuses: parsed.bonuses.map(tileKey),
  };

  if (result.size === null) {
    return { size: null, ...common, errors: result.errors };
  }
  if (result.size === 14) {
    return {
      size: 14,
      ...common,
      concealed: result.concealed,
      best: result.best === null ? null : summarizeMatch(result.best),
      matches: result.matches.map(summarizeMatch),
    };
  }
  return {
    size: 13,
    ...common,
    waits: result.waits.map((wait) => ({
      tile: tileKey(wait.tile),
      remaining: wait.remaining,
      dead: wait.dead,
      selfDrawnOnly: wait.selfDrawnOnly,
      matches: wait.matches.map(summarizeMatch),
    })),
  };
}

function printHuman(result: CheckResult, parsed: ParsedTiles, all: boolean): void {
  if (result.size === null) {
    for (const error of result.errors) console.error(`error: ${error}`);
    process.exitCode = 1;
    return;
  }

  const physical = parsed.tiles.length;
  const label =
    physical === result.size
      ? `${result.size} tiles`
      : `${physical} tiles (${result.size} + ${physical - result.size} kong)`;
  console.log(`${label}: ${formatTiles(parsed)}`);
  if (parsed.bonuses.length > 0) {
    console.log(`bonuses: ${parsed.bonuses.map(tileKey).join(" ")}`);
  }

  if (result.size === 14) {
    if (result.matches.length === 0) {
      console.log("no catalogue hand");
      return;
    }
    result.matches.forEach((match, index) => {
      const mark = index === 0 ? "*" : " ";
      console.log(`${mark} ${describeMatch(summarizeMatch(match))}`);
    });
    return;
  }

  if (result.waits.length === 0) {
    console.log("no completing tiles");
    return;
  }
  for (const wait of result.waits) {
    const head = `${tileKey(wait.tile)}  ${
      wait.dead ? "dead" : `x${wait.remaining} left`
    }${wait.selfDrawnOnly ? "  self-drawn" : ""}`;
    if (!all) {
      console.log(
        `${head}  ${wait.matches.map((match) => describeMatch(summarizeMatch(match))).join(" / ")}`,
      );
      continue;
    }
    console.log(head);
    for (const match of wait.matches) {
      console.log(`    ${describeMatch(summarizeMatch(match))}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let json = false;
  let all = false;
  const inputParts: string[] = [];

  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--all") all = true;
    else inputParts.push(arg);
  }

  let input = inputParts.join(" ").trim();
  if (input.length === 0) {
    input = (await readStdin()).trim();
  }
  if (input.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const parsed = parseTiles(input);
  const result = checkHand(input);

  if (json) {
    console.log(JSON.stringify(jsonResult(result, parsed), null, 2));
    if (result.size === null) process.exitCode = 1;
    return;
  }

  printHuman(result, parsed, all);
}

await main();
