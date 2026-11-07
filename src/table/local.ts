/**
 * The table's API, answered inside the browser.
 *
 * The app has no server: the 3D table (`app/src/main.js`) hands each request
 * to `request` here, and `routeApi` answers it from an in-page `GameStore`.
 * Answers pass through a JSON round trip, so the table only ever sees plain
 * data - never a live engine object.
 *
 * After every answer about the dealt game, its seed and decisions are written
 * to storage, so closing the tab (or iOS evicting it) never loses a hand:
 * `resume` replays the saved steps through the reducer and continues.
 */

import { createApiContext, routeApi } from "./api.ts";
import { describeEventFor } from "../core/game/describe.ts";
import { isSessionSnapshot, statePayload } from "./session.ts";

/** Bump the suffix when a saved game can no longer be replayed. */
export const SAVE_KEY = "int-maj:game:v1";

/** The subset of the Web Storage API this module uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalApi {
  /** Same contract as the client's `fetch` wrapper: resolve data or throw. */
  request(path: string, body?: unknown): Promise<unknown>;
  /** The saved game's first payload, or null when there is nothing to resume. */
  resume(): unknown;
  /** Forget the saved game. */
  clear(): void;
}

export function createLocalApi(storage: KeyValueStorage | null): LocalApi {
  const context = createApiContext();
  // Only the dealt game is saved; review scenarios never overwrite it.
  let saved: string | null = null;

  function save(id: string): void {
    const snapshot = context.store.snapshot(id);
    if (storage === null || snapshot === undefined) return;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage full or refused (private mode): play on without saving.
    }
  }

  function clear(): void {
    try {
      storage?.removeItem(SAVE_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  return {
    async request(path, body) {
      const url = new URL(path, "http://local.invalid");
      const answer = routeApi(context, {
        method: body === undefined ? "GET" : "POST",
        path: url.pathname,
        query: url.searchParams,
        body,
      });
      if (answer === null) throw new Error(`not found: ${url.pathname}`);
      const data = JSON.parse(JSON.stringify(answer.body)) as Record<string, unknown>;
      if (answer.status >= 400) {
        throw new Error(typeof data.error === "string" ? data.error : `HTTP ${answer.status}`);
      }
      if (url.pathname === "/api/new" && typeof data.game === "string") saved = data.game;
      const game = (body as { game?: unknown } | undefined)?.game ?? data.game;
      if (body !== undefined && game === saved && saved !== null) save(saved);
      return data;
    },

    resume() {
      let text: string | null = null;
      try {
        text = storage?.getItem(SAVE_KEY) ?? null;
      } catch {
        return null;
      }
      if (text === null) return null;
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(text);
      } catch {
        clear();
        return null;
      }
      if (!isSessionSnapshot(snapshot)) {
        clear();
        return null;
      }
      const restored = context.store.restore(snapshot);
      if ("error" in restored) {
        clear();
        return null;
      }
      saved = restored.session.id;
      return JSON.parse(
        JSON.stringify({
          ...statePayload(restored.session),
          events: restored.events.flatMap((event) => describeEventFor(event, restored.session.seat).split("\n")),
          replaceLog: true,
        }),
      );
    },

    clear,
  };
}
