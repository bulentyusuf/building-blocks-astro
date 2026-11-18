#!/usr/bin/env node
// Checks every link in public/llms.txt. One on the site fails if it errors or
// moved to another path, as a renamed slug does. Any other link only warns.
//
//   SITE_URL=https://example.com node scripts/check-llms-links.mjs

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LLMS_FILE = new URL("../public/llms.txt", import.meta.url);

/** Every distinct absolute link target in a markdown file. */
export function llmsLinks(text) {
  return [
    ...new Set(
      [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]),
    ),
  ];
}

// Host and path, without a trailing slash, so /about and /about/ match.
const place = (url) => {
  const { hostname, pathname } = new URL(url);
  return `${hostname}${pathname.replace(/\/+$/, "") || "/"}`;
};

/** Whether a link still lands where it says, and whether a miss counts. */
export async function checkLink(url, siteOrigin, fetcher = fetch) {
  const counts = new URL(url).origin === siteOrigin;
  try {
    const response = await fetcher(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "llms-link-check" },
    });
    const moved = response.redirected && place(response.url) !== place(url);
    const ok = response.ok && !moved;
    const detail = moved
      ? `redirects to ${response.url}`
      : `status ${response.status}`;
    return { url, ok, counts, detail };
  } catch (error) {
    return { url, ok: false, counts, detail: error.name };
  }
}

async function main() {
  if (!process.env.SITE_URL) {
    console.error(
      "Set SITE_URL to the site's address, such as https://example.com.",
    );
    process.exit(1);
  }
  const siteOrigin = new URL(process.env.SITE_URL).origin;
  const urls = llmsLinks(readFileSync(LLMS_FILE, "utf8"));
  if (urls.length === 0) {
    console.error("No links found in public/llms.txt.");
    process.exit(1);
  }

  let failures = 0;
  for (const url of urls) {
    const result = await checkLink(url, siteOrigin);
    if (result.ok) {
      console.log(`ok    ${url}`);
    } else if (result.counts) {
      failures++;
      console.log(`FAIL  ${url}  ${result.detail}`);
    } else {
      console.log(`warn  ${url}  ${result.detail}`);
    }
  }
  console.log(`\n${urls.length} links checked, ${failures} failed.`);
  process.exit(failures > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
