import type { APIRoute, GetStaticPaths } from "astro";
import { getAllPosts } from "../../../lib/api";
import { formatAuthorsByline, postAuthors } from "../../../lib/authors";
import { SITE_TITLE } from "../../../lib/constants";
import { cardContent } from "../../../lib/og-card";
import type { ListPost } from "../../../lib/types";

// One social card per published post, at the URL the page's og:image names.
// This writes what the card says. The build's last step, in
// integrations/og-cards.ts, draws it and replaces this file with the PNG,
// because the image renderer cannot run in the runtime that renders pages.
export const getStaticPaths = (async () => {
  const posts = await getAllPosts(false);
  return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ post: ListPost }> = ({ props: { post } }) =>
  Response.json(
    cardContent({
      title: post.title,
      siteTitle: SITE_TITLE,
      author: formatAuthorsByline(postAuthors(post)),
      coverUrl: post.coverImage?.url,
    }),
  );
