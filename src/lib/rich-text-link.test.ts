import { describe, it, expect } from "vitest";
import { resolveHyperlink } from "./rich-text-link";

describe("resolveHyperlink", () => {
  it("keeps a same-page fragment as a plain link", () => {
    expect(resolveHyperlink("#was-mit-hinueberkam")).toEqual({
      href: "#was-mit-hinueberkam",
      external: false,
    });
  });

  it("keeps a root-relative path, fragment included", () => {
    expect(resolveHyperlink("/posts/hello#part")).toEqual({
      href: "/posts/hello#part",
      external: false,
    });
  });

  it("treats the site's own origin and subdomains as internal", () => {
    expect(resolveHyperlink("https://beuseful.net/about")?.external).toBe(
      false,
    );
    expect(resolveHyperlink("https://www.beuseful.net/")?.external).toBe(false);
  });

  it("marks another origin external, lookalikes included", () => {
    expect(resolveHyperlink("https://example.com/x")?.external).toBe(true);
    expect(
      resolveHyperlink("https://beuseful.net.evil.example/")?.external,
    ).toBe(true);
    expect(resolveHyperlink("https://notbeuseful.net/")?.external).toBe(true);
  });

  it("keeps mailto without the new-window treatment", () => {
    expect(resolveHyperlink("mailto:hello@example.com")).toEqual({
      href: "mailto:hello@example.com",
      external: false,
    });
  });

  it("degrades anything else to text", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "not a url",
      undefined,
      42,
    ]) {
      expect(resolveHyperlink(uri), String(uri)).toBeNull();
    }
  });
});
