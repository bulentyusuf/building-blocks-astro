import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import sharp from "sharp";
import { LANDSCAPE, PANORAMA } from "./fixtures";
import { launch, open, type OpenOptions } from "./site";

// The enlarged view of a body picture, driven in a real browser: when it is
// offered, how it opens and closes, and what it shows while it does.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

const POST = "posts/[slug].astro";
const ENLARGE = 'button[aria-label="Enlarge image"]';

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const contexts: BrowserContext[] = [];
async function post(options: OpenOptions = {}): Promise<Page> {
  const { page, context } = await open(browser, POST, options);
  contexts.push(context);
  return page;
}
afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
});

/** Clicks a picture's enlarge button once the picture itself has loaded. */
async function enlarge(page: Page, name: string): Promise<void> {
  const button = page.locator(`${ENLARGE}:has(img[src*="${name}"])`);
  await button.scrollIntoViewIfNeeded();
  await button.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  await button.click();
}

const offered = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("img[data-lightbox]")].map(
      (img) =>
        `${/space\/(\w+)/.exec(img.getAttribute("src")!)![1]}: ${img.parentElement instanceof HTMLButtonElement}`,
    ),
  );

// Runs in the page. The dialog as a reader meets it.
function dialogState() {
  const dialog = document.querySelector<HTMLDialogElement>("#lightbox")!;
  const labelledby = dialog.getAttribute("aria-labelledby");
  const active = document.activeElement;
  return {
    open: dialog.open,
    modal: dialog.matches(":modal"),
    name: labelledby
      ? document.getElementById(labelledby)!.textContent
      : dialog.getAttribute("aria-label"),
    alt: dialog.querySelector("img")!.alt,
    focus: active?.getAttribute("aria-label") ?? active?.tagName.toLowerCase(),
    focusPicture: active?.querySelector("img")?.getAttribute("src") ?? null,
  };
}

describe("the enlarge button", () => {
  it("is offered where the enlarged view is really larger, and only there", async () => {
    const page = await post();
    expect(await offered(page)).toEqual([
      "landscape: true",
      "panorama: true",
      // Barely wider than the column, so a click would gain nothing.
      "screenshot: false",
    ]);
  });

  it("is withheld on a phone, and withdrawn when the window shrinks to one", async () => {
    const nowhere = [
      "landscape: false",
      "panorama: false",
      "screenshot: false",
    ];
    expect(await offered(await post({ width: 375, height: 800 }))).toEqual(
      nowhere,
    );
    const page = await post();
    await page.setViewportSize({ width: 375, height: 800 });
    await expect.poll(() => offered(page)).toEqual(nowhere);
  });

  it("does not exist with scripts off, and the pictures still show", async () => {
    const page = await post({ scripts: false });
    expect(await page.locator(ENLARGE).count()).toBe(0);
    expect(await page.locator("img[data-lightbox]").count()).toBe(3);
  });
});

