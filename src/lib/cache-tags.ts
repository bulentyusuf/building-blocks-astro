import { postAuthors } from "./authors";
import { postTags } from "./tags";
import type { Author, Identified, ListPost, Post } from "./types";

// How a page held in the route cache says what it shows, so a change in
// Contentful purges the pages it reaches and no others. Three kinds of tag:
//   <id>     the page shows this entry or asset.
//   in.<id>  the page lists the posts linking to this strand, tag or author.
//   posts    the page lists posts whatever they link to.
// src/lib/purge.ts turns a change into the tags to purge.

/** On home, the archive and the tag index, and purged by every entry. */
export const POSTS_TAG = "posts";

export const listingTag = (id: string) => `in.${id}`;

// A Cache-Tag header holds 16 KB, and the cache adds a path tag of its own.
const TAG_BUDGET_BYTES = 12_000;

type Linked = Identified | null | undefined;

const ids = (items: Linked[]): string[] =>
  items.flatMap((item) => (item?.sys?.id ? [item.sys.id] : []));

/** An author wherever one shows: the footer, a byline, a bio. */
function authorTags(author: Author | Omit<Author, "bio">): string[] {
  const bio = "bio" in author ? author.bio : undefined;
  return ids([author, author.picture, ...(bio?.links.assets.block ?? [])]);
}

/** Everything a card or a row shows of a post. */
function cardTags(post: ListPost | Post): string[] {
  return [
    ...ids([post, post.coverImage, post.category, ...postTags(post)]),
    ...postAuthors(post).flatMap(authorTags),
  ];
}

// Past the budget a page keeps its own tags and swaps its cards' for the one
// tag every entry purges: less precise, never stale.
function within(own: string[], cards: string[]): string[] {
  const all = [...new Set([...own, ...cards])];
  const bytes = all.reduce((sum, tag) => sum + tag.length + 1, 0);
  return bytes <= TAG_BUDGET_BYTES ? all : [...new Set([...own, POSTS_TAG])];
}

/** A post page: the post, what its body embeds, the footer, the related cards. */
export function postPageTags(
  post: Post,
  morePosts: ListPost[],
  footer: Author[],
): string[] {
  const entries = post.content.links.entries?.block ?? [];
  return within(
    [
      ...cardTags(post),
      ...ids(post.content.links.assets.block),
      ...ids(entries),
      ...ids(entries.map((e) => (e && "image" in e ? e.image : null))),
      ...footer.flatMap(authorTags),
    ],
    morePosts.flatMap(cardTags),
  );
}

/** The archive: every post as text, no cover or portrait,
 *  so the every-post tag and the footer cover all they show. */
export function indexPageTags(footer: Author[]): string[] {
  return [...new Set([POSTS_TAG, ...footer.flatMap(authorTags)])];
}

/**
 * A page of posts. `of` is the strand, tag or author whose posts it lists,
 * absent on a page that lists them whatever they link to.
 */
export function listingPageTags(
  posts: ListPost[],
  footer: Author[],
  of?: Identified | Author,
): string[] {
  const id = of?.sys?.id;
  return within(
    [
      ...(id ? [listingTag(id)] : [POSTS_TAG]),
      ...(of && "picture" in of ? authorTags(of) : ids([of])),
      ...footer.flatMap(authorTags),
    ],
    posts.flatMap(cardTags),
  );
}
