#!/usr/bin/env node
/**
 * Start the web table. The only job here is flags and the socket: the HTTP
 * handler lives in src/server/server.ts and the games in src/server/session.ts.
 *
 *   npm run serve
 *   npm run serve -- --port 8081 --seed table-7
 */

import { createAppServer } from "../src/server/server.ts";
import { GameStore } from "../src/server/session.ts";

export const SERVE_USAGE = `Usage: npm run serve -- [options]

Options:
  --port <n>      port to listen on (default 8080; 0 picks a free port)
  --seed <seed>   default deal seed for POST /api/new (default "web")
  --help          show this help

The server binds 127.0.0.1 only. Open the printed URL in a browser.`;

export interface ServeOptions {
  readonly port: number;
  readonly seed: string;
  readonly help: boolean;
}

export function parseServeArgs(argv: readonly string[]): ServeOptions {
  let port = 8080;
  let seed = "web";
  let help = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--port") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--port needs a number");
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error(`invalid port "${value}"`);
      }
      port = parsed;
    } else if (argument === "--seed") {
      const value = argv[++index];
      if (value === undefined) throw new Error("--seed needs a value");
      seed = value;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option "${argument}"`);
    } else {
      throw new Error(`unexpected argument "${argument}"`);
    }
  }

  return { port, seed, help };
}

function main(): void {
  let options: ServeOptions;
  try {
    options = parseServeArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(SERVE_USAGE);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(SERVE_USAGE);
    return;
  }

  const store = new GameStore({ defaultSeed: options.seed });
  const server = createAppServer({ store });
  server.on("error", (error) => {
    console.error(`cannot start the server: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : options.port;
    console.log(`Mahjong table on http://127.0.0.1:${port} (seed "${options.seed}")`);
  });
}

main();
