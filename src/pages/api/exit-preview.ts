import type { APIRoute } from "astro";
import {
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_OPTIONS,
} from "../../lib/preview-session";

export const prerender = false;

// Ends the preview session and returns to the published site.
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(PREVIEW_COOKIE, PREVIEW_COOKIE_OPTIONS);
  return redirect("/", 303);
};
