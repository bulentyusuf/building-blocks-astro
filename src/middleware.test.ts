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
    for (const path of [
      "/preview/posts/a",
      "/preview/de/posts/a",
      "/preview/pages/privacy",
    ]) {
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
