import { writeFile } from "node:fs/promises";
import { defineConfig, envField } from "astro/config";
import type { AstroIntegration } from "astro";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";
import { indexingAllowed, staticHeadersFile } from "./src/lib/security-headers";

const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const allowIndexing = indexingAllowed(env.ALLOW_INDEXING);

// Static files take their headers from `_headers`, which the middleware
// cannot reach, so it is written from the same definitions at build.
const staticHeaders: AstroIntegration = {
  name: "static-headers",
  hooks: {
    "astro:build:generated": async ({ dir }) => {
      await writeFile(
        new URL("_headers", dir),
        staticHeadersFile({ allowIndexing }),
      );
    },
  },
};

export default defineConfig({
  site: env.SITE_URL?.trim() || "https://beuseful.net",
  trailingSlash: "never",
  build: { format: "file" },
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [staticHeaders],
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
    },
  },
  vite: {
    plugins: [tailwindcss()],
    define: {
      "import.meta.env.ALLOW_INDEXING": JSON.stringify(allowIndexing),
    },
  },
});
