/**
 * The app Worker's room routes (docs/MULTIPLAYER.md, M2):
 *
 *   POST /api/room/new      open a room with a fresh code: `{ code }`
 *   GET  /api/room/<code>   join it, as a WebSocket upgrade
 *
 * Both go to the room's Durable Object (`room-object.ts`), named by its code,
 * in the rooms Worker this one is bound to. Without the binding (a local
 * build, a fork) the routes answer 503 and the offline game is unaffected.
 */

/** Room codes avoid letters and digits that look alike (0/O, 1/I/L, 5/S, 2/Z, 8/B). */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
export const CODE_LENGTH = 4;
export const ROOM_ROUTE = "/api/room/";
const CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface RoomRouteEnv {
  readonly ROOMS?: RoomNamespace;
  /** Cloudflare's rate limiter on opening rooms, where it is bound. */
  readonly ROOM_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function isRoomCode(value: string): boolean {
  return CODE.test(value);
}

export function newCode(random: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string {
  return [...random(CODE_LENGTH)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export async function handleRoom(
  request: Request,
  env: RoomRouteEnv,
  random?: (size: number) => Uint8Array,
): Promise<Response> {
  const rooms = env.ROOMS;
  if (rooms === undefined) return json(503, { error: "online rooms are not available here" });
  const path = new URL(request.url).pathname;

  if (path === `${ROOM_ROUTE}new`) {
    if (request.method !== "POST") return json(405, { error: "use POST" });
    const address = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (env.ROOM_LIMIT !== undefined && !(await env.ROOM_LIMIT.limit({ key: address })).success) {
      return json(429, { error: "too many new rooms, try again in a minute" });
    }
    // A taken code is drawn again; with 390 625 codes a few tries always do.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode(random);
      const stub = rooms.get(rooms.idFromName(code));
      const created = await stub.fetch(new Request(`https://room/create?code=${code}`, { method: "POST" }));
      if (created.status === 201) return json(201, { code });
      if (created.status !== 409) return json(502, { error: "the room could not be opened" });
    }
    return json(503, { error: "no free room code, try again" });
  }

  const code = path.slice(ROOM_ROUTE.length).toUpperCase();
  if (!isRoomCode(code)) return json(404, { error: "no such room" });
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json(426, { error: "a room is joined over a WebSocket" });
  }
  return rooms.get(rooms.idFromName(code)).fetch(request);
}
