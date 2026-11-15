import { postAuthors } from "./authors";
import {
  DEFAULT_LOCALE,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from "./constants";
import type { ListPost } from "./types";
import { escapeXml } from "./xml";

// The RSS feed, English posts only. Every author gets a <dc:creator>, and no
// item carries an <author>, which would have to publish an email address.
export function feedXml(posts: ListPost[]): string {
  const items = posts
    .map((post) => {
      const url = escapeXml(`${SITE_URL}/posts/${post.slug}`);
      const creators = postAuthors(post)
        .map((a) => `<dc:creator>${escapeXml(a.name)}</dc:creator>`)
        .join("\n      ");
      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt || "")}</description>
      ${creators ? `${creators}\n      ` : ""}
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="/feed.xsl" type="text/xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>${DEFAULT_LOCALE.toLowerCase()}</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}
