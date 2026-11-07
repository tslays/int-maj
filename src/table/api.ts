/**
 * The table's API routes as one pure function.
 *
 * `routeApi` takes a parsed request (method, path, query, JSON body) and
 * returns `{ status, body }`. It has no I/O: the 3D table calls it in the
 * browser through `src/table/local.ts`, and the tests call it directly, so both
 * exercise exactly the same game, bots and projections.
 *
 *   GET  /api/state?game=     one seat's view, legal actions and wait panel
 *   GET  /api/scenario?state= a fixed review board (turn, claim, win, ...)
 *   POST /api/new             deal a game from `{ seed }`
 *   POST /api/move            apply `{ game, action }`, return events as text
 *   POST /api/step            the next single bot decision, or `{ done }`
 *   POST /api/undo            replay to before the previous human decision
 *   POST /api/next            deal the next hand after a finished one
 */

import { describeEventFor } from "../core/game/describe.ts";
import type { Action } from "../core/game/actions.ts";
import {
  GameStore,
  isDone,
  statePayload,
  type SessionUpdate,
} from "./session.ts";
import {
  isScenarioName,
  SCENARIOS,
  scenarioSession,
  type ScenarioName,
} from "./scenarios.ts";

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  /** The parsed JSON body of a POST; ignored for GET. */
  readonly body?: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  /** The client asked for indented JSON (`&pretty=1`). */
  readonly pretty?: boolean;
}

/** Everything a router needs to remember between requests. */
export interface ApiContext {
  readonly store: GameStore;
  /** Scenario id per name: reloading a state reuses its board until it moves. */
  readonly scenarios: Map<ScenarioName, string>;
}

export function createApiContext(store: GameStore = new GameStore()): ApiContext {
  return { store, scenarios: new Map() };
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `${key} is required`);
  }
  return value;
}

function requireAction(record: Record<string, unknown>): Action {
  const value = record.action;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "action is required");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    throw new ApiError(400, "action.type is required");
  }
  if (typeof candidate.seat !== "string") {
    throw new ApiError(400, "action.seat is required");
  }
  return value as Action;
}

/** The public event log as text lines the client can append to its log. */
function responsePayload(update: SessionUpdate, extraEvents: readonly string[] = []) {
  return {
    ...statePayload(update.session),
    events: [
      ...update.events.flatMap((event) => describeEventFor(event, update.session.seat).split("\n")),
      ...extraEvents,
    ],
  };
}

const ok = (body: unknown, pretty = false): ApiResponse => ({ status: 200, body, pretty });
const fail = (status: number, error: string): ApiResponse => ({ status, body: { error } });

function routeGet(context: ApiContext, request: ApiRequest): ApiResponse | null {
  const { store, scenarios } = context;
  if (request.path === "/api/scenario") {
    const name = request.query.get("state") ?? "";
    if (!isScenarioName(name)) return fail(400, `unknown state: ${name}`);
    const session = scenarioSession(store, scenarios, name);
    return ok({
      ...statePayload(session),
      state: name,
      title: SCENARIOS[name].title,
      events: session.events.flatMap((event) => describeEventFor(event, session.seat).split("\n")),
    });
  }

  if (request.path === "/api/state") {
    const id = request.query.get("game");
    if (id === null || id.length === 0) return fail(400, "game is required");
    const session = store.get(id);
    if (session === undefined) return fail(404, `unknown game: ${id}`);
    return ok(statePayload(session), request.query.has("pretty"));
  }

  return null;
}

function routePost(context: ApiContext, request: ApiRequest): ApiResponse | null {
  const { store } = context;
  const body = asRecord(request.body);

  if (request.path === "/api/new") {
    const seed = body.seed;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
      throw new ApiError(400, "seed must be a string or number");
    }
    const update = store.create(seed);
    return ok({ ...responsePayload(update), replaceLog: true });
  }

  if (request.path === "/api/move") {
    const game = requireString(body, "game");
    const action = requireAction(body);
    const update = store.move(game, action);
    if ("error" in update) return fail(400, update.error);
    return ok(responsePayload(update));
  }

  if (request.path === "/api/step") {
    const game = requireString(body, "game");
    const update = store.step(game);
    if ("error" in update) return fail(400, update.error);
    if (isDone(update)) return ok({ done: true });
    return ok(responsePayload(update));
  }

  if (request.path === "/api/undo") {
    const game = requireString(body, "game");
    const update = store.undo(game);
    if ("error" in update) return fail(400, update.error);
    return ok({
      ...statePayload(update.session),
      events: [
        ...update.session.events.flatMap((event) => describeEventFor(event, update.session.seat).split("\n")),
        "Undid the previous decision.",
      ],
      replaceLog: true,
    });
  }

  if (request.path === "/api/next") {
    const game = requireString(body, "game");
    const update = store.next(game);
    if ("error" in update) return fail(400, update.error);
    return ok(responsePayload(update));
  }

  return null;
}

/**
 * Answer one API request, or null when the path is not an API route (the
 * caller may then serve a static file). Malformed input becomes a 4xx answer;
 * it never throws.
 */
export function routeApi(context: ApiContext, request: ApiRequest): ApiResponse | null {
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      return routeGet(context, request);
    }
    if (request.method !== "POST") {
      return request.path.startsWith("/api/") ? fail(405, "method not allowed") : null;
    }
    return routePost(context, request) ?? fail(404, "not found");
  } catch (error) {
    if (error instanceof ApiError) return fail(error.status, error.message);
    throw error;
  }
}
