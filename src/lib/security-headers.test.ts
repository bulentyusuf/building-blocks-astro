import { describe, it, expect } from "vitest";
import {
  CMS_ORIGIN,
  SECURITY_HEADERS,
  contentSecurityPolicy,
  contentSecurityPolicyFor,
  indexingAllowed,
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
        contentSecurityPolicyFor(path),
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

describe("the indexing flag", () => {
  it("opens only on the exact word", () => {
    expect(indexingAllowed("true")).toBe(true);
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(indexingAllowed(value), String(value)).toBe(false);
    }
  });
});
