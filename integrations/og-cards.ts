import { readFile, readdir, writeFile } from "node:fs/promises";
import type { AstroIntegration } from "astro";
import satori from "satori";
import sharp from "sharp";
import { CARD_SIZE, ogCard, type CardContent } from "../src/lib/og-card";

// Draws each post's social card. The page build leaves the card's content at
// posts/<slug>/opengraph-image; this replaces it with a JPEG, in Node,
// because the image renderer cannot run in the runtime that renders pages. A
// card that cannot be drawn fails the build, so its content is never published
// in the image's place.

// Bricolage Grotesque Bold as a static WOFF, never served publicly: the
// renderer takes neither WOFF2 nor a variable face. OFL 1.1. Latin only.
const FONT = new URL("../src/assets/bricolage-bold.woff", import.meta.url);

// A cover that cannot be fetched leaves the solid panel rather than failing
// the build over one image.
async function coverDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch (cause) {
    console.warn(`[og-cards] No cover for a card (${url}): ${String(cause)}`);
    return null;
  }
}

export function ogCards(): AstroIntegration {
  return {
    name: "og-cards",
    hooks: {
      "astro:build:generated": async ({ dir, logger }) => {
        const posts = new URL("posts/", dir);
        const font = await readFile(FONT);
        const entries = await readdir(posts, { withFileTypes: true });
        const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

        for (const slug of slugs) {
          const file = new URL(`${slug}/opengraph-image`, posts);
          const card = JSON.parse(await readFile(file, "utf8")) as CardContent;
          const svg = await satori(
            ogCard({
              title: card.title,
              siteTitle: card.siteTitle,
              author: card.author,
              cover: await coverDataUrl(card.coverUrl),
            }) as Parameters<typeof satori>[0],
            {
              ...CARD_SIZE,
              fonts: [
                {
                  name: "Bricolage Grotesque",
                  data: font,
                  weight: 700,
                  style: "normal",
                },
              ],
            },
          );
          // JPEG, because the cover panel is a photo: about a tenth of the PNG.
          await writeFile(
            file,
            await sharp(Buffer.from(svg))
              .jpeg({ quality: 82, mozjpeg: true })
              .toBuffer(),
          );
        }
        logger.info(`Drew ${slugs.length} social cards.`);
      },
    },
  };
}
