import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIContext } from "astro";

vi.mock("astro:env/server", () => ({
  getSecret: (name: string) => process.env[name],
}));

const { onRequest } = await import("./middleware");
const { issuePreviewSession } = await import("./lib/preview-session");

const SECRET = "a-long-random-preview-secret";

function request(
  path: string,
  { cookie, prerendered = false }: { cookie?: string; prerendered?: boolean },
) {
  const next = vi.fn(async () => new Response("rendered"));
  const context = {
    url: new URL(`https://example.com${path}`),
    isPrerendered: prerendered,
    cookies: { get: () => (cookie ? { value: cookie } : undefined) },
  } as unknown as APIContext;
  return {
    next,
    response: onRequest(context, next) as Promise<Response>,
  };
}

beforeEach(() => {
  vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", SECRET);
});

describe("the draft gate", () => {
  it("refuses a draft page without a session, and never renders it", async () => {
    for (const path of ["/preview/posts/a", "/preview/de/posts/a"]) {
      const { next, response } = request(path, {});
      expect((await response).status, path).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("refuses a forged or foreign session", async () => {
    for (const cookie of [
      "9999999999.deadbeef",
      issuePreviewSession("another-secret").value,
    ]) {
      const { next, response } = request("/preview/posts/a", { cookie });
      expect((await response).status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("refuses every session when no secret is configured", async () => {
    vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", "");
    const { response } = request("/preview/posts/a", {
      cookie: issuePreviewSession(SECRET).value,
    });
    expect((await response).status).toBe(401);
  });

  it("renders a draft page for a live session", async () => {
    const { next, response } = request("/preview/posts/a", {
      cookie: issuePreviewSession(SECRET).value,
    });
    expect((await response).status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it("leaves other on-demand routes ungated", async () => {
    const { next, response } = request("/api/draft", {});
    expect((await response).status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("headers on on-demand responses", () => {
  it("mark every one unindexable and unstorable, refusals included", async () => {
    const live = { cookie: issuePreviewSession(SECRET).value };
    for (const [path, options] of [
      ["/preview/posts/a", live],
      ["/preview/posts/a", {}],
      ["/api/draft", {}],
    ] as const) {
      const response = await request(path, options).response;
      expect(response.headers.get("X-Robots-Tag"), path).toBe("noindex");
      expect(response.headers.get("Cache-Control"), path).toBe(
        "private, no-store",
      );
      expect(response.headers.get("Content-Security-Policy"), path).toContain(
        "default-src 'self'",
      );
    }
  });

  it("let Contentful frame a draft page and nothing else", async () => {
    const draft = await request("/preview/posts/a", {
      cookie: issuePreviewSession(SECRET).value,
    }).response;
    expect(draft.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self' https://app.contentful.com;",
    );
    const api = await request("/api/draft", {}).response;
    expect(api.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self';",
    );
  });

  it("are not added to a prerendered page, which takes them from the static host", async () => {
    const { response } = request("/", { prerendered: true });
    expect((await response).headers.get("Cache-Control")).toBeNull();
  });
});
