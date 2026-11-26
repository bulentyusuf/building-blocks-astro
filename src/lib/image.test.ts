import { describe, expect, it } from "vitest";
import { avifSrcset, contentfulSrc } from "./image";

const COVER = "https://images.ctfassets.net/space/id/hash/cover.jpg";

describe("avifSrcset", () => {
  it("offers every width as AVIF at the same quality as the WebP set", () => {
    const set = avifSrcset(COVER)!;
    const entries = set.split(", ");
    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      expect(entry).toMatch(/\?w=\d+&q=75&fm=avif \d+w$/);
    }
  });

  it("resolves a protocol-relative address to https", () => {
    expect(
      avifSrcset("//images.ctfassets.net/space/id/hash/cover.jpg"),
    ).toMatch(/^https:\/\/images\.ctfassets\.net\//);
  });

  it("offers nothing for another host, whose file it cannot re-encode", () => {
    expect(avifSrcset("https://example.com/cover.jpg")).toBeUndefined();
    expect(avifSrcset("/404-gremlin.webp")).toBeUndefined();
  });
});

describe("contentfulSrc", () => {
  it("stays WebP unless asked otherwise", () => {
    expect(contentfulSrc(COVER, 640)).toBe(`${COVER}?w=640&q=75&fm=webp`);
    expect(contentfulSrc(COVER, 640, "avif")).toBe(
      `${COVER}?w=640&q=75&fm=avif`,
    );
  });
});
