import { describe, it, expect } from "vitest";
import { currentStrand } from "./strands";

// The header presses one chip per page.
describe("currentStrand", () => {
  it("presses All on home and a strand on its own page", () => {
    expect(currentStrand("/", undefined)).toEqual({
      slug: "all",
      onPost: false,
    });
    expect(currentStrand("/categories/films", undefined)).toEqual({
      slug: "films",
      onPost: false,
    });
  });

  it("presses a post's strand in both languages, marked as a post", () => {
    for (const path of ["/posts/a-film", "/de/posts/a-film"])
      expect(currentStrand(path, "films")).toEqual({
        slug: "films",
        onPost: true,
      });
  });

  it("presses nothing elsewhere, or for a post it cannot place", () => {
    for (const path of ["/archive", "/categories", "/tags/x"])
      expect(currentStrand(path, "films")).toBeNull();
    expect(currentStrand("/posts/unknown", undefined)).toBeNull();
  });
});
