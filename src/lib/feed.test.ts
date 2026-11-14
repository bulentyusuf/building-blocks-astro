import { describe, it, expect } from "vitest";
import { feedXml } from "./feed";
import { sitemapXml } from "./sitemap";
import type { ListPost } from "./types";

const post = (slug: string, extra: Partial<ListPost> = {}): ListPost => ({
  slug,
  title: `Title of ${slug}`,
  date: "2026-01-02T10:00:00.000Z",
  excerpt: "An excerpt.",
  ...extra,
});
const authors = (...names: string[]) => ({
  items: names.map((name) => ({
    name,
    slug: name.toLowerCase(),
    picture: null,
  })),
});
const locs = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)</g)].map((m) => [
    m[1].replace("https://beuseful.net", "") || "/",
    m[2],
  ]);

describe("the feed", () => {
  it("credits every author and publishes no email address", () => {
    const xml = feedXml([
      post("a", { authorsCollection: authors("Ann", "Bo") }),
    ]);
    expect(xml.match(/<dc:creator>/g)).toHaveLength(2);
    expect(xml).toContain("<dc:creator>Ann</dc:creator>");
    expect(xml).not.toContain("<author>");
  });

  it("escapes what a title or excerpt may hold", () => {
    const xml = feedXml([
      post("a", { title: "Q&A <b>", excerpt: 'It\'s "x"' }),
    ]);
    expect(xml).toContain("<title>Q&amp;A &lt;b&gt;</title>");
    expect(xml).toContain("It&apos;s &quot;x&quot;");
  });

  it("links each item to its English post, as a permalink", () => {
    const xml = feedXml([post("a")]);
    expect(xml).toContain("<link>https://beuseful.net/posts/a</link>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://beuseful.net/posts/a</guid>',
    );
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain('<?xml-stylesheet href="/feed.xsl"');
  });
});

describe("the sitemap", () => {
  const tag = { name: "T", slug: "t" };
  const posts = [
    post("new", {
      category: { name: "Films", slug: "films" },
      tagsCollection: { items: [tag] },
      authorsCollection: authors("Ann"),
    }),
    post("old", {
      date: "2025-01-01T00:00:00.000Z",
      updatedDate: "2026-03-03T00:00:00.000Z",
      category: { name: "Blogging", slug: "blogging" },
      tagsCollection: { items: [tag, { name: "Lone", slug: "lone" }] },
      authorsCollection: authors("Bo"),
    }),
  ];
  const xml = sitemapXml({
    posts,
    pages: [
      {
        slug: "about",
        sys: {
          publishedAt: "2026-02-02T00:00:00.000Z",
          firstPublishedAt: null,
        },
      },
      { slug: "unrouted", sys: { publishedAt: null, firstPublishedAt: null } },
    ],
    categories: [
      { name: "Films", slug: "films" },
      { name: "Empty", slug: "empty" },
    ],
    authors: [{ slug: "ann" }, { slug: undefined }],
    germanSlugs: ["old"],
  });
  const map = Object.fromEntries(locs(xml));

  it("dates the site by its most recently updated post, not its newest", () => {
    expect(map["/"]).toBe("2026-03-03T00:00:00.000Z");
    expect(map["/archive"]).toBe(map["/"]);
  });

  it("dates each listing by its freshest post, or the site's when it has none", () => {
    expect(map["/categories/films"]).toBe("2026-01-02T10:00:00.000Z");
    expect(map["/categories/empty"]).toBe(map["/"]);
    expect(map["/authors/ann"]).toBe("2026-01-02T10:00:00.000Z");
    expect(map["/tags/t"]).toBe("2026-03-03T00:00:00.000Z");
  });

  it("lists only what has a page", () => {
    expect(map["/tags/lone"]).toBeUndefined();
    expect(map["/unrouted"]).toBeUndefined();
    expect(map["/about"]).toBe("2026-02-02T00:00:00.000Z");
    expect(Object.keys(map).filter((k) => k.startsWith("/authors/"))).toEqual([
      "/authors/ann",
    ]);
  });

  it("lists a German page only for a translated post, with the English date", () => {
    expect(map["/de/posts/old"]).toBe(map["/posts/old"]);
    expect(map["/de/posts/new"]).toBeUndefined();
  });

  it("survives an invalid date rather than failing the build", () => {
    const broken = sitemapXml({
      posts: [post("x", { date: "not a date" })],
      pages: [],
      categories: [],
      authors: [],
      germanSlugs: [],
    });
    expect(Object.fromEntries(locs(broken))["/posts/x"]).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
