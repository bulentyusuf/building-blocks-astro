import { describe, it, expect } from "vitest";
import {
  WIDEST_SERVED_FILE,
  contentfulSrc,
  fixedSource,
  responsiveSource,
} from "./image";
import { attributes, escapeHtml } from "./html";
import { enlargedWidth, worthEnlarging } from "./lightbox";

const ASSET = "https://images.ctfassets.net/space/id/hash/cover.jpg";

describe("contentfulSrc", () => {
  it("asks only for a width, a quality and WebP", () => {
    expect(contentfulSrc(ASSET, 640)).toBe(`${ASSET}?w=640&q=75&fm=webp`);
  });

  it("leaves another host's URL untouched, lookalikes included", () => {
    for (const src of [
      "/404-gremlin.webp",
      "https://example.com/a.jpg",
      "https://images.ctfassets.net.evil.example/a.jpg",
    ]) {
      expect(contentfulSrc(src, 640), src).toBe(src);
    }
  });
});

describe("image sources", () => {
  it("offers a responsive image at every width up to the widest file", () => {
    const { srcset, sizes } = responsiveSource(ASSET, "100vw");
    const widths = srcset.split(", ").map((entry) => entry.split(" ")[1]);
    expect(widths.at(-1)).toBe(`${WIDEST_SERVED_FILE}w`);
    expect(widths).toEqual([...widths].sort((a, b) => parseInt(a) - parseInt(b)));
    expect(sizes).toBe("100vw");
  });

  it("offers a fixed image at one and two times its size", () => {
    expect(fixedSource(ASSET, 40).srcset).toBe(
      `${ASSET}?w=40&q=75&fm=webp 1x, ${ASSET}?w=80&q=75&fm=webp 2x`,
    );
  });
});

describe("whether enlarging is worth offering", () => {
  const desktop = { viewportWidth: 1440, viewportHeight: 900, rootFontSize: 16 };

  it("offers it for a large photo on a large screen", () => {
    expect(
      worthEnlarging({
        ...desktop,
        shownWidth: 672,
        assetWidth: 2400,
        assetHeight: 1600,
      }),
    ).toBe(true);
  });

  it("withholds it for a screenshot barely wider than the column", () => {
    expect(
      worthEnlarging({
        ...desktop,
        shownWidth: 672,
        assetWidth: 700,
        assetHeight: 400,
      }),
    ).toBe(false);
  });

  it("withholds it when the screen's height is what holds it back", () => {
    expect(
      worthEnlarging({
        ...desktop,
        viewportHeight: 500,
        shownWidth: 600,
        assetWidth: 1600,
        assetHeight: 1600,
      }),
    ).toBe(false);
  });

  it("withholds it on a phone, where the column already spans the screen", () => {
    expect(
      worthEnlarging({
        viewportWidth: 390,
        viewportHeight: 800,
        rootFontSize: 16,
        shownWidth: 358,
        assetWidth: 2400,
        assetHeight: 1600,
      }),
    ).toBe(false);
  });

  it("holds the judgement to the served file, not the stored asset", () => {
    // A 6000px original is still served at most 1920 wide.
    expect(
      worthEnlarging({
        viewportWidth: 4000,
        viewportHeight: 3000,
        rootFontSize: 16,
        shownWidth: 1700,
        assetWidth: 6000,
        assetHeight: 3000,
      }),
    ).toBe(false);
    expect(enlargedWidth(6000, 3000)).toContain(`${WIDEST_SERVED_FILE}px`);
  });
});

describe("html helpers", () => {
  it("escapes every character that could leave text or an attribute", () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;",
    );
  });

  it("writes attributes escaped, bare when true, absent when unset", () => {
    expect(
      attributes({
        alt: `a "quoted" <tag>`,
        hidden: true,
        lang: undefined,
        inert: false,
        width: 0,
      }),
    ).toBe(' alt="a &quot;quoted&quot; &lt;tag&gt;" hidden width="0"');
  });
});
