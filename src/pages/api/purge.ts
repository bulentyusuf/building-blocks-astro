import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { cache } from "cloudflare:workers";
import { handlePurge } from "../../lib/purge";

export const prerender = false;

// Where Contentful's webhook lands on a publish, unpublish or delete. It
// purges the cached pages the change reaches. With the route cache off there
// is nothing to purge, and the address answers as if it were not here.
export const POST: APIRoute = ({ request }) =>
  import.meta.env.ROUTE_CACHE
    ? handlePurge(request, {
        secret: getSecret("CONTENTFUL_WEBHOOK_SECRET")?.trim(),
        purge: (tags) => cache.purge({ tags }),
      })
    : new Response("Not found", { status: 404 });
