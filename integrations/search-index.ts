import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import * as pagefind from "pagefind";
import { SEARCH_SOURCE } from "./route-cache";

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

        // With the route cache on, posts render on request, so the build
        // leaves copies of them here for the index alone. Each is indexed at
        // its post's address, then the copies go: they are never deployed.
        const source = new URL(`${SEARCH_SOURCE}/`, dir);
        let pages = 0;
        if (existsSync(source)) {
          for (const file of await readdir(source)) {
            const added = await index.addHTMLFile({
              url: `/posts/${file.replace(/\.html$/, "")}`,
              content: await readFile(new URL(file, source), "utf8"),
            });
            if (added.errors.length > 0) {
              throw new Error(added.errors.join("\n"));
            }
            pages += 1;
          }
          await rm(source, { recursive: true });
        } else {
          const site = fileURLToPath(dir);
          const added = await index.addDirectory({ path: site });
          if (added.errors.length > 0) throw new Error(added.errors.join("\n"));
          pages = added.page_count;
        }
        if (pages === 0) {
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
