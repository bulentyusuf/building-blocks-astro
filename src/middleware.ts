import { defineMiddleware } from "astro:middleware";
import { onDemandHeaders } from "./lib/security-headers";

// Static files take their headers from `_headers`; that file does not apply to
// a response the Worker generates, so those are set here.
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.isPrerendered) return response;
  for (const [name, value] of Object.entries(
    onDemandHeaders(context.url.pathname),
  )) {
    response.headers.set(name, value);
  }
  return response;
});
