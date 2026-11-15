import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { getPage, getPost } from "../../lib/api";
import { GERMAN_LOCALE } from "../../lib/constants";
import {
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_OPTIONS,
  PREVIEW_PATH,
  issuePreviewSession,
} from "../../lib/preview-session";
import { safeCompare } from "../../lib/secret";

export const prerender = false;

// Where a Contentful preview link lands: it checks the secret, starts a
// preview session and sends the editor to the draft.
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const secret = url.searchParams.get("secret");
  const slug = url.searchParams.get("slug");
  // Absent means a post. Anything but `post` or `page` is refused.
  const type = url.searchParams.get("type") ?? "post";
  // Contentful fills {locale} from its preview switcher. Anything but German,
  // or no value at all, keeps the English page.
  const german = url.searchParams.get("locale") === GERMAN_LOCALE;

  const expected = getSecret("CONTENTFUL_PREVIEW_SECRET")?.trim();
  if (!expected || !safeCompare(secret, expected)) {
    return new Response("Invalid token", { status: 401 });
  }

  if (!slug) {
    return new Response("Missing slug", { status: 400 });
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return new Response("Invalid slug", { status: 400 });
  }

  if (type !== "post" && type !== "page") {
    return new Response("Unknown type", { status: 400 });
  }

  // Resolved as a draft before any session starts, so the redirect cannot land
  // on a 404 and a session only ever starts for an entry that exists. getPost,
  // and getPage, not the full fetch: nothing else here reads the entry.
  const entry =
    type === "page" ? await getPage(slug, true) : await getPost(slug, true);
  if (!entry) {
    return new Response("Unknown slug", { status: 404 });
  }

  const session = issuePreviewSession(expected);
  cookies.set(PREVIEW_COOKIE, session.value, {
    ...PREVIEW_COOKIE_OPTIONS,
    maxAge: session.maxAge,
  });
  return redirect(
    type === "page"
      ? `${PREVIEW_PATH}/pages/${slug}`
      : `${PREVIEW_PATH}${german ? "/de" : ""}/posts/${slug}`,
    307,
  );
};
