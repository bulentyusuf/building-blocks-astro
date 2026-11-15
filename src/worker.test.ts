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
