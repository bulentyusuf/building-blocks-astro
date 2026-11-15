import type { APIRoute } from "astro";
import { getAllPosts } from "../lib/api";
import { feedXml } from "../lib/feed";

export const GET: APIRoute = async () =>
  new Response(feedXml(await getAllPosts(false)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
