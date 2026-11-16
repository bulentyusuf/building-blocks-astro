import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { launch, open, type OpenOptions } from "./site";

// The site's small scripts, each driven as a reader would: the phone menu,
// the back-to-top button, the copy buttons and the contents list.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

const POST = "posts/[slug].astro";
const PHONE = { width: 375, height: 800 };

let browser: Browser;
const contexts: BrowserContext[] = [];
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

async function load(file: string, options: OpenOptions = {}) {
  const opened = await open(browser, file, options);
  contexts.push(opened.context);
  return opened;
}

describe("the phone menu", () => {
  const state = (page: Page) =>
    page.evaluate(() => ({
      open: document.querySelector<HTMLDetailsElement>("[data-nav-menu]")!.open,
      focus: document.activeElement?.getAttribute("aria-label") ?? null,
      path: location.pathname,
    }));
  const menu = async (options: OpenOptions = {}) => {
    const { page } = await load("index.astro", { ...PHONE, ...options });
    await page.click("[data-nav-menu] summary");
    expect((await state(page)).open).toBe(true);
    return page;
  };

  it("closes on Escape and returns focus to its button", async () => {
    const page = await menu();
    // Focus starts inside the menu, as it would for a keyboard reader.
    await page.focus('[data-nav-menu] a[href="/archive"]');
    await page.keyboard.press("Escape");
    expect(await state(page)).toMatchObject({ open: false, focus: "Menu" });
  });

  it("stays open on a press inside it", async () => {
    const page = await menu();
    const panel = (await page.locator("[data-nav-menu] ul").boundingBox())!;
    // The panel's own padding, beside the links.
    await page.mouse.move(panel.x - 8, panel.y + 8);
    await page.mouse.down();
    await page.mouse.up();
    expect((await state(page)).open).toBe(true);
  });

  it("closes on a press outside it", async () => {
    const page = await menu();
    await page.mouse.move(8, 8);
    await page.mouse.down();
    expect((await state(page)).open).toBe(false);
  });

  it("closes on a tap on the scrim, which presses nothing beneath", async () => {
    const page = await menu();
    // Over the feature card, whose whole surface is a link.
    await page.mouse.click(40, 500);
    expect(await state(page)).toMatchObject({ open: false, path: "/" });
  });

  it("would stay open on Escape without its script", async () => {
    // Known-bad control: a native <details> does not close on Escape.
    const page = await menu({ scripts: false });
    await page.keyboard.press("Escape");
    expect((await state(page)).open).toBe(true);
  });
});

describe("the back-to-top button", () => {
  const BUTTON = "[data-back-to-top]";
  const state = (page: Page) =>
    page.evaluate((selector) => {
      const button = document.querySelector<HTMLButtonElement>(selector)!;
      return {
        inert: button.inert,
        scrollY: Math.round(scrollY),
        focus: document.activeElement?.id ?? null,
      };
    }, BUTTON);
  const scrolled = async (options: OpenOptions = {}) => {
    const { page } = await load(POST, options);
    await page.evaluate(() => scrollTo(0, 1500));
    await expect.poll(async () => (await state(page)).inert).toBe(false);
    return page;
  };

  it("is out of reach at the top of the page", async () => {
    const { page } = await load(POST);
    expect(await state(page)).toMatchObject({ inert: true, scrollY: 0 });
    // Inert takes it out of the tab order and away from the pointer.
    expect(
      await page.locator(BUTTON).evaluate((b) => getComputedStyle(b).opacity),
    ).toBe("0");
  });

  it("returns to the top and moves focus to the page's main content", async () => {
    const page = await scrolled();
    await page.click(BUTTON);
    await expect.poll(async () => (await state(page)).scrollY).toBe(0);
    expect(await state(page)).toMatchObject({ focus: "main", inert: true });
  });

  it("glides by default and jumps under reduced motion", async () => {
    // Read in the same task as the click, before a glide could have ended.
    const afterClick = (page: Page) =>
      page.evaluate((selector) => {
        document.querySelector<HTMLButtonElement>(selector)!.click();
        return scrollY;
      }, BUTTON);
    expect(await afterClick(await scrolled())).toBeGreaterThan(0);
    expect(await afterClick(await scrolled({ reducedMotion: true }))).toBe(0);
  });
});

