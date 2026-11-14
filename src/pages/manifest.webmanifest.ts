import type { APIRoute } from "astro";
import { SITE_DESCRIPTION, SITE_TITLE, THEME_COLOR } from "../lib/constants";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: SITE_TITLE,
      short_name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      start_url: "/",
      display: "minimal-ui",
      background_color: THEME_COLOR,
      theme_color: THEME_COLOR,
      icons: [
        { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
        { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
        // Chrome needs a 192 and a 512 PNG before it offers to install a site.
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
