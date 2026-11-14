import { describe, it, expect } from "vitest";
import { BLOCKS } from "@contentful/rich-text-types";
import type { Document } from "@contentful/rich-text-types";
import { extractHeadings, hasTableOfContents, MIN_HEADINGS } from "./headings";

// Minimal rich-text node builders, matching the fixture shape in
// rich-text.test.tsx.
const text = (value: string) => ({
  nodeType: "text",
  value,
  marks: [],
  data: {},
});

const heading2 = (...children: unknown[]) => ({
  nodeType: BLOCKS.HEADING_2,
  data: {},
  content: children,
});

const link = (uri: string, value: string) => ({
  nodeType: "hyperlink",
  data: { uri },
  content: [text(value)],
});

const docOf = (...headings: unknown[]) =>
  ({
    nodeType: BLOCKS.DOCUMENT,
    data: {},
    content: headings,
  }) as unknown as Document;

const slugsOf = (...headings: unknown[]) =>
  extractHeadings(docOf(...headings)).map((h) => h.slug);

describe("extractHeadings slugging", () => {
  it("strips a leading ordinal so a listicle slug survives a renumber", () => {
    expect(
      slugsOf(
        heading2(text("1. Zak McKracken and the Alien Mindbenders (1988)")),
      ),
    ).toEqual(["zak-mckracken-and-the-alien-mindbenders-1988"]);
  });

  it("strips a leading ordinal written with a closing paren", () => {
    expect(slugsOf(heading2(text("10) Another Game")))).toEqual([
      "another-game",
    ]);
  });

  it("leaves a legitimate leading year untouched (no trailing ordinal punctuation)", () => {
    expect(slugsOf(heading2(text("2024 in review")))).toEqual([
      "2024-in-review",
    ]);
  });

  it("keeps a heading that is only a number rather than collapsing to section", () => {
    expect(slugsOf(heading2(text("1988")))).toEqual(["1988"]);
  });

  it("collision-resolves two headings differing only by ordinal", () => {
    expect(
      slugsOf(heading2(text("1. Doom")), heading2(text("2. Doom"))),
    ).toEqual(["doom", "doom-1"]);
  });

  it("folds diacritics to ASCII", () => {
    expect(slugsOf(heading2(text("Café Culture")))).toEqual(["cafe-culture"]);
  });

  it("spells out German letters rather than dropping them", () => {
    // The third is decomposed, as pasted text can be, to exercise the NFC pass.
    expect(
      slugsOf(
        heading2(text("Was mit hinüberkam")),
        heading2(text("Großartig")),
        heading2(text("Über Äpfel".normalize("NFD"))),
      ),
    ).toEqual(["was-mit-hinueberkam", "grossartig", "ueber-aepfel"]);
  });

  it("skips an empty heading node rather than emitting a section slug", () => {
    expect(slugsOf(heading2(text("")), heading2(text("Real heading")))).toEqual(
      ["real-heading"],
    );
  });

  it("flattens a heading with a nested inline hyperlink into its full text", () => {
    const headings = extractHeadings(
      docOf(heading2(text("See the "), link("https://example.com", "docs"))),
    );
    expect(headings).toEqual([{ text: "See the docs", slug: "see-the-docs" }]);
  });
});

describe("MIN_HEADINGS", () => {
  it("is 3: below that a contents list is as long as the article", () => {
    expect(MIN_HEADINGS).toBe(3);
  });
});

const dummyHeadings = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Heading ${i}`,
    slug: `heading-${i}`,
  }));

// Literal 2 and 3 here, not MIN_HEADINGS - 1 and MIN_HEADINGS — comparing the
// predicate against a copy of its own threshold would pass whether that
// threshold is 3 or something else entirely. This pins the comparison itself.
describe("hasTableOfContents", () => {
  it("is false just below the threshold", () => {
    expect(hasTableOfContents(dummyHeadings(2))).toBe(false);
  });

  it("is true at the threshold", () => {
    expect(hasTableOfContents(dummyHeadings(3))).toBe(true);
  });
});
