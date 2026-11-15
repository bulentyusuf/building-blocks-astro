#!/usr/bin/env node
// Checks that the live site and a local build answer the same paths the same
// way. Run it after a change that could move a URL, or before a switchover.
//
//   node scripts/url-parity.mjs <reference> <candidate>
//
// Paths come from the reference's /sitemap.xml, plus every source in this
// repo's public/_redirects. Each path is requested from both origins without
// following redirects. Any difference in status or redirect target is
// printed, and the exit code is 1.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REDIRECTS_FILE = new URL("../public/_redirects", import.meta.url);

const CONCURRENCY = 8;

/** Every <loc> in a sitemap, following a sitemap index one level down. */
export async function sitemapPaths(origin, fetcher = fetch) {
  const locs = async (url) => {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const xml = await response.text();
    return {
      index: /<sitemapindex[\s>]/.test(xml),
      urls: [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
        m[1].replaceAll("&amp;", "&"),
      ),
    };
  };
  const top = await locs(`${origin}/sitemap.xml`);
  const urls = top.index
    ? (await Promise.all(top.urls.map(locs))).flatMap((s) => s.urls)
    : top.urls;
  return urls.map((url) => {
    const { pathname, search } = new URL(url);
    return pathname + search;
  });
}

/** The source of every rule in a `_redirects` file, comments skipped. */
export function redirectSources(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/)[0]);
}

/**
 * Concrete paths for a redirect pattern. `:name` becomes a sample segment, and
 * `:name*` and a trailing `/*`, which match zero or more segments, become both
 * none and two.
 */
export function samplePaths(source) {
  const named = source.replace(/:(\w+)(?![\w*])/g, (_, name) =>
    name === "n" ? "2" : `sample-${name}`,
  );
  const splat = /\/(:\w+)?\*$/;
  if (!splat.test(named)) return [named];
  return [
    named.replace(splat, "") || "/",
    named.replace(splat, "/sample/path"),
  ];
}

/** A redirect target without its own origin, so the two sides compare. */
export function normaliseLocation(location, origin) {
  if (!location) return null;
  const url = new URL(location, origin);
  return url.origin === new URL(origin).origin
    ? url.pathname + url.search + url.hash
    : url.href;
}

async function probe(origin, pathname) {
  try {
    const response = await fetch(origin + pathname, { redirect: "manual" });
    await response.arrayBuffer();
    return {
      status: response.status,
      location: normaliseLocation(response.headers.get("location"), origin),
    };
  } catch (cause) {
    return {
      status: `error: ${cause.cause?.code ?? cause.message}`,
      location: null,
    };
  }
}

const describe = ({ status, location }) =>
  location ? `${status} -> ${location}` : `${status}`;

async function main() {
  const [reference, candidate] = process.argv
    .slice(2)
    .map((arg) => arg.replace(/\/+$/, ""));
  if (!reference || !candidate) {
    console.error("Usage: node scripts/url-parity.mjs <reference> <candidate>");
    process.exit(2);
  }

  const paths = new Set(await sitemapPaths(reference));
  const fromSitemap = paths.size;
  for (const source of redirectSources(readFileSync(REDIRECTS_FILE, "utf8"))) {
    for (const sample of samplePaths(source)) paths.add(sample);
  }
  console.log(
    `${paths.size} paths: ${fromSitemap} from the sitemap, ${paths.size - fromSitemap} redirect sources.`,
  );

  const queue = [...paths].sort();
  const differences = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [a, b] = await Promise.all([
          probe(reference, next),
          probe(candidate, next),
        ]);
        if (a.status !== b.status || a.location !== b.location) {
          differences.push({ path: next, reference: a, candidate: b });
        }
      }
    }),
  );

  differences.sort((x, y) => x.path.localeCompare(y.path));
  for (const d of differences) {
    console.log(
      `${d.path}\n  reference: ${describe(d.reference)}\n  candidate: ${describe(d.candidate)}`,
    );
  }
  console.log(
    `\n${paths.size - differences.length} of ${paths.size} paths match. ${differences.length} differ.`,
  );
  process.exit(differences.length > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
