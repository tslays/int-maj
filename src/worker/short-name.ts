/**
 * The name a phone gives the app when it is added to the home screen. Every
 * site runs the same static build, so the Worker writes the site's own name
 * (`APP_SHORT_NAME`, set per environment in wrangler.jsonc) into the two places
 * a phone reads it: the page's `apple-mobile-web-app-title` (iOS Safari) and the
 * manifest's `short_name` (Android and desktop Chromium).
 */

/** The paths whose content carries the name. Only these go through the Worker. */
export const SHORT_NAME_ROUTES: readonly string[] = ["/", "/index.html", "/manifest.webmanifest"];

export interface ShortNameEnv {
  /** The site's name, e.g. `int-maj`. Unset: the build's own name is served. */
  readonly APP_SHORT_NAME?: string;
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

const APPLE_TITLE = /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/;

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The page or manifest with the site's name in it; unchanged when it has no such field. */
export function withShortName(path: string, body: string, name: string): string {
  if (path === "/manifest.webmanifest") {
    const manifest = JSON.parse(body) as Record<string, unknown>;
    manifest.short_name = name;
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }
  return body.replace(APPLE_TITLE, (_, open: string, close: string) => `${open}${escapeAttribute(name)}${close}`);
}

/** A GET for a name route: the built file, with this site's name written in. */
export async function handleShortName(request: Request, env: ShortNameEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const name = env.APP_SHORT_NAME;
  if (request.method !== "GET" || !name || !response.ok) return response;
  const path = new URL(request.url).pathname;
  const body = withShortName(path, await response.text(), name);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, { status: response.status, headers });
}
