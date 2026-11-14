import { defineMiddleware } from "astro:middleware";
import { createMemoStore, withMemo } from "./lib/memo";
import { onDemandHeaders } from "./lib/security-headers";

// A build renders every page from one snapshot of the published content, so
// its fetches are shared across pages. An on-demand request shares only with
// itself. Not in dev, where a reload must show the latest content.
const buildMemo = createMemoStore();

export const onRequest = defineMiddleware((context, next) => {
  const shared = context.isPrerendered && import.meta.env.PROD;
  return withMemo(shared ? buildMemo : createMemoStore(), async () => {
    const response = await next();
    if (context.isPrerendered) return response;
    // `_headers` does not apply to a response the Worker generates.
    for (const [name, value] of Object.entries(
      onDemandHeaders(context.url.pathname),
    )) {
      response.headers.set(name, value);
    }
    return response;
  });
});
