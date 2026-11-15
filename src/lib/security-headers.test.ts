import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  ANALYTICS_CONNECT_ORIGIN,
  ANALYTICS_SCRIPT_ORIGIN,
  CMS_ORIGIN,
  SECURITY_HEADERS,
  contentSecurityPolicy,
  contentSecurityPolicyFor,
  indexingAllowed,
  cachedPageHeaders,
  onDemandHeaders,
  staticHeadersFile,
} from "./security-headers";

const CSP = "Content-Security-Policy";

// Exact source tokens, never a substring of the header: a lookalike origin
// would satisfy `includes`.
function frameAncestors(csp: string): string[] {
  const directive = csp
    .split("; ")
    .find((d) => d.startsWith("frame-ancestors "));
  return directive ? directive.split(/\s+/).slice(1) : [];
}

// Resolves a path the way the static host does: every matching rule applies in
// order, `! Name` detaches, and a repeated name is joined, which for a policy
// means both are enforced.
function resolveStatic(file: string, pathname: string): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const rule of file.trim().split("\n\n")) {
    const [pattern, ...lines] = rule.split("\n");
    const hit = pattern.endsWith("/*")
      ? pathname.startsWith(pattern.slice(0, -1))
      : pathname === pattern;
    if (!hit) continue;
    for (const line of lines.map((l) => l.trim())) {
      if (line.startsWith("! ")) {
        resolved.delete(line.slice(2));
        continue;
      }
      const at = line.indexOf(": ");
      const [name, value] = [line.slice(0, at), line.slice(at + 2)];
      const earlier = resolved.get(name);
      resolved.set(name, earlier ? `${earlier}, ${value}` : value);
    }
  }
  return resolved;
}

describe("the content security policy", () => {
  it("allows WebAssembly on search and its index only", () => {
    for (const path of ["/search", "/search/x", "/pagefind/worker.js"]) {
      expect(contentSecurityPolicyFor(path), path).toContain(
        "'wasm-unsafe-eval'",
      );
    }
    for (const path of ["/", "/posts/a", "/preview/posts/a", "/searching"]) {
      expect(contentSecurityPolicyFor(path), path).not.toContain("wasm");
    }
  });

  it("lets Contentful frame preview pages and nothing else", () => {
    for (const path of ["/preview/posts/a", "/preview/de/posts/a"]) {
      expect(frameAncestors(contentSecurityPolicyFor(path)), path).toEqual([
        "'self'",
        CMS_ORIGIN,
      ]);
    }
    for (const path of ["/", "/posts/a", "/de/posts/a", "/api/draft"]) {
      expect(frameAncestors(contentSecurityPolicyFor(path)), path).toEqual([
        "'self'",
      ]);
    }
  });

  it("relaxes by exactly one token each time", () => {
    const base = contentSecurityPolicy();
    expect(
      contentSecurityPolicy({ wasm: true }).replace(" 'wasm-unsafe-eval'", ""),
    ).toBe(base);
    expect(
      contentSecurityPolicy({ cmsFraming: true }).replace(` ${CMS_ORIGIN}`, ""),
    ).toBe(base);
  });

  it("names no third-party script or connection source", () => {
    const policy = contentSecurityPolicy({ wasm: true, cmsFraming: true });
    const hosts = policy.match(/https?:\/\/[^\s;]+/g);
    expect(hosts).toEqual(["https://images.ctfassets.net", CMS_ORIGIN]);
  });
});

describe("on-demand responses", () => {
  it("are never indexable or stored, whatever the path", () => {
    for (const path of ["/api/draft", "/preview/posts/a", "/anything"]) {
      const headers = onDemandHeaders(path);
      expect(headers["X-Robots-Tag"], path).toBe("noindex");
      expect(headers["Cache-Control"], path).toBe("private, no-store");
      expect(headers["Cross-Origin-Opener-Policy"], path).toBe("same-origin");
    }
  });
});

