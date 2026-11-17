// The one definition of the site's response headers. Static files get them
// from the generated `_headers` file, Worker responses from src/worker.ts.

export const CMS_ORIGIN = "https://app.contentful.com";

// The analytics beacon's script and its report endpoint. Allowed only on a
// build with an analytics token, which `analyticsToken` ties to indexing.
export const ANALYTICS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
export const ANALYTICS_CONNECT_ORIGIN = "https://cloudflareinsights.com";

// 'unsafe-inline' stays sitewide. Each relaxation is passed in per route,
// never set on the base.
export function contentSecurityPolicy({
  wasm = false,
  cmsFraming = false,
  analytics = false,
} = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${wasm ? " 'wasm-unsafe-eval'" : ""}${analytics ? ` ${ANALYTICS_SCRIPT_ORIGIN}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://images.ctfassets.net data:",
    "font-src 'self'",
    `connect-src 'self'${analytics ? ` ${ANALYTICS_CONNECT_ORIGIN}` : ""}`,
    `frame-ancestors 'self'${cmsFraming ? ` ${CMS_ORIGIN}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const CSP = "Content-Security-Policy";

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Severs window.opener both ways; nothing here talks to a window it opens.
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  [CSP]: contentSecurityPolicy(),
};

// Search compiles WebAssembly, in the page and in a worker script that takes
// its policy from its own response.
const WASM_PATHS = ["/search", "/search/*", "/pagefind/*"];

// The only documents Contentful frames: a preview link redirects to one.
const CMS_FRAMED_PATHS = ["/preview/*"];

function matches(pattern: string, pathname: string): boolean {
  return pattern.endsWith("/*")
    ? pathname.startsWith(pattern.slice(0, -1))
    : pathname === pattern;
}

export function contentSecurityPolicyFor(
  pathname: string,
  analytics = false,
): string {
  return contentSecurityPolicy({
    analytics,
    wasm: WASM_PATHS.some((p) => matches(p, pathname)),
    cmsFraming: CMS_FRAMED_PATHS.some((p) => matches(p, pathname)),
  });
}

/** Every header an on-demand response carries. Never indexable, never stored. */
export function onDemandHeaders(pathname: string): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    [CSP]: contentSecurityPolicyFor(pathname),
    "X-Robots-Tag": "noindex",
    "Cache-Control": "private, no-store",
  };
}

/**
 * What a public page held in the route cache carries: a static file's
 * headers, since it stands where one stood. Indexable only on an open build.
 */
export function cachedPageHeaders(
  pathname: string,
  { allowIndexing, analytics }: { allowIndexing: boolean; analytics: boolean },
): Record<string, string> {
  return {
    ...SECURITY_HEADERS,
    [CSP]: contentSecurityPolicyFor(pathname, analytics),
    ...(allowIndexing ? {} : { "X-Robots-Tag": "noindex" }),
    // The static host's own answers for a page: a browser asks again each
    // visit, and the type names the charset.
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Content-Type": "text/html; charset=utf-8",
  };
}

function block(pattern: string, headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
  return [pattern, ...lines].join("\n");
}

/**
 * The `_headers` file for the static files. Matching rules add up there, and
 * two policies on one response intersect, so a relaxed path detaches the base
 * policy before setting its own.
 */
export function staticHeadersFile({
  allowIndexing,
  analytics,
}: {
  allowIndexing: boolean;
  analytics: boolean;
}): string {
  const base = {
    ...SECURITY_HEADERS,
    [CSP]: contentSecurityPolicy({ analytics }),
    ...(allowIndexing ? {} : { "X-Robots-Tag": "noindex" }),
  };
  const relaxed = WASM_PATHS.map((pattern) =>
    [
      pattern,
      `  ! ${CSP}`,
      `  ${CSP}: ${contentSecurityPolicy({ wasm: true, analytics })}`,
    ].join("\n"),
  );
  // The cards have no file extension for the host to read a type from.
  const cards = block("/posts/:slug/opengraph-image", {
    "Content-Type": "image/jpeg",
  });
  return [block("/*", base), ...relaxed, cards].join("\n\n") + "\n";
}

/** Only the exact word opens the site to crawlers, so a typo fails closed. */
export function indexingAllowed(value: string | undefined): boolean {
  return value?.trim() === "true";
}

/** The analytics token a build uses: none unless indexing is open and one is set. */
export function analyticsToken(
  value: string | undefined,
  allowIndexing: boolean,
): string {
  return allowIndexing ? (value?.trim() ?? "") : "";
}
