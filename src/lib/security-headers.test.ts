import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ANALYTICS_CONNECT_ORIGIN,
  ANALYTICS_SCRIPT_ORIGIN,
  CMS_ORIGIN,
  SECURITY_HEADERS,
  analyticsToken,
  contentSecurityPolicy,
  contentSecurityPolicyFor,
  indexingAllowed,
  siteUrl,
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
      for (const analytics of [false, true]) {
        const flags = { allowIndexing, analytics };
        const file = staticHeadersFile(flags);
        for (const path of pages) {
          // These two the static host adds itself, outside the file.
          const {
            "Cache-Control": _cache,
            "Content-Type": _type,
            ...headers
          } = cachedPageHeaders(path, flags);
          expect(headers, `${path} ${allowIndexing} ${analytics}`).toEqual(
            Object.fromEntries(resolveStatic(file, path)),
          );
        }
      }
    }
  });

  it("has a browser ask again on every visit, as a static page does", () => {
    const headers = cachedPageHeaders("/", {
      allowIndexing: true,
      analytics: true,
    });
    expect(headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
    expect(headers["Content-Type"]).toBe("text/html; charset=utf-8");
  });
});

describe("the static headers file", () => {
  const closed = staticHeadersFile({ allowIndexing: false, analytics: false });
  const open = staticHeadersFile({ allowIndexing: true, analytics: true });

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

  it("serves a post's social card as a JPEG, whatever its file name", () => {
    const pattern = "/posts/:slug/opengraph-image";
    expect(open).toContain(`${pattern}\n  Content-Type: image/jpeg`);
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
  const closed = staticHeadersFile({ allowIndexing: false, analytics: false });
  const open = staticHeadersFile({ allowIndexing: true, analytics: true });
  const openBare = staticHeadersFile({ allowIndexing: true, analytics: false });
  const pages = ["/", "/posts/a", "/search", "/pagefind/x.js"];

  it("are allowed by the policy only with analytics on, and only two hosts", () => {
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

  it("stay out of an open build that has no token", () => {
    expect(openBare).not.toContain("cloudflareinsights");
    for (const path of pages) {
      const resolved = resolveStatic(openBare, path);
      expect(resolved.get(CSP), path).toBe(contentSecurityPolicyFor(path));
      expect(resolved.has("X-Robots-Tag"), path).toBe(false);
    }
  });

  it("never reach a draft page or an endpoint", () => {
    for (const path of [
      "/preview/posts/a",
      "/preview/pages/privacy",
      "/api/draft",
    ]) {
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

  it("stay off a page draft, which passes its draft flag to the layout", () => {
    const page = readFileSync("src/components/ContentPage.astro", "utf8");
    const route = readFileSync("src/pages/preview/pages/[slug].astro", "utf8");
    expect(page).toMatch(/<Layout[^>]*\bpreview=\{preview\}/);
    expect(page).toContain("getPage(slug, preview)");
    expect(route).toMatch(/<ContentPage[^>]*\bpreview\b/);
    expect(route).toContain("prerender = false");
  });

  it("render in the layout only with a build token and never on a draft", () => {
    const layout = readFileSync("src/layouts/Layout.astro", "utf8");
    const beacons = layout.match(/beacon\.min\.js/g) ?? [];
    expect(beacons).toHaveLength(1);
    expect(layout).toMatch(
      /__ANALYTICS_TOKEN__ && !preview && \(\s*<script[^>]*beacon\.min\.js/,
    );
    expect(layout).toMatch(/token: __ANALYTICS_TOKEN__\b/);
  });

  // A token in the code would ride along into every fork.
  const HEX_TOKEN = /\b[0-9a-f]{32}\b/i;

  it("carry no token in the code", () => {
    for (const file of ["src/layouts/Layout.astro", "src/lib/constants.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(HEX_TOKEN);
    }
    // Known-bad control: a hard-coded token must fail the check.
    expect('ANALYTICS_TOKEN = "0123456789abcdef0123456789abcdef"').toMatch(
      HEX_TOKEN,
    );
  });
});

describe("the analytics token", () => {
  it("is the trimmed value on an open build", () => {
    expect(analyticsToken("abc123", true)).toBe("abc123");
    expect(analyticsToken("  abc123\n", true)).toBe("abc123");
  });

  it("is empty on an open build without one", () => {
    for (const value of [undefined, "", "   ", "\n"]) {
      expect(analyticsToken(value, true), String(value)).toBe("");
    }
  });

  it("is empty on a closed build, whatever is set", () => {
    expect(analyticsToken("abc123", false)).toBe("");
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

// Astro replaces `import.meta.env.<NAME>` with any environment variable of
// that name, raw, before Vite's define runs: `ALLOW_INDEXING=false` would
// read as the truthy string "false". The flags are bare defines instead.
describe("the build flags", () => {
  const flagRead =
    /import\.meta\.env\.(ALLOW_INDEXING|ROUTE_CACHE|ANALYTICS_(BEACON_)?TOKEN)\b/;
  const envDefine = /define:\s*\{[^}]*import\.meta\.env\./;

  function sources(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|astro|mjs)$/.test(file))
      .map((file) => join(dir, file));
  }

  it("are never read through import.meta.env", () => {
    for (const file of [...sources("src"), ...sources("integrations")]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(flagRead);
    }
    expect(`{${"import.meta.env."}ROUTE_CACHE && x}`).toMatch(flagRead);
    expect(`{${"import.meta.env."}ANALYTICS_TOKEN}`).toMatch(flagRead);
  });

  it("are not defined under import.meta.env", () => {
    const config = readFileSync("astro.config.ts", "utf8");
    expect(config).toMatch(/__ALLOW_INDEXING__:/);
    expect(config).toMatch(/__ROUTE_CACHE__:/);
    expect(config).toMatch(/__ANALYTICS_TOKEN__:/);
    expect(config).not.toMatch(envDefine);
    expect(`define: {\n  "${"import.meta.env."}X": "1",\n}`).toMatch(envDefine);
  });
});

describe("the site address", () => {
  it("is the given one, trimmed, open or closed", () => {
    for (const open of [false, true]) {
      expect(siteUrl(" https://example.com\n", open)).toBe(
        "https://example.com",
      );
    }
  });

  it("falls back to the original site only on a closed build", () => {
    for (const value of [undefined, "", "   "]) {
      expect(siteUrl(value, false), String(value)).toBe("https://beuseful.net");
      expect(() => siteUrl(value, true), String(value)).toThrow(/SITE_URL/);
    }
  });
});
