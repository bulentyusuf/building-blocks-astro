import type { APIRoute } from "astro";

// Closed unless the build was explicitly opened to crawlers.
export const GET: APIRoute = () =>
  new Response(
    import.meta.env.ALLOW_INDEXING
      ? "User-agent: *\nAllow: /\n"
      : "User-agent: *\nDisallow: /\n",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
