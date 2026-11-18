import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { launch, open, type OpenOptions } from "./site";

// The focus ring, measured as a keyboard reader meets it: whole, and clear of
// the ground it sits on.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const PHONE = { width: 375, height: 800, reducedMotion: true };

// Runs in the page. Focuses each match and reports any ring cut off by a
// clipping ancestor, by how many pixels on which side. Only the sides that
// cannot scroll into view: a row that scrolls sideways reveals its chips.
function clippedRings([selector, checked]: [string, string[]]): string[] {
  const found: string[] = [];
  if (!document.querySelector(selector)) return [`nothing matches ${selector}`];
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    el.focus();
    const style = getComputedStyle(el);
    const reach =
      parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX === "visible" && o.overflowY === "visible") continue;
      const clip = p.getBoundingClientRect();
      const left = clip.left + p.clientLeft;
      const top = clip.top + p.clientTop;
      const sides = {
        top: top - (box.top - reach),
        left: left - (box.left - reach),
        bottom: box.bottom + reach - (top + p.clientHeight),
      };
      for (const [side, cut] of Object.entries(sides))
        if (checked.includes(side) && cut > 0.5)
          found.push(
            `${el.textContent?.trim() || el.getAttribute("aria-label")}: ${side} ${cut.toFixed(1)}px`,
          );
      break;
    }
    el.blur();
  }
  return found;
}

describe("a focus ring", () => {
  const rings = async (
    file: string,
    selector: string,
    sides: string[],
    options: OpenOptions = {},
  ) => {
    const { page, context } = await open(browser, file, {
      ...PHONE,
      ...options,
    });
    try {
      return await page.evaluate(clippedRings, [selector, sides] as [
        string,
        string[],
      ]);
    } finally {
      await context.close();
    }
  };

  it("shows whole on the strand chips, pressed or not", async () => {
    expect(
      await rings("index.astro", "[data-strands] a", ["top", "bottom"]),
    ).toEqual([]);
    expect(
      await rings("categories/[slug].astro", "[data-strands] a", [
        "top",
        "bottom",
      ]),
    ).toEqual([]);
  }, 30_000);

  it("shows whole on the footer's writers, above and beside", async () => {
    // The row crops the heads at the footer's rule, so the bottom is not checked.
    expect(
      await rings("index.astro", 'nav[aria-label="Writers"] a', [
        "top",
        "left",
      ]),
    ).toEqual([]);
  }, 30_000);

  it("is the known-bad control: a chip row with no room is reported", async () => {
    const css =
      "[data-strands]{padding-top:0!important;margin-top:0!important}";
    expect(
      await rings("index.astro", "[data-strands] a", ["top", "bottom"], {
        css,
      }),
    ).not.toEqual([]);
  }, 30_000);
});

// Runs in the page. The contrast of a focused element's ring against the
// dark block it sits in, in the light scheme where the ink stays dark.
function ringContrast(selector: string): number[] {
  const rgb = (c: string) =>
    c
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
  const lum = (c: string) => {
    const [r, g, b] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ground = (el: Element) => {
    for (let p: Element | null = el; p; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor;
      if (!/rgba\(.*,\s*0\)$/.test(bg) && bg !== "transparent") return bg;
    }
    return "rgb(255, 255, 255)";
  };
  return [...document.querySelectorAll<HTMLElement>(selector)].map((el) => {
    el.focus();
    const ring = lum(getComputedStyle(el).outlineColor);
    const under = lum(ground(el.parentElement!));
    el.blur();
    return (Math.max(ring, under) + 0.05) / (Math.min(ring, under) + 0.05);
  });
}

describe("a focus ring on a code or prompt block", () => {
  const contrasts = async (css?: string) => {
    const { page, context } = await open(browser, "posts/[slug].astro", {
      width: 1280,
      css,
    });
    try {
      return await page.evaluate(
        ringContrast,
        ".bg-surface-dark button[data-copy], .bg-surface-dark [data-copy-source]",
      );
    } finally {
      await context.close();
    }
  };

  it("clears 3:1 against the block", async () => {
    const found = await contrasts();
    expect(found.length).toBeGreaterThan(1);
    for (const ratio of found) expect(ratio).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("is the known-bad control: the page's crimson would not", async () => {
    const css =
      ".bg-surface-dark :focus-visible{outline-color:var(--color-brand-crimson)!important}";
    expect(Math.min(...(await contrasts(css)))).toBeLessThan(3);
  }, 30_000);
});
