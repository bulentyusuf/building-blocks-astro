import type { AstroIntegration } from "astro";

// The kill switch for instant publishing. With ROUTE_CACHE=true these pages
// render on request and Cloudflare's cache holds them until a purge. Unset,
// each is built as a static file, exactly as if this file were not here.
export const ON_DEMAND_PAGES = [
  "src/pages/index.astro",
  "src/pages/archive.astro",
  "src/pages/posts/[slug].astro",
  "src/pages/de/posts/[slug].astro",
  "src/pages/tags/index.astro",
  "src/pages/tags/[slug].astro",
  "src/pages/categories/[slug].astro",
  "src/pages/authors/[slug].astro",
];

/** Only the exact word turns it on, so a typo leaves the site static. */
export function routeCacheOn(value: string | undefined): boolean {
  return value?.trim() === "true";
}

export function routeCache(enabled: boolean): AstroIntegration {
  return {
    name: "route-cache",
    hooks: {
      "astro:route:setup": ({ route }) => {
        if (enabled && ON_DEMAND_PAGES.includes(route.component)) {
          route.prerender = false;
        }
      },
    },
  };
}
