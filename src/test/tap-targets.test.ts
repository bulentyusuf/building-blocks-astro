import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { launch, open, ROUTES, type OpenOptions } from "./site";

// Every standalone control answers a tap anywhere in a 44px square centred
// on it, on a touch screen, and keeps its own size with a mouse. Measured by
// tapping the square's four edges on every page. A link inside a sentence is
// exempt: there the line of text is the target. The footer's peeking heads
// are held to 24px, the cropped look being the point.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

const TAP = 44;
const PEEK_TAP = 24;
// Inside the square's edge, so a pixel of rounding is not a failure.
const REACH = TAP / 2 - 1;
const PEEK_REACH = PEEK_TAP / 2 - 1;

// Runs in the page. The controls whose square lands on something else.
function probeInPage([full, peek]: [number, number]): {
  probed: number;
  misses: string[];
} {
  let probed = 0;
  // Open what is closed, so the controls inside are on screen to tap. The
  // phone menu's scrim covers the page, so it is tapped last, on its own.
  const menu = document.querySelector<HTMLDetailsElement>("[data-nav-menu]");
  for (const details of document.querySelectorAll("details")) {
    details.open = details !== menu;
  }
  const controls = [
    ...document.querySelectorAll<HTMLElement>("a[href], button, summary"),
  ];
  const outside = sweep(
    controls.filter((el) => !menu?.contains(el) || el.matches("summary")),
  );
  if (!menu || menu.getClientRects().length === 0) {
    return { probed, misses: outside };
  }
  menu.open = true;
  const inside = sweep(controls.filter((el) => menu.contains(el)));
  return { probed, misses: [...outside, ...inside] };

  function sweep(elements: HTMLElement[]): string[] {
    const inSentence = (el: Element) =>
      [...el.parentElement!.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && /\w/.test(node.textContent ?? ""),
      );
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`;

    const misses: string[] = [];
    for (const el of elements) {
      if (el.matches("a") && inSentence(el)) continue;
      // Not shown, or shown only on focus: nothing there to tap.
      if (el.closest("[inert]") || el.matches(".sr-only")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.pointerEvents === "none") {
        continue;
      }
      if (el.getClientRects().length === 0) continue;
      probed++;
      // elementFromPoint sees only the viewport, so bring the control into it.
      el.scrollIntoView({ block: "center", inline: "center" });
      // A peeking head is tapped where it shows: the part above the crop.
      const row = el.closest("[data-peek]")?.getBoundingClientRect();
      const reach = row ? peek : full;
      const r = el.getClientRects()[0];
      const bottom = row ? Math.min(r.bottom, row.bottom) : r.bottom;
      const cx = r.left + r.width / 2;
      const cy = (r.top + bottom) / 2;
      const points: [string, number, number][] = [
        ["top", cx, cy - reach],
        ["bottom", cx, cy + reach],
        ["left", cx - reach, cy],
        ["right", cx + reach, cy],
      ];
      const missed = points
        .filter(([, x, y]) => {
          // Past the screen's edge there is no neighbour to hit instead.
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
            return false;
          const hit = document.elementFromPoint(x, y);
          // A tap on a ::before or ::after reports the control itself.
          return !hit || !el.contains(hit);
        })
        .map(([side]) => side);
      if (missed.length > 0) misses.push(`${name(el)} ${missed.join(" ")}`);
    }
    return [...new Set(misses)];
  }
}

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function misses(
  file: string,
  options: OpenOptions,
  peekReach = PEEK_REACH,
): Promise<string[]> {
  const { page, context } = await open(browser, file, options);
  try {
    const { probed, misses } = await page.evaluate(probeInPage, [
      REACH,
      peekReach,
    ] as [number, number]);
    // Every page has at least its header and footer to tap.
    expect(probed, "the sweep found too few controls").toBeGreaterThan(12);
    return misses;
  } finally {
    await context.close();
  }
}

const PHONE = { width: 375, height: 800, touch: true };
const TABLET = { width: 1280, height: 900, touch: true };
// Bulent's reading size.
const LARGE_TEXT = "html{font-size:20px}";

// Draft pages are the published ones with an exit button.
const PUBLIC = Object.keys(ROUTES).filter(
  (file) => !file.startsWith("preview"),
);

describe.each(PUBLIC)("%s on a touch screen", (file) => {
  it("answers a tap anywhere in each control's 44px square", async () => {
    expect(await misses(file, PHONE)).toEqual([]);
    expect(await misses(file, TABLET)).toEqual([]);
  }, 60_000);

  it("still does at a 20px root font size", async () => {
    expect(await misses(file, { ...PHONE, css: LARGE_TEXT })).toEqual([]);
    expect(await misses(file, { ...TABLET, css: LARGE_TEXT })).toEqual([]);
  }, 60_000);
});

describe("the probe can fail", () => {
  it("finds small controls with a mouse, where they keep their own size", async () => {
    // Not a defect: proof the sizes change only for touch, and that the
    // probe tells a small target from a big one.
    const found = await misses("archive.astro", { width: 1280 });
    expect(found.some((miss) => miss.includes("Auf Deutsch lesen"))).toBe(true);
  }, 60_000);

  it("finds a peeking head short of 44px, which is why it is held to 24", async () => {
    // Known-bad control for the exception: held to 44px, the heads fail.
    const found = await misses("index.astro", PHONE, REACH);
    expect(found.some((miss) => miss.includes("Posts by"))).toBe(true);
  }, 60_000);

  it("finds them on a touch screen once the tap area is switched off", async () => {
    const found = await misses("archive.astro", {
      ...PHONE,
      css: ".tap-area::before{display:none}",
    });
    expect(found.some((miss) => miss.includes("Auf Deutsch lesen"))).toBe(true);
  }, 60_000);
});