describe("a copy button", () => {
  const FIRST = "button[data-copy] >> nth=0";
  const state = (page: Page) =>
    page.evaluate(() => {
      const button =
        document.querySelector<HTMLButtonElement>("button[data-copy]")!;
      return {
        text: button.textContent,
        name: button.getAttribute("aria-label"),
        status: button.nextElementSibling!.textContent,
        shown: getComputedStyle(button).visibility,
      };
    });
  const IDLE = {
    text: "Copy",
    name: "Copy code",
    status: "",
    shown: "visible",
  };
  const COPIED = {
    text: "Copied",
    name: "Copied code",
    status: "Code copied to clipboard",
  };

  async function withClock() {
    const { page, context } = await load(POST);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install();
    return page;
  }

  it("is shown by the page's script, and hidden with scripts off", async () => {
    const { page } = await load(POST);
    expect(await state(page)).toEqual(IDLE);
    const { page: without } = await load(POST, { scripts: false });
    expect((await state(without)).shown).toBe("hidden");
  });

  it("copies the block's text and says so, in its name and to a screen reader", async () => {
    const page = await withClock();
    await page.click(FIRST);
    await expect.poll(() => state(page)).toMatchObject(COPIED);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'export const greeting = "hello";\n// A comment, the dimmest thing in the block.\n',
    );
  });

  it("reverts two seconds after the last click, not the first", async () => {
    const page = await withClock();
    await page.click(FIRST);
    await expect.poll(() => state(page)).toMatchObject(COPIED);
    await page.clock.runFor(1500);
    await page.click(FIRST);
    // The handler restarts its timer once the clipboard has answered; a read
    // queued behind that write returns after it.
    await page.evaluate(() => navigator.clipboard.readText());
    await page.clock.runFor(1500);
    // Three seconds after the first click, and still inside the second's two.
    expect(await state(page)).toMatchObject(COPIED);
    await page.clock.runFor(600);
    expect(await state(page)).toEqual(IDLE);
  });
});

describe("the contents list", () => {
  // The entry marked as being read, from the list on screen.
  const current = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-toc]")]
        .filter((nav) => nav.getClientRects().length > 0)
        .map((nav) =>
          [...nav.querySelectorAll('a[aria-current="location"]')]
            .map((a) => a.getAttribute("href"))
            .join(","),
        ),
    );
  const scrollToHeading = (page: Page, id: string) =>
    page.evaluate((heading) => {
      document.getElementById(heading)!.scrollIntoView();
    }, id);

  it("is one list at every width, never a duplicate landmark", async () => {
    for (const size of [PHONE, { width: 1280, height: 900 }]) {
      const { page } = await load(POST, size);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      expect(await current(page)).toHaveLength(1);
    }
  });

  it("marks nothing in the lede, then the section being read", async () => {
    const { page } = await load(POST);
    expect(await current(page)).toEqual([""]);
    await scrollToHeading(page, "why-it-is-hard");
    await expect.poll(() => current(page)).toEqual(["#why-it-is-hard"]);
  });

  it("holds a clicked entry through scrolling until the reader takes over", async () => {
    const { page } = await load(POST);
    await page.click('[data-toc] a[href="#the-pictures"] >> visible=true');
    await expect.poll(() => current(page)).toEqual(["#the-pictures"]);
    // A scroll the reader did not make: the clicked entry holds.
    await scrollToHeading(page, "why-it-is-hard");
    await page.waitForTimeout(150);
    expect(await current(page)).toEqual(["#the-pictures"]);
    // The reader's own wheel releases it, and geometry takes over.
    await page.mouse.wheel(0, 10);
    await expect.poll(() => current(page)).toEqual(["#why-it-is-hard"]);
  });

  it("marks a deep-linked heading on load", async () => {
    const { page } = await load(POST, { hash: "#in-closing" });
    await expect.poll(() => current(page)).toEqual(["#in-closing"]);
  });

  it("survives a malformed fragment", async () => {
    const errors: string[] = [];
    const { page } = await load(POST, { hash: "#%" });
    page.on("pageerror", (error) => errors.push(String(error)));
    await scrollToHeading(page, "the-pictures");
    await expect.poll(() => current(page)).toEqual(["#the-pictures"]);
    expect(errors).toEqual([]);
  });
});
