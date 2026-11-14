import { describe, it, expect } from "vitest";
import { normaliseLocation, samplePaths, sitemapPaths } from "./url-parity.mjs";

describe("samplePaths", () => {
  it("leaves a literal path alone", () => {
    expect(samplePaths("/categories")).toEqual(["/categories"]);
  });

  it("fills a named segment, and a page number with a number", () => {
    expect(samplePaths("/tags/:slug/page/:n")).toEqual([
      "/tags/sample-slug/page/2",
    ]);
  });

  it("tries a zero-or-more segment both empty and filled", () => {
    expect(samplePaths("/tags/film/:path*")).toEqual([
      "/tags/film",
      "/tags/film/sample/path",
    ]);
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
