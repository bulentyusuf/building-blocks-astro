import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normaliseLocation,
  redirectSources,
  samplePaths,
  sitemapPaths,
} from "./url-parity.mjs";

describe("samplePaths", () => {
  it("leaves a literal path alone", () => {
    expect(samplePaths("/categories")).toEqual(["/categories"]);
  });

  it("fills a named segment, and a page number with a number", () => {
    expect(samplePaths("/tags/:slug/page/:n")).toEqual([
      "/tags/sample-slug/page/2",
    ]);
  });

  it("treats a trailing splat like a zero-or-more segment", () => {
    expect(samplePaths("/categories/main-quest/*")).toEqual([
      "/categories/main-quest",
      "/categories/main-quest/sample/path",
    ]);
  });

  it("tries a zero-or-more segment both empty and filled", () => {
    expect(samplePaths("/tags/film/:path*")).toEqual([
      "/tags/film",
      "/tags/film/sample/path",
    ]);
  });
});

describe("redirectSources", () => {
  it("takes each rule's source and skips comments and blank lines", () => {
    expect(
      redirectSources("# note\n\n/a /b 308\n  /c/:slug /d/:slug 308\n"),
    ).toEqual(["/a", "/c/:slug"]);
  });

  it("includes every source in this repo's own _redirects", () => {
    const file = readFileSync("public/_redirects", "utf8");
    const sources = redirectSources(file);
    expect(sources).toContain("/categories/main-quest");
    expect(sources).toContain("/tags/:slug/page/:n");
    // Known-bad control: a parser that kept comments would fail this.
    expect(sources.some((s: string) => s.startsWith("#"))).toBe(false);
    expect(sources.length).toBeGreaterThan(5);
  });
});

describe("normaliseLocation", () => {
  it("drops the deployment's own origin, so relative and absolute compare", () => {
    expect(normaliseLocation("/archive", "https://a.example")).toBe("/archive");
    expect(
      normaliseLocation("https://a.example/archive?x=1", "https://a.example"),
    ).toBe("/archive?x=1");
  });

  it("keeps another origin whole, and nothing as nothing", () => {
    expect(normaliseLocation("https://b.example/x", "https://a.example")).toBe(
      "https://b.example/x",
    );
    expect(normaliseLocation(null, "https://a.example")).toBeNull();
  });
});

describe("sitemapPaths", () => {
  const respond = (pages: Record<string, string>) =>
    (async (url: string) =>
      new Response(pages[url] ?? "", {
        status: url in pages ? 200 : 404,
      })) as typeof fetch;

  it("reads every location as a path", async () => {
    const fetcher = respond({
      "https://a.example/sitemap.xml":
        "<urlset><url><loc>https://a.example/</loc></url><url><loc> https://a.example/posts/x?a=1&amp;b=2 </loc></url></urlset>",
    });
    expect(await sitemapPaths("https://a.example", fetcher)).toEqual([
      "/",
      "/posts/x?a=1&b=2",
    ]);
  });

  it("follows a sitemap index", async () => {
    const fetcher = respond({
      "https://a.example/sitemap.xml":
        "<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>",
      "https://a.example/s1.xml":
        "<urlset><url><loc>https://a.example/about</loc></url></urlset>",
    });
    expect(await sitemapPaths("https://a.example", fetcher)).toEqual([
      "/about",
    ]);
  });

  it("fails loudly when there is no sitemap, rather than checking nothing", async () => {
    await expect(
      sitemapPaths("https://a.example", respond({})),
    ).rejects.toThrow(/404/);
  });
});
