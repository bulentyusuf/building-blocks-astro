import { handle } from "@astrojs/cloudflare/handler";
import { PREVIEW_PATH } from "./lib/preview-session";
import { cachedPageHeaders, onDemandHeaders } from "./lib/security-headers";

// The Worker's entry, named by `main` in wrangler.jsonc. It wraps the
// adapter's handler because the framework answers some requests before any
// middleware runs: the trailing-slash redirect, the cross-site POST refusal,
// a malformed address. Headers set here reach those too.

type Handle = typeof handle;

// How a page asks Cloudflare's cache to hold it, and under which tags.
const EDGE_CACHE = "Cloudflare-CDN-Cache-Control";
const CACHE_TAG = "Cache-Tag";

// Never held, whatever a route asks for: drafts and the endpoints.
const PRIVATE_PATHS = [`${PREVIEW_PATH}/`, "/api/"];

const isPrivate = (url: URL) =>
  PRIVATE_PATHS.some((path) => url.pathname.startsWith(path));

/** A public page that rendered, asked to be cached and sets no cookie. */
function held(url: URL, response: Response): boolean {
  return (
    response.status === 200 &&
    !isPrivate(url) &&
    !response.headers.has("Set-Cookie") &&
    (response.headers.get(EDGE_CACHE) ?? "").startsWith("public")
  );
}

async function fingerprint(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest).subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// A page's file name: /archive.html, /index.html, /posts/a/index.html.
const FILE_NAME = /(\/index)?\.html$/;

/** Every response the Worker sends, with the on-demand headers on it. */
export async function respond(
  render: () => Promise<Response>,
  url: URL,
  { routeCache = false, allowIndexing = false, analytics = false } = {},
): Promise<Response> {
  // The router matches /preview/posts/a/index.html to the draft page, then
  // cannot read the slug back out of it and fails with a bare 500.
  const broken =
    url.pathname.startsWith(`${PREVIEW_PATH}/`) &&
    url.pathname.endsWith("/index.html");
  // The static host sends a page's file name to its clean address. A page
  // rendered on request has no file, and the router would render it a second
  // time under that name, so the Worker sends the same redirect.
  const named = routeCache && !isPrivate(url) && FILE_NAME.test(url.pathname);
  const response = broken
    ? new Response("Not found", { status: 404 })
    : named
      ? new Response(null, {
          status: 307,
          headers: { Location: url.pathname.replace(FILE_NAME, "") || "/" },
        })
      : await render();

  const headers = new Headers(response.headers);
  // With the route cache on, a held page is public and takes a static file's
  // headers. Everything else stays unindexable and is stored nowhere.
  const cached = routeCache && held(url, response);
  const ours = cached
    ? cachedPageHeaders(url.pathname, { allowIndexing, analytics })
    : onDemandHeaders(url.pathname);
  for (const [name, value] of Object.entries(ours)) {
    headers.set(name, value);
  }
  if (routeCache && !cached) {
    headers.set(EDGE_CACHE, "no-store");
    headers.delete(CACHE_TAG);
  }

  // A redirect never repeats the query: the framework's trailing-slash
  // redirect would hand a preview link's secret back, in its body too.
  const location = headers.get("Location");
  if (location) {
    headers.set("Location", location.split("?")[0]);
    headers.delete("Content-Type");
    return new Response(null, { status: response.status, headers });
  }

  // A static page carries a validator, so a returning browser is told "not
  // modified" and downloads nothing. A held page gets one from its own bytes.
  if (cached) {
    const body = await response.arrayBuffer();
    headers.set("ETag", `"${await fingerprint(body)}"`);
    return new Response(body, { status: response.status, headers });
  }

  // Rebuilt, because a response from the static host has immutable headers.
  return new Response(response.body, { status: response.status, headers });
}

export default {
  fetch(...args: Parameters<Handle>): Promise<Response> {
    const [request] = args;
    return respond(
      async () => (await handle(...args)) as Response,
      new URL(request.url),
      {
        routeCache: import.meta.env.ROUTE_CACHE,
        allowIndexing: import.meta.env.ALLOW_INDEXING,
        analytics: import.meta.env.ANALYTICS_BEACON_TOKEN !== "",
      },
    );
  },
};