describe("the enlarged view", () => {
  it("opens as a modal named by the caption, with focus on its close button", async () => {
    const page = await post();
    await enlarge(page, LANDSCAPE);
    expect(await page.evaluate(dialogState)).toMatchObject({
      open: true,
      modal: true,
      name: "Where the site gets written.",
      alt: "A desk with two monitors and a mechanical keyboard",
      focus: "Close enlarged image",
    });
  });

  it("is named by the alt text when the picture has no caption", async () => {
    const page = await post();
    await enlarge(page, PANORAMA);
    expect(await page.evaluate(dialogState)).toMatchObject({
      open: true,
      name: "A long bookshelf, end to end",
    });
  });

  it("closes from its button, or on Escape, and returns focus to the picture", async () => {
    const page = await post();
    for (const close of [
      () => page.click('button[aria-label="Close enlarged image"]'),
      () => page.keyboard.press("Escape"),
    ]) {
      await enlarge(page, PANORAMA);
      await close();
      const state = await page.evaluate(dialogState);
      expect(state).toMatchObject({ open: false, focus: "Enlarge image" });
      expect(state.focusPicture).toContain(PANORAMA);
    }
  });

  it("stays open on a click on the picture and closes on one beside it", async () => {
    const page = await post();
    await enlarge(page, LANDSCAPE);
    const box = (await page.locator("#lightbox img").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect((await page.evaluate(dialogState)).open).toBe(true);
    await page.mouse.click(box.x / 2, box.y + box.height / 2);
    expect((await page.evaluate(dialogState)).open).toBe(false);
  });

  it("holds the page still behind it, and lets it scroll again once closed", async () => {
    const page = await post();
    const wheel = async () => {
      const before = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
      return (await page.evaluate(() => scrollY)) - before;
    };
    await enlarge(page, LANDSCAPE);
    expect(await wheel()).toBe(0);
    await page.keyboard.press("Escape");
    // The known-bad control: the same wheel moves an unlocked page.
    expect(await wheel()).toBeGreaterThan(0);
  });
});

describe("opening a second picture", () => {
  // The view is one <img>, reused. What it shows is read off the screen: the
  // stand-in pictures are flat colours, one per picture, so the colour at
  // the view's centre says whose file is painted there.
  const colourAt = async (page: Page, selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    const shot = await page.screenshot({
      clip: {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
        width: 1,
        height: 1,
      },
    });
    const [r, g, b] = await sharp(shot).raw().toBuffer();
    return `rgb(${r} ${g} ${b})`;
  };
  const thumbnail = (name: string) => `img[data-lightbox][src*="${name}"]`;

  // The second picture's large file arrives late, as on a slow connection:
  // that is when a stale picture has time to be seen. The file already on
  // the page is not held back, standing in for the browser's cache.
  const slow = {
    slowPictures: { match: `${PANORAMA}.jpg?w=1920`, delay: 600 },
  };

  /** Opens the first picture, closes it, and returns each picture's colour. */
  async function firstThenClose() {
    const page = await post(slow);
    await enlarge(page, LANDSCAPE);
    const first = await colourAt(page, "#lightbox img");
    await page.keyboard.press("Escape");
    await page.locator(thumbnail(PANORAMA)).scrollIntoViewIfNeeded();
    await page
      .locator(thumbnail(PANORAMA))
      .evaluate((img: HTMLImageElement) => img.decode());
    const second = await colourAt(page, thumbnail(PANORAMA));
    expect(first).not.toBe(second);
    return { page, first, second };
  }

  /** The view's colour, sampled until the late file has had time to land. */
  async function watch(page: Page): Promise<string[]> {
    const seen: string[] = [];
    const until = Date.now() + 900;
    while (Date.now() < until) seen.push(await colourAt(page, "#lightbox img"));
    return seen;
  }

  it("never shows the first one's file", async () => {
    const { page, first, second } = await firstThenClose();
    await page.click(`${ENLARGE}:has(${thumbnail(PANORAMA)})`);
    const seen = await watch(page);
    expect(seen.length).toBeGreaterThan(5);
    expect(seen).not.toContain(first);
    // The picture is there well before the large file lands.
    expect(seen.slice(0, seen.length / 2)).toContain(second);
    expect(seen.at(-1)).toBe(second);
  });

  it("would be caught showing it: the opener as it was before the fix", async () => {
    const { page, first, second } = await firstThenClose();
    // Known-bad control. The old opener pointed the reused <img> straight at
    // the new srcset, so the last picture stayed until the new file arrived.
    await page.evaluate((selector) => {
      const dialog = document.querySelector<HTMLDialogElement>("#lightbox")!;
      const view = dialog.querySelector("img")!;
      const next = document.querySelector<HTMLImageElement>(selector)!;
      view.srcset = next.srcset;
      view.src = next.src;
      dialog.showModal();
    }, thumbnail(PANORAMA));
    const seen = await watch(page);
    expect(seen[0]).toBe(first);
    expect(seen.at(-1)).toBe(second);
  });
});
