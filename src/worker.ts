import { handle } from "@astrojs/cloudflare/handler";
import { PREVIEW_PATH } from "./lib/preview-session";
import { onDemandHeaders } from "./lib/security-headers";

// The Worker's entry, named by `main` in wrangler.jsonc. It wraps the
// adapter's handler because the framework answers some requests before any
// middleware runs: the trailing-slash redirect, the cross-site POST refusal,
// a malformed address. Headers set here reach those too.

type Handle = typeof handle;

/** Every response the Worker sends, with the on-demand headers on it. */
export async function respond(
  render: () => Promise<Response>,
  url: URL,
): Promise<Response> {
  // The router matches /preview/posts/a/index.html to the draft page, then
  // cannot read the slug back out of it and fails with a bare 500.
  const broken =
    url.pathname.startsWith(`${PREVIEW_PATH}/`) &&
    url.pathname.endsWith("/index.html");
  const response = broken
    ? new Response("Not found", { status: 404 })
    : await render();

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(onDemandHeaders(url.pathname))) {
    headers.set(name, value);
  }

  // A redirect never repeats the query: the framework's trailing-slash
  // redirect would hand a preview link's secret back, in its body too.
  const location = headers.get("Location");
  if (location) {
    headers.set("Location", location.split("?")[0]);
    headers.delete("Content-Type");
    return new Response(null, { status: response.status, headers });
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
    );
  },
};
