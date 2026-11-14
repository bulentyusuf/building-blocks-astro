import { SITE_HOSTNAME } from "./constants";

// Protocol-relative forms start with a slash but leave the site, so they fall
// through to URL parsing, which rejects them. Root-relative paths must be
// caught here first, because URL parsing without a base throws on them.
function isRootRelative(url: string): boolean {
  return url.startsWith("/") && url[1] !== "/" && url[1] !== "\\";
}

function isExternalUrl(url: URL): boolean {
  const hostname = url.hostname;
  return !(
    hostname === SITE_HOSTNAME || hostname.endsWith(`.${SITE_HOSTNAME}`)
  );
}

/**
 * Where a rich-text hyperlink may point, for every rich-text field. Null means
 * the text renders without a link. An external link opens a new window.
 */
export function resolveHyperlink(
  uri: unknown,
): { href: string; external: boolean } | null {
  if (typeof uri !== "string") return null;
  // Browsers strip tabs and newlines from a URL, so "/\t/x" lands on "//x".
  if (/[\t\n\r]/.test(uri)) return null;

  // A same-page fragment, which URL parsing without a base would also reject.
  if (uri.startsWith("#") || isRootRelative(uri)) {
    return { href: uri, external: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }

  // A mail client, not a window: no target or new-window hint.
  if (parsed.protocol === "mailto:") return { href: uri, external: false };

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  return { href: uri, external: isExternalUrl(parsed) };
}
