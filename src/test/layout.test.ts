import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { launch, open, type OpenOptions } from "./site";

// Layout, measured in a real browser rather than matched in source: every
// check is a rendered size or position, so a refactor that keeps the page
// keeps this green.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function measure<T>(
  file: string,
  inPage: () => T,
  options: OpenOptions = {},
): Promise<T> {
  const { page, context } = await open(browser, file, options);
  try {
    return await page.evaluate(inPage);
  } finally {
    await context.close();
  }
}

type Cover = { sizes: string; rendered: number; claimed: number };

// Runs in the page. Resolves each `sizes` as the browser would: the first
// matching media condition, its length laid out.
function coversInPage(): Cover[] {
  const resolve = (sizes: string) => {
    for (const part of sizes.split(/,\s*/)) {
      const match = part.match(/^(\(.*?\))\s+(.+)$/);
      if (match && !matchMedia(match[1]).matches) continue;
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;width:${match ? match[2] : part}`;
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    }
    return NaN;
  };
  return [...document.querySelectorAll("main article img[sizes]")].map(
    (img) => ({
      sizes: img.getAttribute("sizes")!,
      rendered: img.getBoundingClientRect().width,
      claimed: resolve(img.getAttribute("sizes")!),
    }),
  );
}

// A claim up to 10% over is the slack a hand-written `sizes` needs. Any
// under is a blurry picture; further over downloads more than is shown.
function wrongClaims(covers: Cover[]): string[] {
  if (covers.length < 6) return ["home rendered no feature card and cards"];
  return covers
    .filter(
      (c) => !(c.claimed >= c.rendered - 1 && c.claimed <= c.rendered * 1.1),
    )
    .map(
      (c) =>
        `renders ${Math.round(c.rendered)}px, sizes claims ${Math.round(c.claimed)}px: ${c.sizes}`,
    );
}

describe("card covers", () => {
  const claims = async (width: number) =>
    wrongClaims(await measure("index.astro", coversInPage, { width }));

  // Each side of every breakpoint the cards change at, and past the frame.
  it.each([375, 767, 768, 1024, 1199, 1200, 1279, 1280, 1440])(
    "claim the width they render at, at %ipx",
    async (width) => {
      expect(await claims(width)).toEqual([]);
    },
    30_000,
  );

  // The author reads at a 20px root, where a border written in rem drifts.
  // Only the root grows here, not the media queries, so widths where the
  // frame is uncapped but xl applies are skipped: no real browser gets there.
  it.each([375, 768, 1024, 1199, 1700, 2000])(
    "claim the width they render at, at %ipx with a 20px root",
    async (width) => {
      const covers = await measure("index.astro", coversInPage, {
        width,
        css: "html{font-size:20px}",
      });
      expect(wrongClaims(covers)).toEqual([]);
    },
    30_000,
  );

  // Known-bad controls: a cover wider than its claim, and narrower.
  it.each([
    ["under", "main article img{max-width:none;width:1400px}"],
    ["over", "main li article{max-width:200px}"],
  ])(
    "would report a claim %s the rendered width",
    async (_name, css) => {
      const covers = await measure("index.astro", coversInPage, {
        width: 1440,
        css,
      });
      expect(wrongClaims(covers)).not.toEqual([]);
    },
    30_000,
  );
});

// Runs in the page. The feature card's cover and text.
function featureInPage() {
  const card = document.querySelector("main article")!;
  const cover = card.querySelector("img")!.getBoundingClientRect();
  const title = card.querySelector("h3")!.getBoundingClientRect();
  return {
    shape: cover.width / cover.height,
    textBelow: title.top >= cover.bottom,
    textBeside: title.left >= cover.right && title.top < cover.bottom,
  };
}

describe("the feature card", () => {
  it.each([
    [375, "below"],
    [1024, "below"],
    [1280, "beside"],
  ])("at %ipx sets its text %s a 3:2 cover", async (width, where) => {
    const feature = await measure("index.astro", featureInPage, { width });
    expect(feature.shape).toBeCloseTo(1.5, 1);
    expect(feature).toMatchObject({
      textBelow: where === "below",
      textBeside: where === "beside",
    });
  });
});

// Runs in the page. Where the reading column sits against its heading.
function columnInPage() {
  const box = (selector: string) =>
    document.querySelector(selector)!.getBoundingClientRect();
  const prose = document.querySelector(".prose")!;
  const style = getComputedStyle(prose);
  return {
    inset: box(".prose p").left - box("h1").left,
    proseMaxWidth: style.maxWidth,
    ink: style.color,
    pageInk: getComputedStyle(document.body).color,
    scrollbar: getComputedStyle(document.documentElement).overflowY,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  };
}

describe.each(["about.astro", "posts/[slug].astro"])(
  "the reading column on %s",
  (file) => {
    it("starts flush with the heading on a phone, where there is no panel", async () => {
      const column = await measure(file, columnInPage, { width: 375 });
      expect(Math.abs(column.inset)).toBeLessThan(0.5);
    });

    it("sits inside its panel from a tablet up", async () => {
      // The panel's edge plus its padding, so well past the edge alone.
      for (const width of [768, 1280]) {
        const column = await measure(file, columnInPage, { width });
        expect(column.inset, `${width}px`).toBeGreaterThan(16);
      }
    });

    it("would report the panel's padding back on a phone, or gone on a tablet", async () => {
      const padded = await measure(file, columnInPage, {
        width: 375,
        css: ".prose{padding-left:1.25rem}",
      });
      expect(Math.abs(padded.inset)).toBeGreaterThan(0.5);
      if (file === "about.astro") {
        const flat = await measure(file, columnInPage, {
          width: 768,
          css: "article{padding-left:0!important}",
        });
        expect(flat.inset).toBeLessThan(16);
      }
    });
  },
);

describe("prose", () => {
  const POST = "posts/[slug].astro";

  it("is set in the page's ink, in both schemes, not the plugin's grey", async () => {
    // The brand colours win only while they are emitted after the typography
    // plugin's defaults, and only the rendered page shows which won.
    for (const dark of [false, true]) {
      const column = await measure(POST, columnInPage, { dark });
      expect(column.ink).toBe(column.pageInk);
    }
  });

  it("is never measured in ch: the width comes from the column around it", async () => {
    // The plugin's own 65ch would resolve to a length here.
    expect((await measure(POST, columnInPage)).proseMaxWidth).toBe("none");
    const plugin = await measure(POST, columnInPage, {
      css: ".prose{max-width:65ch}",
    });
    expect(plugin.proseMaxWidth).toMatch(/px$/);
  });

  it("breaks an unbreakable string rather than widen the page", async () => {
    const phone = { width: 375 };
    expect((await measure(POST, columnInPage, phone)).sideways).toBe(0);
    // Known-bad control: the fixture's long URL, left unbroken.
    const unbroken = await measure(POST, columnInPage, {
      ...phone,
      css: ".prose{overflow-wrap:normal}",
    });
    expect(unbroken.sideways).toBeGreaterThan(0);
  });
});

describe("the page", () => {
  it("keeps the scrollbar's column on a short page, so layouts do not step sideways", async () => {
    expect((await measure("404.astro", columnInPageless)).scrollbar).toBe(
      "scroll",
    );
  });
});

// Runs in the page, on one with no prose.
function columnInPageless() {
  return { scrollbar: getComputedStyle(document.documentElement).overflowY };
}

// Runs in the page. Search's results column and the tag panel beside it.
function searchInPage() {
  const results = document
    .querySelector("main section")!
    .getBoundingClientRect();
  const panel = document.querySelector("main aside")!.getBoundingClientRect();
  return {
    resultsWidth: results.width,
    beside: panel.left >= results.right && panel.top < results.bottom,
    below: panel.top >= results.bottom,
  };
}

describe("the search page", () => {
  it("sets the tag panel beside a results column of at most 720px on a wide screen", async () => {
    const search = await measure("search.astro", searchInPage, { width: 1280 });
    expect(search).toMatchObject({ beside: true, below: false });
    expect(search.resultsWidth).toBeLessThanOrEqual(720);
  });

  it("sets the tag panel below the results on a phone", async () => {
    const search = await measure("search.astro", searchInPage, { width: 375 });
    expect(search).toMatchObject({ beside: false, below: true });
  });
});

// Runs in the page. The gap between a wide page's header and its content.
function rhythmInPage() {
  const header = document.querySelector("main header")!.getBoundingClientRect();
  const next = document
    .querySelector("main header + div > *")!
    .getBoundingClientRect();
  return Math.round(next.top - header.bottom);
}

describe("the listing rhythm", () => {
  it.each([375, 1280])(
    "puts the archive and the tags index the same distance below their header, at %ipx",
    async (width) => {
      const archive = await measure("archive.astro", rhythmInPage, { width });
      const tags = await measure("tags/index.astro", rhythmInPage, { width });
      expect(archive).toBeGreaterThan(0);
      expect(tags).toBe(archive);
    },
  );

  it("would report content pushed flush against the header", async () => {
    const flush = await measure("archive.astro", rhythmInPage, {
      css: "main header{margin-bottom:0!important}",
    });
    expect(flush).toBe(0);
  });
});

// Runs in the page. The pressed chip's fill, which the dots must not show
// through.
function pressedFillInPage() {
  const chip = document.querySelector("[data-strands] [aria-current]")!;
  return getComputedStyle(chip).backgroundColor;
}
const opaque = (colour: string) =>
  !/rgba\(.*,\s*0(\.\d+)?\)$|transparent|\/\s*0?\.\d+\)$/.test(colour);

describe("a pressed chip", () => {
  it.each([false, true])("is opaque, dark scheme %s", async (dark) => {
    for (const file of ["index.astro", "categories/[slug].astro"]) {
      const fill = await measure(file, pressedFillInPage, { dark });
      expect(opaque(fill), `${file}: ${fill}`).toBe(true);
    }
  });

  it("would report a see-through fill", () => {
    expect(opaque("rgba(36, 27, 29, 0.05)")).toBe(false);
    expect(opaque("oklab(0.2 0.01 0 / 0.05)")).toBe(false);
    expect(opaque("rgb(250, 245, 241)")).toBe(true);
  });
});

// Runs in the page. What a targeted element's arrival animation changes.
function arrivalInPage(): string[] {
  const target = document.querySelector(":target")!;
  return target
    .getAnimations()
    .flatMap((animation) =>
      (animation.effect as KeyframeEffect)
        .getKeyframes()
        .flatMap((frame) => Object.keys(frame)),
    )
    .filter(
      (key) =>
        !["offset", "easing", "composite", "computedOffset"].includes(key),
    );
}

describe("the cover prompt's arrival cue", () => {
  // A ring only: a background flash would wash out the ink fill.
  it.each([false, true])(
    "animates a ring and no background, dark scheme %s",
    async (dark) => {
      const changed = await measure("posts/[slug].astro", arrivalInPage, {
        hash: "#cover-prompt",
        dark,
      });
      expect(changed).toContain("boxShadow");
      expect(changed).not.toContain("backgroundColor");
    },
  );

  it("would catch the heading flash, which does animate one", async () => {
    const changed = await measure("posts/[slug].astro", arrivalInPage, {
      hash: "#what-is-a-building-block",
    });
    expect(changed).toContain("backgroundColor");
  });

  it("does not move under reduced motion", async () => {
    const changed = await measure("posts/[slug].astro", arrivalInPage, {
      hash: "#cover-prompt",
      reducedMotion: true,
    });
    expect(changed).toEqual([]);
  });
});
