import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import * as pagefind from "pagefind";

// Builds the search index from the built pages and writes it beside them, at
// /pagefind/. Only regions marked data-pagefind-body are indexed: an English
// post's title and article. A build with nothing to index fails, so search
// never ships empty.
export function searchIndex(): AstroIntegration {
  return {
    name: "search-index",
    hooks: {
      "astro:build:generated": async ({ dir, logger }) => {
        const { index, errors } = await pagefind.createIndex();
        if (!index) throw new Error(errors.join("\n"));

        const site = fileURLToPath(dir);
        const added = await index.addDirectory({ path: site });
        if (added.errors.length > 0) throw new Error(added.errors.join("\n"));
        if (added.page_count === 0) {
          throw new Error("No page is marked for the search index.");
        }

        const written = await index.writeFiles({
          outputPath: fileURLToPath(new URL("pagefind/", dir)),
        });
        if (written.errors.length > 0) {
          throw new Error(written.errors.join("\n"));
        }
        await pagefind.close();
        logger.info("Wrote the search index.");
      },
    },
  };
}
