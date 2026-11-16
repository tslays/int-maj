/**
 * The Cloudflare Worker in front of the static app. It answers `POST /api/report`
 * and, behind a secret token, `GET /api/report-photo/<key>`; every other request is a file of the built app. The
 * game itself still runs entirely in the browser.
 */

import { PHOTO_ROUTE, handlePhotoRead, type PhotoReadEnv } from "./photo-read.ts";
import { handleReport, type ReportEnv } from "./report.ts";

interface Env extends ReportEnv, Omit<PhotoReadEnv, "REPORT_PHOTOS"> {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/report") return handleReport(request, env);
    if (path.startsWith(PHOTO_ROUTE)) return handlePhotoRead(request, env);
    return env.ASSETS.fetch(request);
  },
};
