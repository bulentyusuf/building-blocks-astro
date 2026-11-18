import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkLink, llmsLinks } from "./check-llms-links.mjs";

const SITE = "https://example.com";

/** A fetch that answers with a status, landing on `landed` if given. */
const answering =
  (status: number, landed?: string): typeof fetch =>
  async (url) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      redirected: landed !== undefined,
      url: landed ?? String(url),
    }) as Response;

describe("llmsLinks", () => {
  it("takes each markdown link target once", () => {
    expect(
      llmsLinks(
        "- [A](https://example.com/a): x\n[B](https://example.com/b) and [A again](https://example.com/a)",
      ),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("finds the links in the real file", () => {
    const text = readFileSync(
      new URL("../public/llms.txt", import.meta.url),
      "utf8",
    );
    expect(llmsLinks(text).length).toBeGreaterThan(10);
  });
});

describe("checkLink", () => {
  it("passes a page that answers", async () => {
    const r = await checkLink(`${SITE}/about`, SITE, answering(200));
    expect(r).toMatchObject({ ok: true, counts: true });
  });

  it("passes a redirect that only adds a trailing slash", async () => {
    const r = await checkLink(
      `${SITE}/about`,
      SITE,
      answering(200, `${SITE}/about/`),
    );
    expect(r.ok).toBe(true);
  });

  it("fails a page on the site that redirects elsewhere", async () => {
    const r = await checkLink(
      `${SITE}/posts/old-slug`,
      SITE,
      answering(200, `${SITE}/posts/new-slug`),
    );
    expect(r).toMatchObject({ ok: false, counts: true });
  });

  it("fails a page on the site that is missing", async () => {
    const r = await checkLink(`${SITE}/gone`, SITE, answering(404));
    expect(r).toMatchObject({ ok: false, counts: true });
  });

  it("lets a broken outside link through as a warning", async () => {
    const r = await checkLink(
      "https://github.com/someone/repo",
      SITE,
      answering(429),
    );
    expect(r).toMatchObject({ ok: false, counts: false });
  });

  it("reports a network error instead of throwing", async () => {
    const r = await checkLink(`${SITE}/about`, SITE, async () => {
      throw new TypeError("fetch failed");
    });
    expect(r).toMatchObject({ ok: false, counts: true, detail: "TypeError" });
  });
});
