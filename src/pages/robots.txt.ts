import type { APIRoute } from "astro";

// Closed unless the build was explicitly opened to crawlers. Open, it still
// keeps them off the routes the Worker answers.
export const GET: APIRoute = () =>
  new Response(
    import.meta.env.ALLOW_INDEXING
      ? "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /preview/\n"
      : "User-agent: *\nDisallow: /\n",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
