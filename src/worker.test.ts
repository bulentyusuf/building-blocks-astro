import { describe, it, expect, vi } from "vitest";

// The adapter's handler only loads inside a build.
vi.mock("@astrojs/cloudflare/handler", () => ({ handle: vi.fn() }));

const { respond } = await import("./worker");

const send = (path: string, response: Response) =>
  respond(async () => response, new URL(`https://example.com${path}`));

describe("headers on every Worker response", () => {
  it("mark every one unindexable and unstorable, framework-made ones included", async () => {
    for (const [path, made] of [
      ["/preview/posts/a", new Response("rendered")],
      [
        "/preview/posts/a",
        new Response("No preview session.", { status: 401 }),
      ],
      // What the framework sends before any middleware runs.
      [
        "/api/draft/",
        new Response(null, {
          status: 301,
          headers: { Location: "/api/draft" },
        }),
      ],
      ["/api/exit-preview", new Response("Cross-site POST", { status: 403 })],
      ["/preview/posts/%E0%A4%A", new Response(null, { status: 400 })],
      ["/preview/posts/a", new Response(null, { status: 500 })],
    ] as const) {
      const response = await send(path, made);
      const label = `${path} ${made.status}`;
      expect(response.status, label).toBe(made.status);
      expect(response.headers.get("X-Robots-Tag"), label).toBe("noindex");
      expect(response.headers.get("Cache-Control"), label).toBe(
        "private, no-store",
      );
      expect(
        response.headers.get("Strict-Transport-Security"),
        label,
      ).toContain("max-age=");
      expect(response.headers.get("Content-Security-Policy"), label).toContain(
        "default-src 'self'",
      );
    }
  });

  it("treat a page draft as a draft: framed, unindexed, unstored", async () => {
    const draft = await send("/preview/pages/privacy", new Response("ok"));
    expect(draft.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self' https://app.contentful.com;",
    );
    expect(draft.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(draft.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("let Contentful frame a draft page and nothing else", async () => {
    const draft = await send("/preview/posts/a", new Response("rendered"));
    expect(draft.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self' https://app.contentful.com;",
    );
    const api = await send("/api/draft", new Response("Invalid token"));
    expect(api.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self';",
    );
  });

  it("replace what the response already said, on headers it cannot edit", async () => {
    const stored = Response.redirect("https://example.com/x", 302);
    const response = await send(
      "/api/draft",
      new Response("page", { headers: { "Cache-Control": "public" } }),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("page");
    // Response.redirect() has immutable headers, like one from the static host.
    expect((await send("/a", stored)).headers.get("X-Robots-Tag")).toBe(
      "noindex",
    );
  });

  it("keep the session cookie a response sets", async () => {
    const response = await send(
      "/api/draft",
      new Response(null, {
        status: 307,
        headers: {
          Location: "/preview/posts/a",
          "Set-Cookie": "preview_session=1.abc; Path=/preview",
        },
      }),
    );
    expect(response.headers.get("Location")).toBe("/preview/posts/a");
    expect(response.headers.getSetCookie()).toEqual([
      "preview_session=1.abc; Path=/preview",
    ]);
  });
});

describe("a redirect from the Worker", () => {
  // The framework's own trailing-slash redirect, as staging sent it.
  const echoed = () =>
    new Response(
      "<title>Redirecting to: /api/draft?secret=s3cret&amp;slug=a</title>",
      {
        status: 301,
        headers: {
          Location: "/api/draft?secret=s3cret&slug=a",
          "Content-Type": "text/plain;charset=UTF-8",
        },
      },
    );

  it("never hands the preview secret back, in the address or the body", async () => {
    const response = await send("/api/draft/", echoed());
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/api/draft");
    expect(await response.text()).toBe("");
  });

  it("is the known-bad control: the framework's redirect does carry it", async () => {
    const made = echoed();
    expect(made.headers.get("Location")).toContain("s3cret");
    expect(await made.text()).toContain("s3cret");
  });
});

describe("a draft address ending in /index.html", () => {
  it("is not found, and never reaches the framework or Contentful", async () => {
    for (const path of [
      "/preview/posts/a/index.html",
      "/preview/de/posts/a/index.html",
    ]) {
      const render = vi.fn(async () => new Response(null, { status: 500 }));
      const response = await respond(
        render,
        new URL(`https://example.com${path}`),
      );
      expect(response.status, path).toBe(404);
      expect(render, path).not.toHaveBeenCalled();
      expect(response.headers.get("Cache-Control"), path).toBe(
        "private, no-store",
      );
    }
  });

  it("leaves every other address to the framework", async () => {
    for (const path of ["/preview/posts/a", "/nope/index.html", "/api/draft"]) {
      const render = vi.fn(async () => new Response("rendered"));
      await respond(render, new URL(`https://example.com${path}`));
      expect(render, path).toHaveBeenCalledOnce();
    }
  });
});

describe("with the route cache on", () => {
  const EDGE = "Cloudflare-CDN-Cache-Control";
  // What the cache provider puts on a page that asked to be held.
  const page = (init: ResponseInit = {}) =>
    new Response("rendered", {
      ...init,
      headers: {
        [EDGE]: "public, max-age=604800",
        "Cache-Tag": "post1,astro-path:/posts/a",
        ...init.headers,
      },
    });
  const on = (
    path: string,
    response: Response,
    allowIndexing = false,
    analytics = allowIndexing,
  ) =>
    respond(async () => response, new URL(`https://example.com${path}`), {
      routeCache: true,
      allowIndexing,
      analytics,
    });

  it("holds a public page, with a static file's headers", async () => {
    const response = await on("/posts/a", page());
    expect(response.headers.get(EDGE)).toBe("public, max-age=604800");
    expect(response.headers.get("Cache-Tag")).toContain("post1");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("Strict-Transport-Security")).toContain(
      "max-age=",
    );
  });

  it("gives a held page a validator made from its bytes", async () => {
    const tag = async (body: string) =>
      (await on("/posts/a", new Response(body, page()))).headers.get("ETag");
    expect(await tag("one")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(await tag("one")).toBe(await tag("one"));
    expect(await tag("one")).not.toBe(await tag("two"));
    // The body still arrives whole.
    const response = await on("/posts/a", new Response("one", page()));
    expect(await response.text()).toBe("one");
    // Known-bad control: nothing that is not held gets one.
    const draft = await on("/preview/posts/a", new Response("one", page()));
    expect(draft.headers.has("ETag")).toBe(false);
  });

  it("keeps a held page out of search engines unless the build is open", async () => {
    const closed = await on("/posts/a", page());
    expect(closed.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(closed.headers.get("Content-Security-Policy")).not.toContain(
      "cloudflareinsights",
    );
    const open = await on("/posts/a", page(), true);
    expect(open.headers.has("X-Robots-Tag")).toBe(false);
    expect(open.headers.get("Content-Security-Policy")).toContain(
      "https://static.cloudflareinsights.com",
    );
  });

  it("leaves analytics out of an open build that has no token", async () => {
    const open = await on("/posts/a", page(), true, false);
    expect(open.headers.has("X-Robots-Tag")).toBe(false);
    expect(open.headers.get("Content-Security-Policy")).not.toContain(
      "cloudflareinsights",
    );
  });

  it("never holds a draft or an endpoint, whatever the route asked for", async () => {
    for (const path of [
      "/preview/posts/a",
      "/preview/de/posts/a",
      "/api/draft",
      "/api/purge",
    ]) {
      const response = await on(path, page(), true);
      expect(response.headers.get(EDGE), path).toBe("no-store");
      expect(response.headers.has("Cache-Tag"), path).toBe(false);
      expect(response.headers.get("Cache-Control"), path).toBe(
        "private, no-store",
      );
      expect(response.headers.get("X-Robots-Tag"), path).toBe("noindex");
      expect(
        response.headers.get("Content-Security-Policy"),
        path,
      ).not.toContain("cloudflareinsights");
    }
  });

  it("never holds a response that sets a cookie, failed, or did not ask", async () => {
    for (const [label, made] of [
      ["cookie", page({ headers: { "Set-Cookie": "preview_session=1.abc" } })],
      ["404", page({ status: 404 })],
      ["500", page({ status: 500 })],
      ["no intent", new Response("rendered")],
      [
        "opted out",
        new Response("rendered", { headers: { [EDGE]: "no-store" } }),
      ],
    ] as const) {
      const response = await on("/posts/a", made, true);
      expect(response.headers.get(EDGE), label).toBe("no-store");
      expect(response.headers.has("Cache-Tag"), label).toBe(false);
      expect(response.headers.get("Cache-Control"), label).toBe(
        "private, no-store",
      );
      expect(response.headers.get("X-Robots-Tag"), label).toBe("noindex");
    }
  });

  it("never holds a redirect", async () => {
    const response = await on(
      "/posts/a/",
      page({ status: 301, headers: { Location: "/posts/a?x=1" } }),
    );
    expect(response.headers.get(EDGE)).toBe("no-store");
    expect(response.headers.get("Location")).toBe("/posts/a");
  });
});

describe("a page's file name, with the route cache on", () => {
  const ask = async (path: string, routeCache = true) => {
    const render = vi.fn(async () => new Response("rendered"));
    const response = await respond(
      render,
      new URL(`https://example.com${path}`),
      { routeCache },
    );
    return { render, response };
  };

  it("redirects to the clean address, as the static host does, unrendered", async () => {
    for (const [path, clean] of [
      ["/index.html", "/"],
      ["/archive.html", "/archive"],
      ["/posts/a.html", "/posts/a"],
      ["/posts/a/index.html", "/posts/a"],
      ["/posts/a.html?x=1", "/posts/a"],
    ]) {
      const { render, response } = await ask(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get("Location"), path).toBe(clean);
      expect(render, path).not.toHaveBeenCalled();
      expect(response.headers.get("Cache-Control"), path).toBe(
        "private, no-store",
      );
    }
  });

  it("leaves a clean address, a draft and an endpoint to the framework", async () => {
    for (const path of [
      "/posts/a",
      "/htmlish",
      "/preview/posts/a.html",
      "/api/a.html",
    ]) {
      const { render, response } = await ask(path);
      expect(response.status, path).toBe(200);
      expect(render, path).toHaveBeenCalledOnce();
    }
  });

  it("is the framework's to answer with the route cache off, as today", async () => {
    const { render, response } = await ask("/posts/a.html", false);
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledOnce();
  });
});

describe("with the route cache off", () => {
  it("holds nothing, even a page that asks, and adds no cache header", async () => {
    // Known-bad control for the block above: the same response, switch off.
    const asked = new Response("rendered", {
      headers: { "Cloudflare-CDN-Cache-Control": "public, max-age=604800" },
    });
    const response = await send("/posts/a", asked);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    const plain = await send("/posts/a", new Response("rendered"));
    expect(plain.headers.has("Cloudflare-CDN-Cache-Control")).toBe(false);
  });
});
