// What a page needs to render either at build or on request. With
// ROUTE_CACHE unset every page is built and neither function changes it.

/** Seven days. A purge or a deploy ends it sooner; this is the backstop. */
export const CACHE_MAX_AGE = 60 * 60 * 24 * 7;

/** A missing entry fails a build, and is a 404 on request. */
export function missing(
  page: { isPrerendered: boolean },
  message: string,
): Response {
  if (page.isPrerendered) throw new Error(message);
  // No body, so the framework answers with the site's own 404 page.
  return new Response(null, { status: 404 });
}

/** Holds a page rendered on request in the route cache, under its tags. */
export function hold(
  // Astro.cache is absent where a page renders outside a request, as in the test container.
  cache:
    | {
        enabled: boolean;
        set(options: { maxAge: number; tags: string[] }): void;
      }
    | undefined,
  tags: string[],
): void {
  if (cache?.enabled) cache.set({ maxAge: CACHE_MAX_AGE, tags });
}
