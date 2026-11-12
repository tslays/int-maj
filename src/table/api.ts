/**
 * The table's API routes as one pure function.
 *
 * `routeApi` takes a parsed request (method, path, query, JSON body) and
 * returns `{ status, body }`. It has no I/O: the 3D table calls it in the
 * browser through `src/table/local.ts`, and the tests call it directly, so both
 * exercise exactly the same game, bots and projections.
 *
 *   GET  /api/state?game=     one seat's view, legal actions and wait panel
 *   GET  /api/closest?game=   the catalogue hands your tiles are nearest to
 *                             (`&limit=` up to 100 instead of the default three;
 *                             `&pins=a,b,c` also reports how near each pinned hand is)
 *   GET  /api/hand?pattern=   one catalogue hand's conditions (concealed or open)
 *   GET  /api/house-rules     the hand sets on offer and the hands each leaves out
 *   GET  /api/hands?set=      the hands in play (set: all, companion, companion-pictured) with the book's headings, for the index
 *   GET  /api/scenario?state= a fixed review board (turn, claim, win, ...)
 *   POST /api/new             deal a game from `{ seed, houseRules }`
 *   POST /api/move            apply `{ game, action }`, return events as text
 *   POST /api/step            the next single bot decision, or `{ done }`
 *   POST /api/undo            replay to before the previous human decision
 *   POST /api/retry           play the current hand again from its deal
 *   POST /api/next            deal the next hand after a finished one, under
 *                             `{ houseRules }` when they are given
 *
 * `houseRules` is `{ handSet: "all" | "companion" | "companion-pictured" }`; a hand keeps the rules
 * it was dealt with, so a change shows from the next deal.
 */

import { handDetail, handIndex } from "../core/game/closest.ts";
import { HAND_SET_EXCLUDED, HAND_SETS } from "../core/patterns/table.ts";
import { describeEventFor } from "../core/game/describe.ts";
import type { Action } from "../core/game/actions.ts";
import {
  closestPayload,
  DEFAULT_HOUSE_RULES,
  GameStore,
  houseRulesPayload,
  isDone,
  isHandSet,
  statePayload,
  type HouseRules,
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

/** The body's `houseRules`, or undefined when the request does not set them. */
function optionalHouseRules(record: Record<string, unknown>): HouseRules | undefined {
  const value = record.houseRules;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "houseRules must be an object");
  }
  const rules = value as Record<string, unknown>;
  const handSet = rules.handSet ?? DEFAULT_HOUSE_RULES.handSet;
  if (!isHandSet(handSet)) {
    throw new ApiError(400, `houseRules.handSet must be one of ${HAND_SETS.join(", ")}`);
  }
  return { handSet };
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

  if (request.path === "/api/closest") {
    const id = request.query.get("game");
    if (id === null || id.length === 0) return fail(400, "game is required");
    const session = store.get(id);
    if (session === undefined) return fail(404, `unknown game: ${id}`);
    const limit = Number(request.query.get("limit") ?? "");
    return ok(
      closestPayload(
        session,
        Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : undefined,
        (request.query.get("pins") ?? "").split(",").filter((id) => id.length > 0),
      ),
      request.query.has("pretty"),
    );
  }

  if (request.path === "/api/house-rules") {
    return ok(houseRulesPayload(), request.query.has("pretty"));
  }
  if (request.path === "/api/hands") {
    const set = request.query.get("set") ?? "all";
    if (!isHandSet(set)) return fail(400, `set must be one of ${HAND_SETS.join(", ")}`);
    return ok(handIndex(HAND_SET_EXCLUDED[set]), request.query.has("pretty"));
  }

  if (request.path === "/api/hand") {
    const id = request.query.get("pattern");
    if (id === null || id.length === 0) return fail(400, "pattern is required");
    const detail = handDetail(id);
    if (detail === null) return fail(404, `unknown hand: ${id}`);
    return ok(detail, request.query.has("pretty"));
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
    const update = store.create(seed, optionalHouseRules(body));
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

  if (request.path === "/api/retry") {
    const game = requireString(body, "game");
    const update = store.retry(game);
    if ("error" in update) return fail(400, update.error);
    return ok({
      ...statePayload(update.session),
      events: [
        ...update.session.events.flatMap((event) => describeEventFor(event, update.session.seat).split("\n")),
        "Playing this hand again.",
      ],
      replaceLog: true,
    });
  }

  if (request.path === "/api/next") {
    const game = requireString(body, "game");
    const update = store.next(game, optionalHouseRules(body));
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
