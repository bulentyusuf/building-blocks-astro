// The one definition of the site's response headers. Static files get them
// from the generated `_headers` file, on-demand routes from the middleware.

export const CMS_ORIGIN = "https://app.contentful.com";

// 'unsafe-inline' stays sitewide. Each relaxation is passed in per route,
// never set on the base.
export function contentSecurityPolicy({
  wasm = false,
  cmsFraming = false,
} = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${wasm ? " 'wasm-unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://images.ctfassets.net data:",
    "font-src 'self'",
    "connect-src 'self'",
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

export function contentSecurityPolicyFor(pathname: string): string {
  return contentSecurityPolicy({
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
}: {
  allowIndexing: boolean;
}): string {
  const base = {
    ...SECURITY_HEADERS,
    ...(allowIndexing ? {} : { "X-Robots-Tag": "noindex" }),
  };
  const relaxed = WASM_PATHS.map((pattern) =>
    [
      pattern,
      `  ! ${CSP}`,
      `  ${CSP}: ${contentSecurityPolicy({ wasm: true })}`,
    ].join("\n"),
  );
  return [block("/*", base), ...relaxed].join("\n\n") + "\n";
}

/** Only the exact word opens the site to crawlers, so a typo fails closed. */
export function indexingAllowed(value: string | undefined): boolean {
  return value?.trim() === "true";
}
