import { defineMiddleware } from "astro:middleware";
import { getSecret } from "astro:env/server";
import { createMemoStore, withMemo } from "./lib/memo";
import {
  PREVIEW_COOKIE,
  PREVIEW_PATH,
  isPreviewSession,
} from "./lib/preview-session";

// A build renders every page from one snapshot of the published content, so
// its fetches are shared across pages. An on-demand request shares only with
// itself. Not in dev, where a reload must show the latest content.
const buildMemo = createMemoStore();

export const onRequest = defineMiddleware((context, next) => {
  const shared = context.isPrerendered && import.meta.env.PROD;
  return withMemo(shared ? buildMemo : createMemoStore(), async () => {
    if (context.isPrerendered) return next();

    // The one gate for every draft page, so a new one cannot forget it.
    const draft = context.url.pathname.startsWith(`${PREVIEW_PATH}/`);
    const allowed =
      !draft ||
      isPreviewSession(
        context.cookies.get(PREVIEW_COOKIE)?.value,
        getSecret("CONTENTFUL_PREVIEW_SECRET")?.trim(),
      );
    // The response headers are set in src/worker.ts, around every response.
    return allowed
      ? next()
      : new Response(
          "No preview session. Open the preview from Contentful again.",
          { status: 401 },
        );
  });
});
