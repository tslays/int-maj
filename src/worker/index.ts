/**
 * The Cloudflare Worker in front of the static app. It answers `POST /api/report`
 * and, behind a secret token, `GET /api/report-photo/<key>`; the page and manifest get the site's
 * home-screen name written in (`short-name.ts`); `/api/room/*` goes to the online rooms
 * (`room-route.ts`); every other request is a file of the built app. A game against the bots
 * still runs entirely in the browser.
 */

import { PHOTO_ROUTE, handlePhotoRead, type PhotoReadEnv } from "./photo-read.ts";
import { handleReport, type ReportEnv } from "./report.ts";
import { ROOM_ROUTE, handleRoom, type RoomRouteEnv } from "./room-route.ts";
import { SHORT_NAME_ROUTES, handleShortName, type ShortNameEnv } from "./short-name.ts";

interface Env extends ReportEnv, Omit<PhotoReadEnv, "REPORT_PHOTOS">, ShortNameEnv, RoomRouteEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/report") return handleReport(request, env);
    if (path.startsWith(ROOM_ROUTE)) return handleRoom(request, env);
    if (path.startsWith(PHOTO_ROUTE)) return handlePhotoRead(request, env);
    if (SHORT_NAME_ROUTES.includes(path)) return handleShortName(request, env);
    return env.ASSETS.fetch(request);
  },
};
