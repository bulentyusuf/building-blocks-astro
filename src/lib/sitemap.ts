import { postAuthors } from "./authors";
import { SITE_URL } from "./constants";
import { postTags, visibleTagSlugs } from "./tags";
import type { Author, Category, ListPost, PageMeta } from "./types";
import { escapeXml } from "./xml";

// German pages are listed, but their hreflang pairs live in each page's head,
// not here: one XHTML-namespaced element stops Firefox pretty-printing the
// file, and search engines treat the two declarations as equivalent.

interface Entry {
  url: string;
  lastModified: Date;
}

const safeIso = (d: Date): string =>
  Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();

// Only Page slugs with a real route, so a new Page cannot add a dead URL.
const ROUTED_PAGE_SLUGS = new Set(["about", "privacy"]);

const postDate = (post: ListPost): Date =>
  new Date(post.updatedDate ?? post.date);

// The freshest post under each key, for real lastmod values.
function newestBy(
  posts: ListPost[],
  keys: (post: ListPost) => (string | undefined)[],
): Map<string, Date> {
  const newest = new Map<string, Date>();
  for (const post of posts) {
    const date = postDate(post);
    for (const key of keys(post)) {
      if (!key) continue;
      const current = newest.get(key);
      if (!current || date > current) newest.set(key, date);
    }
  }
  return newest;
}

export function sitemapXml({
  posts,
  pages,
  categories,
  authors,
  germanSlugs,
  now = new Date(),
}: {
  posts: ListPost[];
  pages: PageMeta[];
  categories: Category[];
  authors: Pick<Author, "slug">[];
  germanSlugs: string[];
  now?: Date;
}): string {
  const german = new Set(germanSlugs);

  // Not posts[0], which is newest by `date`: an older post can carry a later
  // updatedDate. An invalid date compares false, so it never wins.
  const newestSitewide = posts.reduce(
    (newest, post) => (postDate(post) > newest ? postDate(post) : newest),
    posts.length ? new Date(0) : now,
  );
  const byCategory = newestBy(posts, (p) => [p.category?.slug]);
  const byTag = newestBy(posts, (p) => postTags(p).map((t) => t.slug));
  const byAuthor = newestBy(posts, (p) => postAuthors(p).map((a) => a.slug));

  const entries: Entry[] = [
    { url: SITE_URL, lastModified: newestSitewide },
    { url: `${SITE_URL}/archive`, lastModified: newestSitewide },
    ...pages
      .filter((page) => ROUTED_PAGE_SLUGS.has(page.slug))
      .map((page) => ({
        url: `${SITE_URL}/${page.slug}`,
        lastModified: new Date(
          page.sys.publishedAt ?? page.sys.firstPublishedAt ?? now,
        ),
      })),
    ...categories.map((category) => ({
      url: `${SITE_URL}/categories/${category.slug}`,
      lastModified: byCategory.get(category.slug) ?? newestSitewide,
    })),
    // Only tags with a page.
    ...[...visibleTagSlugs(posts)].map((slug) => ({
      url: `${SITE_URL}/tags/${slug}`,
      lastModified: byTag.get(slug) ?? newestSitewide,
    })),
    ...authors
      .filter((author) => author.slug)
      .map((author) => ({
        url: `${SITE_URL}/authors/${author.slug}`,
        lastModified: byAuthor.get(author.slug!) ?? newestSitewide,
      })),
    ...posts.map((post) => ({
      url: `${SITE_URL}/posts/${post.slug}`,
      lastModified: postDate(post),
    })),
    // Shares the English lastmod: dates are not localised.
    ...posts
      .filter((post) => german.has(post.slug))
      .map((post) => ({
        url: `${SITE_URL}/de/posts/${post.slug}`,
        lastModified: postDate(post),
      })),
  ];

  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${safeIso(entry.lastModified)}</lastmod>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