describe("a page held in the route cache", () => {
  const pages = ["/", "/posts/a", "/de/posts/a", "/tags/x", "/archive"];

  it("carries exactly what the static file it replaces carried", () => {
    for (const allowIndexing of [false, true]) {
      const file = staticHeadersFile({ allowIndexing });
      for (const path of pages) {
        const { "Cache-Control": _, ...headers } = cachedPageHeaders(
          path,
          allowIndexing,
        );
        expect(headers, `${path} ${allowIndexing}`).toEqual(
          Object.fromEntries(resolveStatic(file, path)),
        );
      }
    }
  });

  it("is closed to search engines unless the build is open", () => {
    for (const path of pages) {
      expect(cachedPageHeaders(path, false)["X-Robots-Tag"], path).toBe(
        "noindex",
      );
      expect("X-Robots-Tag" in cachedPageHeaders(path, true), path).toBe(false);
    }
  });

  it("has a browser ask again on every visit, as a static page does", () => {
    expect(cachedPageHeaders("/", true)["Cache-Control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
  });
});

describe("the static headers file", () => {
  const closed = staticHeadersFile({ allowIndexing: false });
  const open = staticHeadersFile({ allowIndexing: true });

  it("blocks indexing on every path unless explicitly opened", () => {
    for (const path of ["/", "/posts/a", "/search", "/pagefind/x.js"]) {
      expect(resolveStatic(closed, path).get("X-Robots-Tag"), path).toBe(
        "noindex",
      );
      expect(resolveStatic(open, path).has("X-Robots-Tag"), path).toBe(false);
    }
  });

  it("sends every security header on every path, relaxed ones included", () => {
    for (const path of ["/", "/posts/a", "/search", "/pagefind/x.js"]) {
      const resolved = resolveStatic(open, path);
      for (const name of Object.keys(SECURITY_HEADERS)) {
        expect(resolved.has(name), `${name} on ${path}`).toBe(true);
      }
    }
  });

  it("leaves each path with exactly the policy the route table gives it", () => {
    for (const path of ["/", "/posts/a", "/search", "/pagefind/x.js"]) {
      expect(resolveStatic(open, path).get(CSP), path).toBe(
        contentSecurityPolicyFor(path, true),
      );
    }
  });

  it("serves a post's social card as a PNG, whatever its file name", () => {
    const pattern = "/posts/:slug/opengraph-image";
    expect(open).toContain(`${pattern}\n  Content-Type: image/png`);
  });

  it("would intersect two policies if a relaxed rule did not detach", () => {
    // Known-bad control: without the detach line the base policy survives
    // beside the relaxed one, and the resolver must show it.
    const broken = open.replaceAll(`  ! ${CSP}\n`, "");
    expect(resolveStatic(broken, "/search").get(CSP)).toContain(", ");
  });
});

describe("analytics", () => {
  const hosts = (csp: string, directive: string) =>
    (csp.split("; ").find((d) => d.startsWith(`${directive} `)) ?? "")
      .split(/\s+/)
      .filter((t) => t.startsWith("https://"));
  const closed = staticHeadersFile({ allowIndexing: false });
  const open = staticHeadersFile({ allowIndexing: true });
  const pages = ["/", "/posts/a", "/search", "/pagefind/x.js"];

  it("are allowed by the policy only when indexing is open, and only two hosts", () => {
    for (const path of pages) {
      const on = resolveStatic(open, path).get(CSP) ?? "";
      expect(hosts(on, "script-src"), path).toEqual([ANALYTICS_SCRIPT_ORIGIN]);
      expect(hosts(on, "connect-src"), path).toEqual([
        ANALYTICS_CONNECT_ORIGIN,
      ]);
      const off = resolveStatic(closed, path).get(CSP) ?? "";
      expect(off, path).not.toContain("cloudflareinsights");
      expect(off, path).toBe(contentSecurityPolicyFor(path));
    }
  });

  it("never reach a draft page or an endpoint", () => {
    for (const path of ["/preview/posts/a", "/api/draft"]) {
      expect(onDemandHeaders(path)[CSP], path).not.toContain(
        "cloudflareinsights",
      );
    }
  });

  it("would be caught if the open policy dropped them", () => {
    // Known-bad control: the open file without the hosts must fail the check.
    const stripped = open.replaceAll(` ${ANALYTICS_SCRIPT_ORIGIN}`, "");
    expect(
      hosts(resolveStatic(stripped, "/").get(CSP) ?? "", "script-src"),
    ).not.toEqual([ANALYTICS_SCRIPT_ORIGIN]);
  });

  it("render in the layout only on an open build and never on a draft", () => {
    const layout = readFileSync("src/layouts/Layout.astro", "utf8");
    const beacons = layout.match(/beacon\.min\.js/g) ?? [];
    expect(beacons).toHaveLength(1);
    expect(layout).toMatch(
      /import\.meta\.env\.ALLOW_INDEXING && !preview && \(\s*<script[^>]*beacon\.min\.js/,
    );
    expect(layout).toContain("ANALYTICS_TOKEN");
    expect(layout).not.toMatch(/deb38ac3/);
  });
});

describe("the indexing flag", () => {
  it("opens only on the exact word", () => {
    expect(indexingAllowed("true")).toBe(true);
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(indexingAllowed(value), String(value)).toBe(false);
    }
  });
});
