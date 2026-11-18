import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { launch, open } from "./site";

// An author's bio sits outside any prose column, so its links and paragraphs
// are styled where it is set. Measured with a link and a second paragraph
// added, since a bio may carry both.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

// Runs in the page. How a link and a second paragraph look in each bio.
function bioStyles() {
  return [...document.querySelectorAll("[data-bio]")].map((bio) => {
    bio.insertAdjacentHTML(
      "beforeend",
      '<p>See <a href="https://example.com">a link</a>.</p>',
    );
    const second = bio.lastElementChild as HTMLElement;
    const link = second.querySelector("a")!;
    const text = getComputedStyle(second);
    const style = getComputedStyle(link);
    return {
      underlined: style.textDecorationLine.includes("underline"),
      ownColour: style.color !== text.color,
      gap: parseFloat(text.marginTop),
    };
  });
}

describe("an author bio", () => {
  it.each(["posts/[slug].astro", "authors/[slug].astro"])(
    "underlines and colours its links and spaces its paragraphs, on %s",
    async (file) => {
      const { page, context } = await open(browser, file, { width: 1280 });
      try {
        const bios = await page.evaluate(bioStyles);
        expect(bios.length).toBeGreaterThan(0);
        for (const bio of bios)
          expect(bio).toMatchObject({ underlined: true, ownColour: true });
        for (const bio of bios) expect(bio.gap).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    },
    30_000,
  );
});
