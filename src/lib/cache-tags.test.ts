import { describe, it, expect } from "vitest";
import {
  POSTS_TAG,
  indexPageTags,
  listingPageTags,
  listingTag,
  postPageTags,
} from "./cache-tags";
import { purgeTags } from "./purge";
import type { Author, ListPost, Post } from "./types";

// The tags a cached page carries, checked against the tags a change purges:
// a page is purged when the two share one.

const id = (value: string) => ({ sys: { id: value } });
const link = (value: string) => ({ sys: { type: "Link", id: value } });

const lead: Author = { ...id("author1"), name: "A", slug: "a", picture: null };
const guest: Author = {
  ...id("author2"),
  name: "B",
  slug: "b",
  picture: { ...id("portrait2"), url: "https://images.ctfassets.net/b.jpg" },
};
const footer = [lead, guest];

function listPost(n: number, strand = "strand1", tag = "tag1"): ListPost {
  return {
    ...id(`post${n}`),
    slug: `post-${n}`,
    title: `Post ${n}`,
    date: "2026-01-01",
    excerpt: "",
    coverImage: { ...id(`cover${n}`), url: "https://images.ctfassets.net/c" },
    category: { ...id(strand), name: strand, slug: strand },
    tagsCollection: { items: [{ ...id(tag), name: tag, slug: tag }, null] },
    authorsCollection: { items: [lead] },
  };
}

const post: Post = {
  ...listPost(1),
  authorsCollection: { items: [lead] },
  content: {
    json: {
      nodeType: "document",
      data: {},
      content: [],
    } as Post["content"]["json"],
    links: {
      assets: {
        block: [{ ...id("figure1"), url: "", description: "" }, null],
      },
      entries: {
        block: [
          { __typename: "CodeBlock", ...id("code1"), code: "" },
          {
            __typename: "PromptBlock",
            ...id("prompt1"),
            prompt: "",
            image: { ...id("promptimage1"), url: "" },
          },
          null,
        ],
      },
    },
  },
};

const published = (entry: string, links: Record<string, unknown> = {}) => ({
  sys: { type: "Entry", id: entry },
  fields: Object.fromEntries(
    Object.entries(links).map(([name, value]) => [name, { "en-GB": value }]),
  ),
});
const removed = (entry: string) => ({
  sys: { type: "DeletedEntry", id: entry },
});
const asset = (entry: string) => ({ sys: { type: "Asset", id: entry } });

const purged = (tags: string[], change: unknown) =>
  (purgeTags(change) ?? []).some((tag) => tags.includes(tag));

describe("a post page", () => {
  const tags = postPageTags(post, [listPost(2)], footer);

  it("is purged by its own post, published, unpublished or deleted", () => {
    expect(purged(tags, published("post1"))).toBe(true);
    expect(purged(tags, removed("post1"))).toBe(true);
  });

  it("is purged by everything it shows", () => {
    for (const shown of [
      "strand1",
      "tag1",
      "author1",
      "code1",
      "prompt1",
      // The footer's authors, and a related card's post.
      "author2",
      "post2",
    ]) {
      expect(purged(tags, published(shown)), shown).toBe(true);
    }
    for (const image of ["cover1", "figure1", "promptimage1", "portrait2"]) {
      expect(purged(tags, asset(image)), image).toBe(true);
    }
  });

  it("is left alone by a post it does not show", () => {
    // Known-bad control for the checks above: an unrelated post, even one in
    // the same strand with the same tag and author, does not reach it.
    const other = published("post9", {
      category: link("strand1"),
      tags: [link("tag1")],
      authors: [link("author1")],
    });
    expect(purged(tags, other)).toBe(false);
    expect(purged(tags, removed("post9"))).toBe(false);
    expect(tags).not.toContain(POSTS_TAG);
  });
});

describe("a page that lists every post", () => {
  const tags = listingPageTags([listPost(1), listPost(2)], footer);

  it("is purged by any entry, so a new post arrives on it", () => {
    expect(tags).toContain(POSTS_TAG);
    expect(purged(tags, published("post9"))).toBe(true);
    expect(purged(tags, removed("post9"))).toBe(true);
  });

  it("is purged by a cover it shows and by no other image", () => {
    expect(purged(tags, asset("cover2"))).toBe(true);
    expect(purged(tags, asset("cover9"))).toBe(false);
  });
});

describe("the archive and the tag index", () => {
  const tags = indexPageTags(footer);

  it("is purged by any entry and by a footer portrait", () => {
    expect(purged(tags, published("post9"))).toBe(true);
    expect(purged(tags, removed("post1"))).toBe(true);
    expect(purged(tags, asset("portrait2"))).toBe(true);
  });

  it("is left alone by a cover, which it never shows", () => {
    // Known-bad control: a page of cards holding the same posts is purged.
    const cards = listingPageTags([listPost(1), listPost(2)], footer);
    expect(purged(cards, asset("cover1"))).toBe(true);
    expect(purged(tags, asset("cover1"))).toBe(false);
  });
});

describe("a strand, tag or author page", () => {
  const strand = { ...id("strand1"), name: "Films", slug: "films" };
  const tags = listingPageTags([listPost(1), listPost(2)], footer, strand);

  it("is purged by a new post that links to it", () => {
    const joining = published("post9", { category: link("strand1") });
    expect(purged(tags, joining)).toBe(true);
  });

  it("is purged by a post it shows, however that post changed", () => {
    // Moved to another strand, unpublished or deleted: its id reaches the page.
    expect(
      purged(tags, published("post1", { category: link("strand2") })),
    ).toBe(true);
    expect(purged(tags, removed("post2"))).toBe(true);
  });

  it("is purged by its own entry", () => {
    expect(purged(tags, published("strand1"))).toBe(true);
  });

  it("is left alone by a post elsewhere", () => {
    // Known-bad control: another strand's post does not reach this page.
    const elsewhere = published("post9", { category: link("strand2") });
    expect(purged(tags, elsewhere)).toBe(false);
    expect(purged(tags, removed("post9"))).toBe(false);
    expect(tags).not.toContain(POSTS_TAG);
  });

  it("carries an author page's portrait", () => {
    const authorPage = listingPageTags([], footer, guest);
    expect(authorPage).toContain(listingTag("author2"));
    expect(purged(authorPage, asset("portrait2"))).toBe(true);
  });
});

describe("the tag list", () => {
  it("names each thing once", () => {
    const tags = listingPageTags([listPost(1), listPost(2)], footer);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("holds only what a Cache-Tag header can carry", () => {
    const tags = postPageTags(post, [listPost(2)], footer);
    for (const tag of tags) expect(tag).toMatch(/^[\x21-\x7E]+$/);
    expect(tags.some((tag) => tag.includes(","))).toBe(false);
  });

  it("skips what Contentful returned without an id", () => {
    const bare = { ...listPost(1), sys: undefined, coverImage: null };
    expect(listingPageTags([bare], [])).toEqual([
      POSTS_TAG,
      "strand1",
      "tag1",
      "author1",
    ]);
  });

  it("falls back to the every-post tag before it outgrows the header", () => {
    const many = Array.from({ length: 2000 }, (_, i) => listPost(i));
    const strand = { ...id("strand1"), name: "Films", slug: "films" };
    const tags = listingPageTags(many, footer, strand);
    expect(tags.join(",").length).toBeLessThan(16_000);
    // Still purged by every entry, and still by a post joining the strand.
    expect(tags).toContain(POSTS_TAG);
    expect(tags).toContain(listingTag("strand1"));
    expect(purged(tags, removed("post1999"))).toBe(true);
  });
});
