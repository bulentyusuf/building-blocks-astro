import type { APIRoute } from "astro";
import {
  getAllAuthors,
  getAllCategories,
  getAllPages,
  getAllPosts,
  getGermanPostSlugs,
} from "../lib/api";
import { sitemapXml } from "../lib/sitemap";

export const GET: APIRoute = async () => {
  const [posts, pages, categories, authors, germanSlugs] = await Promise.all([
    getAllPosts(false),
    getAllPages(false),
    getAllCategories(false),
    getAllAuthors(false),
    getGermanPostSlugs(false),
  ]);
  return new Response(
    sitemapXml({ posts, pages, categories, authors, germanSlugs }),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
