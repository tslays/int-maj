/**
 * The Cloudflare Worker in front of the static app. It answers one address,
 * `POST /api/report`; every other request is a file of the built app. The
 * game itself still runs entirely in the browser.
 */

import { handleReport, type ReportEnv } from "./report.ts";

interface Env extends ReportEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/api/report") return handleReport(request, env);
    return env.ASSETS.fetch(request);
  },
};
