import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AstroIntegration, IntegrationResolvedRoute } from "astro";

// The kill switch for instant publishing. With ROUTE_CACHE=true these pages
// render on request and Cloudflare's cache holds them until a purge. Unset,
// each is built as a static file, exactly as if this file were not here.
export const ON_DEMAND_PAGES = [
  "src/pages/index.astro",
  "src/pages/archive.astro",
  "src/pages/posts/[slug].astro",
  "src/pages/de/posts/[slug].astro",
  "src/pages/tags/[slug].astro",
  "src/pages/categories/[slug].astro",
  "src/pages/authors/[slug].astro",
];

// Search is indexed from built pages, and a post rendered on request leaves
// none. So the English posts are also built here, read by the search index
// and then deleted: integrations/search-index.ts.
export const SEARCH_SOURCE = "search-source";

/** Only the exact word turns it on, so a typo leaves the site static. */
export function routeCacheOn(value: string | undefined): boolean {
  return value?.trim() === "true";
}

/** The address a built file answers at, as the static host serves it. */
export function servedPath(file: string): string {
  const path = `/${file}`.replace(/\.html$/, "").replace(/\/index$/, "");
  return path || "/";
}

/**
 * Built pages that would answer in place of an on-demand route. The static
 * host serves a file before the Worker runs, so one would freeze its page.
 */
export function shadowing(
  files: string[],
  routes: Pick<IntegrationResolvedRoute, "isPrerendered" | "patternRegex">[],
): string[] {
  const onDemand = routes.filter((route) => !route.isPrerendered);
  return files.filter(
    (file) =>
      file.endsWith(".html") &&
      onDemand.some((route) => route.patternRegex.test(servedPath(file))),
  );
}

export function routeCache(enabled: boolean): AstroIntegration {
  let routes: IntegrationResolvedRoute[] = [];
  return {
    name: "route-cache",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        if (!enabled) return;
        injectRoute({
          pattern: `/${SEARCH_SOURCE}/[slug]`,
          entrypoint: "./src/search-source.astro",
          prerender: true,
        });
      },
      "astro:route:setup": ({ route }) => {
        if (enabled && ON_DEMAND_PAGES.includes(route.component)) {
          route.prerender = false;
        }
      },
      "astro:routes:resolved": (resolved) => {
        routes = resolved.routes;
      },
      "astro:build:generated": async ({ dir }) => {
        if (!enabled) return;
        const files = await readdir(fileURLToPath(dir), { recursive: true });
        const shadows = shadowing(files, routes);
        if (shadows.length > 0) {
          throw new Error(
            `Built pages would shadow on-demand routes: ${shadows.join(", ")}`,
          );
        }
      },
    },
  };
}
