import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser, Page } from "playwright-core";
import { GERMAN_SLUGS, POSTS } from "./fixtures";
import { PAGE_IDS } from "../lib/headings";
import { launch, open, renderRoute, type OpenOptions } from "./site";

// What each page shape holds, read from the rendered page in a real browser:
// how many cards and rows, which pages carry a trail, what the search index
// is told, and which language each part is marked as.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function on<T>(
  file: string,
  read: (page: Page) => Promise<T>,
  options: OpenOptions = {},
): Promise<T> {
  const { page, context } = await open(browser, file, options);
  try {
    return await read(page);
  } finally {
    await context.close();
  }
}

// Runs in the page. A listing's shape: its cards, rows, labels and trail.
function listing() {
  const main = document.querySelector("main")!;
  const text = (el: Element | null) =>
    (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const shown = (el: Element) => el.getClientRects().length > 0;
  return {
    cards: main.querySelectorAll("article").length,
    rows: main.querySelectorAll("li > span > a[href^='/posts/']").length,
    labels: [...main.querySelectorAll("section > h2, section > p")]
      .map(text)
      .filter((label) => label.startsWith("//")),
    trail: text(main.querySelector('nav[aria-label="Breadcrumb"]')),
    h1: [...document.querySelectorAll("h1")].map((h) => ({
      text: text(h),
      // An sr-only heading is a 1px box.
      visible: h.getBoundingClientRect().width > 1,
    })),
    pressed: [...document.querySelectorAll("[data-strands] [aria-current]")]
      .filter(shown)
      .map((chip) => `${text(chip)}=${chip.getAttribute("aria-current")}`),
    pagers: document.querySelectorAll('nav[aria-label="Pagination"]').length,
    lastLink: text([...main.querySelectorAll("a")].at(-1) ?? null),
    german: [...main.querySelectorAll("a[href^='/de/posts/']")].map((a) => ({
      href: a.getAttribute("href"),
      hreflang: a.getAttribute("hreflang"),
      lang: a.getAttribute("lang"),
      text: text(a),
    })),
  };
}

describe("home", () => {
  it("shows the feature card and five cards, then stops at the archive", async () => {
    const home = await on("index.astro", (page) => page.evaluate(listing));
    expect(home.cards).toBe(6);
    expect(home.rows).toBe(0);
    expect(home.labels).toEqual(["// latest post", "// previous posts"]);
    expect(home.pagers).toBe(0);
    expect(home.lastLink).toBe("Every post, in the archive");
  });

  it("presses the All chip alone, names itself in a hidden h1 and has no trail", async () => {
    const home = await on("index.astro", (page) => page.evaluate(listing));
    expect(home.pressed).toEqual(["All=page"]);
    expect(home.h1).toEqual([{ text: "Be Useful.", visible: false }]);
    expect(home.trail).toBe("");
  });
});

describe("a strand page", () => {
  it("presses its own chip and shows only its posts, six as cards and the rest as rows", async () => {
    const strand = await on("categories/[slug].astro", (page) =>
      page.evaluate(listing),
    );
    const mine = POSTS.filter((post) => post.category?.slug === "blogging");
    expect(strand.pressed).toEqual(["Blogging=page"]);
    expect(strand.cards).toBe(6);
    expect(strand.rows).toBe(mine.length - 6);
    expect(strand.rows).toBeGreaterThan(0);
    expect(strand.labels).toContain("// older posts");
    expect(strand.h1).toEqual([{ text: "Blogging", visible: false }]);
    expect(strand.trail).toBe("");
    expect(strand.pagers).toBe(0);
  });
});

describe("tag and author pages", () => {
  it.each([
    ["tags/[slug].astro", "Home›Tags›Design", "#Design", 8],
    ["authors/[slug].astro", "Home›Bulent Yusuf", "Bulent Yusuf", 9],
  ])(
    "%s lists every post under a trail and one visible h1",
    async (file, trail, heading, posts) => {
      const page = await on(file, (p) => p.evaluate(listing));
      expect(page.trail).toBe(trail);
      expect(page.h1.map((h) => h.visible)).toEqual([true]);
      expect(page.h1[0].text).toBe(heading);
      expect(page.cards + page.rows).toBe(posts);
      expect(page.cards).toBe(6);
      expect(page.pagers).toBe(0);
      expect(page.pressed).toEqual([]);
    },
  );
});

describe("the archive", () => {
  it("links a translated post's German page, and only that post's", async () => {
    const archive = await on("archive.astro", (page) => page.evaluate(listing));
    expect(archive.rows).toBe(POSTS.length);
    expect(archive.german).toEqual(
      GERMAN_SLUGS.map((slug) => ({
        href: `/de/posts/${slug}`,
        hreflang: "de-DE",
        lang: "de-DE",
        // The visible "DE" sits inside the accessible name.
        text: "Auf Deutsch lesen, DE",
      })),
    );
  });
});

describe("a wide page", () => {
  it.each(["archive.astro", "tags/index.astro", "search.astro"])(
    "%s has a trail and a header holding the heading alone",
    async (file) => {
      const header = await on(file, (page) =>
        page.evaluate(() => {
          const header = document.querySelector("main header")!;
          return {
            children: [...header.children].map((el) => el.tagName),
            trail: !!document.querySelector(
              'main nav[aria-label="Breadcrumb"]',
            ),
            // No rule under the header either.
            border: getComputedStyle(header).borderBottomWidth,
          };
        }),
      );
      expect(header).toEqual({ children: ["H1"], trail: true, border: "0px" });
    },
  );
});

describe("a narrow page", () => {
  it.each(["about.astro", "privacy.astro"])(
    "%s sets trail, heading and text in one centred 49.25rem column",
    async (file) => {
      const column = await on(file, (page) =>
        page.evaluate(() => {
          const box = (selector: string) =>
            document.querySelector(`main ${selector}`)!.getBoundingClientRect();
          const [trail, h1, article] = ["nav", "h1", "article"].map(box);
          return {
            width: article.width,
            lefts: [trail.left, h1.left, article.left],
            centred: Math.abs(
              article.left + article.width / 2 - window.innerWidth / 2,
            ),
          };
        }),
      );
      expect(column.width).toBe(49.25 * 16);
      expect(new Set(column.lefts).size).toBe(1);
      // Within the scrollbar's width of the middle.
      expect(column.centred).toBeLessThan(10);
    },
  );
});

// Runs in the page. Everything a post page promises around its body.
function postPage() {
  const text = (el: Element | null) =>
    (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const all = (selector: string) => [...document.querySelectorAll(selector)];
  const article = document.querySelector("main article");
  const more = all("main h2, main section > p").find((el) =>
    text(el).endsWith("more like this"),
  );
  const bios = document.querySelector('[role="region"][aria-label^="About"]');
  const language = document.querySelector("main header a[hreflang]");
  return {
    trail: all('nav[aria-label="Breadcrumb"]').length,
    pressed: all("[data-strands] [aria-current]").map(
      (chip) => `${text(chip)}=${chip.getAttribute("aria-current")}`,
    ),
    moreCards: more?.closest("section")?.querySelectorAll("article").length,
    indexed: all("[data-pagefind-body]").map((el) => el.tagName),
    meta: article?.getAttribute("data-pagefind-meta"),
    url: article?.getAttribute("data-url"),
    date: article?.getAttribute("data-date"),
    strand: article?.getAttribute("data-strand"),
    fill: article?.getAttribute("data-strand-fill"),
    h1Lang: document.querySelector("h1")!.getAttribute("lang"),
    proseLang: document.querySelector(".prose")!.getAttribute("lang"),
    tocLangs: all("[data-toc] ul").map((ul) => ul.getAttribute("lang")),
    shownDate: text(document.querySelector("main header time")),
    byline: text(document.querySelector("main header p.font-\\[800\\]")),
    bylineLinks: all("main header p a[href^='/authors/']").map((a) =>
      a.getAttribute("href"),
    ),
    bios: bios && {
      label: bios.getAttribute("aria-label"),
      ignored: bios.hasAttribute("data-pagefind-ignore"),
      names: [...bios.querySelectorAll("p.font-ui")].map(text),
      lang: bios.closest("[lang]")?.getAttribute("lang"),
    },
    language: language && {
      text: text(language),
      href: language.getAttribute("href"),
      lang: language.getAttribute("lang"),
      hreflang: language.getAttribute("hreflang"),
      icon: language.querySelector("svg")?.getAttribute("aria-hidden"),
      ignored: !!language.closest("[data-pagefind-ignore]"),
    },
    figures: all(".prose figure:has(img[data-lightbox])").map((figure) => ({
      alt: figure.querySelector("img")!.alt,
      caption: text(figure.querySelector("figcaption")),
      lang: figure.getAttribute("lang"),
    })),
    headerScopes: all(".prose th").map((th) => th.getAttribute("scope")),
    regions: all('.prose [role="region"]').map((region) => ({
      name: region.getAttribute("aria-label"),
      tabindex: region.getAttribute("tabindex"),
    })),
    prompt: (() => {
      const figure = document.querySelector("#cover-prompt");
      const caption = figure?.querySelector("figcaption");
      return {
        captionIsChild: caption?.parentElement === figure,
        label: text(caption?.querySelector("span") ?? null),
        lang: figure?.getAttribute("lang"),
      };
    })(),
  };
}

describe("an English post", () => {
  let post: ReturnType<typeof postPage>;
  beforeAll(async () => {
    post = await on("posts/[slug].astro", (page) => page.evaluate(postPage));
  }, 60_000);

  it("carries no trail, presses its strand and ends on two cards", () => {
    expect(post.trail).toBe(0);
    // "true", not "page": the chip links away from the post.
    expect(post.pressed).toEqual(["Blogging=true"]);
    expect(post.moreCards).toBe(2);
  });

  it("indexes its title and article, with the strand and an en-GB date", () => {
    expect(post.indexed).toEqual(["H1", "ARTICLE"]);
    expect(post.meta).toBe(
      "url[data-url], date[data-date], strand[data-strand], strandfill[data-strand-fill]",
    );
    expect(post.url).toBe("/posts/first-post");
    expect(post.date).toBe("2 March 2026");
    expect(post.strand).toBe("Blogging");
    expect(post.fill).toBe("bg-strand-blogging");
  });

  it("credits both authors, each linked, joined by an ampersand", () => {
    expect(post.byline).toBe("Bulent Yusuf & Genial Yeti");
    expect(post.bylineLinks).toEqual([
      "/authors/bulent-yusuf",
      "/authors/genial-yeti",
    ]);
  });

  it("keeps the authors' bios out of the search index, named in the plural", () => {
    expect(post.bios).toMatchObject({
      label: "About the authors",
      ignored: true,
      names: ["Bulent Yusuf", "Genial Yeti"],
    });
  });

  it("points at the German version, marked as German and out of the index", () => {
    expect(post.language).toEqual({
      text: "Auch auf Deutsch lesen",
      href: "/de/posts/first-post",
      lang: "de-DE",
      hreflang: "de-DE",
      icon: "true",
      ignored: true,
    });
  });

  it("gives each figure one description: a caption never repeats the alt", () => {
    expect(post.figures).toHaveLength(3);
    for (const figure of post.figures) {
      expect(figure.alt).not.toBe("");
      expect(figure.caption).not.toBe(figure.alt);
    }
  });

  it("scopes every header cell and names each scroll region apart", () => {
    expect(post.headerScopes).toEqual(["col", "col", "col"]);
    const names = post.regions.map((region) => region.name);
    expect(names).toEqual(["src/lib/example.ts", "Code block 2", "Table 1"]);
    expect(post.regions.every((region) => region.tabindex === "0")).toBe(true);
  });

  it("marks neither its title nor its contents list with a language", () => {
    expect(post.h1Lang).toBeNull();
    expect(post.tocLangs).toEqual([null, null]);
  });

  it("labels the cover's prompt from its figcaption, in English", () => {
    expect(post.prompt).toEqual({
      captionIsChild: true,
      label: "The prompt behind this cover",
      lang: "en-GB",
    });
  });
});

describe("a German post", () => {
  let post: ReturnType<typeof postPage>;
  beforeAll(async () => {
    post = await on("de/posts/[slug].astro", (page) => page.evaluate(postPage));
  }, 60_000);

  it("is kept out of the search index entirely", () => {
    expect(post.indexed).toEqual([]);
    expect(post.meta).toBeNull();
  });

  it("marks the article German and leaves the site around it English", () => {
    expect(post.h1Lang).toBe("de-DE");
    expect(post.proseLang).toBe("de-DE");
    expect(post.tocLangs).toEqual(["de-DE", "de-DE"]);
    expect(post.shownDate).toBe("2. März 2026");
    // The bios sit outside any German region.
    expect(post.bios?.lang).toBe("en-GB");
    // Untranslated pictures stay English inside the German article.
    expect(post.figures.map((figure) => figure.lang)).toEqual([
      "en-GB",
      "en-GB",
      "en-GB",
    ]);
  });

  it("points back at the English version, marked as English", () => {
    expect(post.language).toMatchObject({
      text: "Read in English",
      href: "/posts/first-post",
      lang: "en-GB",
      hreflang: "en-GB",
    });
  });
});

describe("the search page", () => {
  it("says why search is missing without scripts, and offers the archive", async () => {
    const notice = await on(
      "search.astro",
      (page) =>
        page.evaluate(() => {
          // With scripts off the noscript's content is real markup.
          const note = document.querySelector("main noscript")!;
          return {
            text: note.textContent,
            archive: !!note.querySelector('a[href="/archive"]'),
            beforeSearch: !!(
              note.compareDocumentPosition(
                document.querySelector(".pagefind-scope")!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
          };
        }),
      { scripts: false },
    );
    expect(notice.text).toMatch(/Search needs JavaScript/);
    expect(notice).toMatchObject({ archive: true, beforeSearch: true });
  });

  it("hides its emblem once a query is typed, and keeps the tags", async () => {
    // Pagefind's input is stood in for by a plain one: the rule reads only
    // whether an input in the scope shows its placeholder.
    const shown = await on(
      "search.astro",
      async (page) => {
        await page.evaluate(() => {
          document
            .querySelector(".pagefind-scope")!
            .insertAdjacentHTML("afterbegin", '<input placeholder="Search">');
        });
        const visible = () =>
          page.evaluate(() => ({
            emblem:
              document.querySelector(".search-empty")!.getClientRects().length >
              0,
            tags:
              document.querySelector("#tag-entry-label")!.getClientRects()
                .length > 0,
          }));
        const before = await visible();
        await page.fill(".pagefind-scope input", "amiga");
        return { before, after: await visible() };
      },
      {
        // An empty stand-in, or the page reports search as unavailable.
        files: new Map([
          [
            "/pagefind/pagefind-component-ui.js",
            { body: "", type: "text/javascript" },
          ],
        ]),
      },
    );
    expect(shown).toEqual({
      before: { emblem: true, tags: true },
      after: { emblem: false, tags: true },
    });
  });

  it("offers every tag with a page, named by the visible label", async () => {
    const tags = await on("search.astro", (page) =>
      page.evaluate(() => {
        const label = document.querySelector("#tag-entry-label")!;
        const list = document.querySelector(
          'main ul[aria-labelledby="tag-entry-label"]',
        )!;
        return {
          label: label.textContent!.trim(),
          links: [...list.querySelectorAll("a")].map((a) =>
            a.getAttribute("href"),
          ),
          ariaLabel: list.getAttribute("aria-label"),
          // Outside the emblem's box, so it stays while searching.
          insideEmpty: !!list.closest(".search-empty"),
        };
      }),
    );
    expect(tags).toEqual({
      label: "Or start from a tag",
      // Lonely is on one post, below the threshold.
      links: ["/tags/design", "/tags/retro"],
      ariaLabel: null,
      insideEmpty: false,
    });
  });
});

describe("Pagefind's script and styles", () => {
  const PAGEFIND = /\/pagefind\//;

  it("load on /search and nowhere else", async () => {
    const asked = async (file: string) => {
      const { page, context, requests } = await open(browser, file);
      await page.waitForTimeout(100);
      await context.close();
      return requests.filter((url) => PAGEFIND.test(url));
    };
    expect(await asked("search.astro")).toEqual([
      "https://beuseful.net/pagefind/pagefind-component-ui.css",
      "https://beuseful.net/pagefind/pagefind-component-ui.js",
    ]);
    for (const file of [
      "index.astro",
      "posts/[slug].astro",
      "tags/index.astro",
    ]) {
      expect(await asked(file), file).toEqual([]);
    }
  });

  it("keep /search and the 404 page out of search engines", async () => {
    const robots = (html: string) =>
      /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
    expect(robots(await renderRoute("search.astro"))).toBe("noindex");
    expect(robots(await renderRoute("404.astro"))).toBe("noindex");
    expect(robots(await renderRoute("index.astro"))).toBeUndefined();
  });
});

describe("fonts", () => {
  const preloads = (html: string) =>
    [...html.matchAll(/<link rel="preload"[^>]*as="font"[^>]*>/g)].map(
      (m) => m[0],
    );
  const italicPreloads = (html: string) =>
    preloads(html).filter((link) => /italic/.test(link));

  it("preload the upright faces and never the italic", async () => {
    const html = await renderRoute("index.astro");
    expect(preloads(html).length).toBeGreaterThanOrEqual(3);
    expect(italicPreloads(html)).toEqual([]);
    // The italic is declared, so there is one to leave out.
    expect(html).toMatch(/font-style:\s*italic/);
  });

  it("would catch the italic being preloaded", () => {
    expect(
      italicPreloads(
        '<link rel="preload" href="/_astro/fonts/font-literata-200-900-italic-0.woff2" as="font" type="font/woff2" crossorigin>',
      ),
    ).toHaveLength(1);
  });

  // The subset is chosen by file name in the config, so it is read there.
  const fontFiles = (config: string) =>
    [...config.matchAll(/[\w-]+\.woff2/g)].map((m) => m[0]);
  const beyondLatin = (config: string) =>
    fontFiles(config).filter((file) => !/latin-(?!ext)/.test(file));

  it("are the Latin subset only", () => {
    const config = fs
      .readFileSync("astro.config.ts", "utf8")
      // The mono files are named through this prefix.
      .replaceAll("${plexMono}", "ibm-plex-mono-latin");
    expect(fontFiles(config).length).toBeGreaterThanOrEqual(5);
    expect(beyondLatin(config)).toEqual([]);
  });

  it("would catch latin-ext, or a file with no subset", () => {
    expect(
      beyondLatin("literata-latin-ext-opsz-normal.woff2 literata.woff2"),
    ).toEqual(["literata-latin-ext-opsz-normal.woff2", "literata.woff2"]);
  });
});

describe("a post page's own ids", () => {
  // Read from the page so PAGE_IDS cannot fall behind a new id. A callout's
  // id carries a Contentful entry id, which no heading slug can match.
  const own = (html: string) =>
    [...html.matchAll(/<(\w+)\b[^>]*\sid="([^"]+)"/g)]
      .filter(([, tag, id]) => tag !== "h2" && !id.startsWith("callout-"))
      .map(([, , id]) => id);

  it.each(["posts/[slug].astro", "de/posts/[slug].astro"])(
    "are all reserved from heading slugs, on %s",
    async (file) => {
      const ids = own(await renderRoute(file));
      expect(ids.length).toBeGreaterThan(1);
      expect(ids.filter((id) => !PAGE_IDS.includes(id))).toEqual([]);
    },
  );

  it("would catch an id missing from the list", () => {
    const html = '<main id="main"></main><nav id="toc"></nav>';
    expect(own(html).filter((id) => !PAGE_IDS.includes(id))).toEqual(["toc"]);
  });
});

describe("a page's link preview", () => {
  const meta = (html: string, key: string) =>
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`)
      .exec(html)?.[1]
      ?.replaceAll("&amp;", "&");
  const preview = (html: string) => ({
    image: meta(html, "og:image"),
    alt: meta(html, "og:image:alt"),
    width: meta(html, "og:image:width"),
    height: meta(html, "og:image:height"),
    card: meta(html, "twitter:card"),
  });

  it.each([
    "index.astro",
    "posts/[slug].astro",
    "de/posts/[slug].astro",
    "authors/[slug].astro",
    "about.astro",
  ])("names its picture, with its size, on %s", async (file) => {
    const card = preview(await renderRoute(file));
    expect(card.image).toMatch(/^https:\/\//);
    expect(card.alt).toBeTruthy();
    expect(Number(card.width)).toBeGreaterThan(0);
    expect(Number(card.height)).toBeGreaterThan(0);
  });

  it("shows an author's portrait as a small square card, resized", async () => {
    const card = preview(await renderRoute("authors/[slug].astro"));
    expect(card).toMatchObject({
      card: "summary",
      width: "600",
      height: "600",
    });
    expect(card.image).toContain("w=600&h=600");
  });

  it("would catch a picture with no alt text", () => {
    const bare = '<meta property="og:image" content="https://a.example/x.jpg">';
    expect(preview(bare).alt).toBeUndefined();
  });
});
