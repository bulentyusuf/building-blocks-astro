import { describe, it, expect } from "vitest";
import { cardContent, cardTitle, coverPanelUrl, ogCard } from "./og-card";

const NBSP = String.fromCharCode(0x00a0);
const COVER = "https://images.ctfassets.net/space/id/hash/cover.jpg";

describe("the card's title", () => {
  it("glues the last two words, so a line never ends on one", () => {
    expect(cardTitle("Monitor home network chatter")).toBe(
      `Monitor home network${NBSP}chatter`,
    );
  });

  it("clamps a long title with an ellipsis, since the renderer has none", () => {
    const title = cardTitle("word ".repeat(40));
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(91);
  });
});

describe("the card's cover", () => {
  it("asks for exactly the panel's size", () => {
    const url = new URL(coverPanelUrl(COVER)!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      w: "480",
      h: "630",
      fit: "fill",
      fm: "jpg",
      q: "80",
    });
  });

  it("normalises a protocol-relative asset URL", () => {
    expect(coverPanelUrl(COVER.replace("https:", ""))).toMatch(/^https:\/\//);
  });

  it("refuses any host but the image CDN, so nothing else is baked in", () => {
    for (const url of [
      "https://example.com/cover.jpg",
      "https://images.ctfassets.net.evil.example/cover.jpg",
      "not a url",
      undefined,
    ]) {
      expect(coverPanelUrl(url), String(url)).toBeNull();
    }
  });
});

describe("the card", () => {
  it("carries the site, the author and a checked cover", () => {
    expect(
      cardContent({
        title: "One two three",
        siteTitle: "Be Useful.",
        author: "A & B",
        coverUrl: "https://example.com/cover.jpg",
      }),
    ).toEqual({
      title: `One two${NBSP}three`,
      siteTitle: "Be Useful.",
      author: "A & B",
      coverUrl: null,
    });
  });

  it("keeps its layout with a solid panel when there is no cover", () => {
    const panel = (cover: string | null) =>
      (
        ogCard({ title: "T", siteTitle: "S", author: "A", cover }).props
          .children as { props: { children?: unknown } }[]
      )[1].props.children;
    expect(panel(null)).toBeNull();
    expect(panel("data:image/jpeg;base64,AA")).toMatchObject({ type: "img" });
  });
});
