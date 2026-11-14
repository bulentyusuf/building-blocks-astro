import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIContext } from "astro";

// Where a Contentful preview link lands. The session cookie and the redirect
// are recorded through the request context and asserted directly.

const getPost = vi.fn();

vi.mock("astro:env/server", () => ({
  getSecret: (name: string) => process.env[name],
}));
vi.mock("../../lib/api", () => ({
  getPost: (...args: unknown[]) => getPost(...args),
}));

const { GET } = await import("./draft");
const { POST: exit } = await import("./exit-preview");
const { isPreviewSession, PREVIEW_COOKIE } =
  await import("../../lib/preview-session");

const SECRET = "a-long-random-preview-secret";

const setCookie = vi.fn();
const deleteCookie = vi.fn();

function context(query: string): APIContext {
  return {
    url: new URL(`https://example.com/api/draft?${query}`),
    cookies: { set: setCookie, delete: deleteCookie },
    redirect: (path: string, status: number) =>
      new Response(null, { status, headers: { Location: path } }),
  } as unknown as APIContext;
}

const open = (query: string) => GET(context(query)) as Promise<Response>;

beforeEach(() => {
  vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", SECRET);
  setCookie.mockClear();
  deleteCookie.mockClear();
  getPost.mockReset();
  getPost.mockResolvedValue({ slug: "some-post" });
});

describe("the draft preview route", () => {
  it("opens the English draft when no locale is given", async () => {
    const response = await open(`secret=${SECRET}&slug=some-post`);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/preview/posts/some-post");
    expect(setCookie).toHaveBeenCalledOnce();
  });

  it("opens the English draft for en-GB", async () => {
    const response = await open(`secret=${SECRET}&slug=some-post&locale=en-GB`);
    expect(response.headers.get("Location")).toBe("/preview/posts/some-post");
  });

  it("opens the German draft for de-DE", async () => {
    const response = await open(`secret=${SECRET}&slug=some-post&locale=de-DE`);
    expect(response.headers.get("Location")).toBe(
      "/preview/de/posts/some-post",
    );
    expect(setCookie).toHaveBeenCalledOnce();
  });

  it("treats a near miss as English, not German", async () => {
    // Known-bad control: only the exact code switches route.
    for (const locale of ["de", "DE-de", "de-DE-x"]) {
      const response = await open(
        `secret=${SECRET}&slug=some-post&locale=${locale}`,
      );
      expect(response.headers.get("Location"), locale).toBe(
        "/preview/posts/some-post",
      );
    }
  });

  it("starts a session the gate accepts, scoped to the preview pages", async () => {
    await open(`secret=${SECRET}&slug=some-post`);
    const [name, value, options] = setCookie.mock.calls[0];
    expect(name).toBe(PREVIEW_COOKIE);
    expect(isPreviewSession(value, SECRET)).toBe(true);
    expect(options).toMatchObject({
      path: "/preview",
      httpOnly: true,
      secure: true,
      // Contentful frames the preview from its own site.
      sameSite: "none",
      partitioned: true,
    });
  });

  it("looks the post up as a draft", async () => {
    await open(`secret=${SECRET}&slug=some-post`);
    expect(getPost).toHaveBeenCalledWith("some-post", true);
  });

  it("refuses a wrong or missing secret before anything else happens", async () => {
    for (const query of [
      "secret=nope&slug=some-post&locale=de-DE",
      "slug=some-post",
      "secret=&slug=some-post",
    ]) {
      const response = await open(query);
      expect(response.status, query).toBe(401);
    }
    expect(getPost).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    // An unset secret must not match an empty one.
    vi.stubEnv("CONTENTFUL_PREVIEW_SECRET", "");
    expect((await open("secret=&slug=some-post")).status).toBe(401);
    expect((await open("slug=some-post")).status).toBe(401);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed slug without asking Contentful", async () => {
    for (const slug of ["", "../etc", "Some-Post", "a/b", "-lead", "a b"]) {
      const response = await open(
        `secret=${SECRET}&slug=${encodeURIComponent(slug)}`,
      );
      expect(response.status, slug).toBe(400);
    }
    expect(getPost).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refuses a slug that does not exist, and starts no session", async () => {
    getPost.mockResolvedValue(undefined);
    const response = await open(`secret=${SECRET}&slug=no-such-post`);
    expect(response.status).toBe(404);
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe("leaving preview", () => {
  it("clears the session on the path it was set on and goes home", async () => {
    const response = (await exit(context(""))) as Response;
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/");
    expect(deleteCookie).toHaveBeenCalledWith(
      PREVIEW_COOKIE,
      expect.objectContaining({ path: "/preview" }),
    );
  });
});
