import type { PhotoStore } from "./report.ts";

/**
 * `GET /api/report-photo/<key>`: lets a maintainer (or a session) read back
 * one report photo from the private store. The bucket stays private: the route
 * answers only a request that carries the secret `REPORT_PHOTO_TOKEN` as a
 * bearer token, and answers 404 to everything else, so it does not reveal
 * that it exists. Without the secret set on a site, the route is closed.
 */

export interface PhotoReadEnv {
  /** The bearer token that opens the route; a Worker secret. */
  readonly REPORT_PHOTO_TOKEN?: string;
  readonly REPORT_PHOTOS?: PhotoStore;
}

export const PHOTO_ROUTE = "/api/report-photo/";
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const NOT_FOUND = (): Response => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

/** Compare two strings without stopping at the first difference. */
function sameToken(given: string, expected: string): boolean {
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function handlePhotoRead(request: Request, env: PhotoReadEnv): Promise<Response> {
  const expected = env.REPORT_PHOTO_TOKEN;
  if (request.method !== "GET" || !expected || !env.REPORT_PHOTOS) return NOT_FOUND();
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!sameToken(bearer, expected)) return NOT_FOUND();
  const key = new URL(request.url).pathname.slice(PHOTO_ROUTE.length);
  if (!KEY.test(key)) return NOT_FOUND();
  const photo = await env.REPORT_PHOTOS.get(key);
  if (!photo) return NOT_FOUND();
  return new Response(photo.body, {
    headers: {
      "content-type": photo.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
