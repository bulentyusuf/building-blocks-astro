import { writeFile } from "node:fs/promises";
import { defineConfig, envField, fontProviders } from "astro/config";
import type { AstroIntegration } from "astro";
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { ogCards } from "./integrations/og-cards";
import { routeCache, routeCacheOn } from "./integrations/route-cache";
import { searchIndex } from "./integrations/search-index";
import {
  analyticsToken,
  indexingAllowed,
  siteUrl,
  staticHeadersFile,
} from "./src/lib/security-headers";

const variable = "./node_modules/@fontsource-variable";
const plexMono =
  "./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin";

const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const allowIndexing = indexingAllowed(env.ALLOW_INDEXING);
const analytics = analyticsToken(env.ANALYTICS_TOKEN, allowIndexing);
const routeCacheEnabled = routeCacheOn(env.ROUTE_CACHE);

// Static files take their headers from `_headers`, which the middleware
// cannot reach, so it is written from the same definitions at build.
const staticHeaders: AstroIntegration = {
  name: "static-headers",
  hooks: {
    "astro:build:generated": async ({ dir }) => {
      await writeFile(
        new URL("_headers", dir),
        staticHeadersFile({ allowIndexing, analytics: analytics !== "" }),
      );
    },
  },
};

export default defineConfig({
  site: siteUrl(env.SITE_URL, allowIndexing),
  trailingSlash: "never",
  build: { format: "file" },
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  // Naming the provider also turns on Cloudflare's cache in front of the
  // Worker, so it is named only when the switch is on.
  ...(routeCacheEnabled && { cache: { provider: cacheCloudflare() } }),
  integrations: [
    routeCache(routeCacheEnabled),
    staticHeaders,
    ogCards(),
    searchIndex(),
  ],
  // Self-hosted, so a build needs no font service. Latin only. Each variable
  // face carries its weight range and the optical-size axis in one file per style.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Bricolage Grotesque",
      cssVariable: "--font-bricolage",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: [
              `${variable}/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2`,
            ],
            weight: "200 800",
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      // Trimmed from the package to weights 400 to 700 and optical sizes 12 to
      // 36, the range body text uses. Replacing it with the full file adds 100 KiB.
      name: "Literata",
      cssVariable: "--font-literata",
      fallbacks: ["serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/literata-latin-opsz-normal.woff2"],
            weight: "400 700",
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/literata-latin-opsz-italic.woff2"],
            weight: "400 700",
            style: "italic",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "IBM Plex Mono",
      cssVariable: "--font-plex-mono",
      // A proportional fallback cannot be size-matched to a monospace face.
      fallbacks: ["monospace"],
      optimizedFallbacks: false,
      options: {
        variants: [
          {
            src: [`${plexMono}-400-normal.woff2`],
            weight: 400,
            style: "normal",
          },
          {
            src: [`${plexMono}-500-normal.woff2`],
            weight: 500,
            style: "normal",
          },
        ],
      },
    },
  ],
  env: {
    schema: {
      CONTENTFUL_SPACE_ID: envField.string({
        context: "server",
        access: "secret",
      }),
      CONTENTFUL_ACCESS_TOKEN: envField.string({
        context: "server",
        access: "secret",
      }),
      // Preview only: a build needs neither.
      CONTENTFUL_PREVIEW_ACCESS_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      CONTENTFUL_PREVIEW_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // The purge endpoint only: a build does not need it.
      CONTENTFUL_WEBHOOK_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // Bare names, not `import.meta.env.*`: Astro swaps any of those for a raw
    // environment variable of the same name before Vite's define runs.
    define: {
      __ALLOW_INDEXING__: JSON.stringify(allowIndexing),
      __ANALYTICS_TOKEN__: JSON.stringify(analytics),
      __ROUTE_CACHE__: JSON.stringify(routeCacheEnabled),
    },
  },
});
