import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Browser, Page } from "playwright-core";
import {
  AXE,
  launch,
  open,
  PAGE_FILES,
  ROUTES,
  type OpenOptions,
} from "./site";

// Every page the site has, audited in a real browser: axe with nothing
// switched off, in light, dark and on a phone, then the checks axe has no
// rule for. The pages come from src/pages, so a new one is covered or fails.

vi.mock("../lib/api", async () => (await import("./fixtures")).api);

type Violation = { id: string; help: string; nodes: string[] };

interface Report {
  violations: Violation[];
  lang: string | null;
  mainText: number;
  headings: number[];
  duplicates: string[];
  strayMono: string[];
  /** How far the document scrolls sideways, in px. */
  overflow: number;
}

// Runs in the page, so it closes over nothing.
async function audit(): Promise<Report> {
  const axe = (
    window as unknown as {
      axe: {
        run: (
          root: Document,
          options: object,
        ) => Promise<{
          violations: {
            id: string;
            help: string;
            nodes: { html: string }[];
          }[];
        }>;
      };
    }
  ).axe;
  const { violations } = await axe.run(document, {
    resultTypes: ["violations"],
  });

  const visible = (el: Element) => el.getClientRects().length > 0;
  const main = document.querySelector("main");

  // Links in <main> that share a destination and an accessible name. axe has
  // no rule for it: both links are perfectly labelled, which is the problem.
  const seen = new Map<string, number>();
  for (const link of main?.querySelectorAll("a[href]") ?? []) {
    if (!visible(link) || link.closest('[aria-hidden="true"]')) continue;
    const name = (link.getAttribute("aria-label") ?? link.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const key = `${link.getAttribute("href")} "${name}"`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  // Mono is for // labels and machine text only.
  const strayMono = [...document.querySelectorAll(".font-mono")]
    .filter((el) => visible(el) && !el.closest("pre, code, figure"))
    .map((el) => (el.textContent ?? "").trim())
    .filter((text) => !text.startsWith("//") && !/^cop(y|ied)/i.test(text));

  const root = document.documentElement;
  return {
    violations: violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)),
    })),
    lang: root.getAttribute("lang"),
    mainText: (main?.textContent ?? "").trim().length,
    headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter(visible)
      .map((h) => Number(h.tagName[1])),
    duplicates: [...seen].filter(([, n]) => n > 1).map(([key]) => key),
    strayMono,
    overflow: root.scrollWidth - root.clientWidth,
  };
}

// axe cannot judge text over a background image, and reports nothing rather
// than a failure. The page's dots are decoration, so every pass drops them
// and the text is measured against the page colour underneath.
const NO_DOTS = "body{background-image:none}";

const PASSES = {
  desktop: { css: NO_DOTS },
  dark: { css: NO_DOTS, dark: true },
  phone: { css: NO_DOTS, width: 375, height: 800, touch: true },
} satisfies Record<string, OpenOptions>;
type Pass = keyof typeof PASSES;

let browser: Browser;
const reports = new Map<string, Report>();

async function report(
  file: string,
  options: OpenOptions,
  plant?: (page: Page) => Promise<unknown>,
): Promise<Report> {
  const { page, context } = await open(browser, file, options);
  try {
    await plant?.(page);
    await page.addScriptTag({ content: AXE });
    return await page.evaluate(audit);
  } finally {
    await context.close();
  }
}

beforeAll(async () => {
  browser = await launch();
  // Every page in every pass, a few at a time.
  const jobs = Object.keys(ROUTES).flatMap((file) =>
    (Object.keys(PASSES) as Pass[]).map((pass) => async () => {
      reports.set(`${file} ${pass}`, await report(file, PASSES[pass]));
    }),
  );
  const workers = Array.from({ length: 4 }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) await job();
  });
  await Promise.all(workers);
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const describeViolations = (violations: Violation[]) =>
  violations
    .map((v) => `[${v.id}] ${v.help}\n${v.nodes.join("\n")}`)
    .join("\n\n");

/** Heading levels that skip one on the way down, as "h2 to h4". */
function skippedLevels(levels: number[]): string[] {
  return levels.flatMap((level, i) =>
    i > 0 && level > levels[i - 1] + 1
      ? [`h${levels[i - 1]} to h${level}`]
      : [],
  );
}

it("covers every page in src/pages", () => {
  // A page added to the site and not to ROUTES would be audited nowhere.
  expect(Object.keys(ROUTES).sort()).toEqual([...PAGE_FILES].sort());
});

// Rows repeat their strand's link by design: each row files its own post.
const ROW_STRAND = /^\/categories\//;
const PAGES_WITH_ROWS = [
  "archive.astro",
  "tags/[slug].astro",
  "authors/[slug].astro",
];

describe.each(Object.keys(ROUTES))("%s", (file) => {
  const at = (pass: Pass) => reports.get(`${file} ${pass}`)!;

  it.each(Object.keys(PASSES) as Pass[])(
    "has no axe violations, %s",
    (pass) => {
      const { violations } = at(pass);
      expect(violations, describeViolations(violations)).toEqual([]);
    },
  );

  it("renders something for axe to have audited", () => {
    // An empty page passes every rule, and a fixture out of step with a page
    // is the likeliest way to get one.
    const { mainText, headings, lang } = at("desktop");
    expect(mainText).toBeGreaterThan(100);
    expect(headings.filter((level) => level === 1)).toHaveLength(1);
    expect(lang).toBe("en-GB");
  });

  it("keeps heading levels contiguous", () => {
    expect(skippedLevels(at("desktop").headings)).toEqual([]);
    expect(skippedLevels(at("phone").headings)).toEqual([]);
  });

  it("announces each destination at most once", () => {
    const { duplicates } = at("desktop");
    const rows = PAGES_WITH_ROWS.includes(file);
    const unexpected = rows
      ? duplicates.filter((d) => !ROW_STRAND.test(d))
      : duplicates;
    expect(unexpected).toEqual([]);
    // The allowance has to keep earning itself, or it excuses a later defect.
    if (rows) expect(duplicates.some((d) => ROW_STRAND.test(d))).toBe(true);
  });

  it("sets nothing in mono but // labels and code", () => {
    expect(at("desktop").strayMono).toEqual([]);
  });

  it("never scrolls sideways on a phone", () => {
    expect(at("phone").overflow).toBeLessThanOrEqual(0);
  });
});

describe("the audit can fail", () => {
  // Known-bad controls: each check above, given the defect it exists for.
  const plant = (html: string) => (page: Page) =>
    page.evaluate((markup) => {
      document.querySelector("main")!.insertAdjacentHTML("afterbegin", markup);
    }, html);

  it("reports an unnamed button and unreadable text through axe", async () => {
    const { violations } = await report(
      "index.astro",
      PASSES.desktop,
      plant(
        '<button type="button"></button><p style="color:#fbf7f3">Cream on cream.</p>',
      ),
    );
    const ids = violations.map((v) => v.id);
    expect(ids).toContain("button-name");
    expect(ids).toContain("color-contrast");
  });

  it("reports text that passes in light and fails in dark", async () => {
    const ink = '<p style="color:#241b1d">The light ink, pinned.</p>';
    const light = await report("index.astro", PASSES.desktop, plant(ink));
    const dark = await report("index.astro", PASSES.dark, plant(ink));
    expect(light.violations.map((v) => v.id)).not.toContain("color-contrast");
    expect(dark.violations.map((v) => v.id)).toContain("color-contrast");
  });

  it("reports a repeated link, a mono link and a wide page", async () => {
    const found = await report(
      "index.astro",
      PASSES.phone,
      plant(
        '<a href="/archive">Twice</a> <a href="/archive">Twice</a><a class="font-mono" href="/tags">/tags</a><div style="width:600px">Wide</div>',
      ),
    );
    expect(found.duplicates).toEqual(['/archive "Twice"']);
    expect(found.strayMono).toEqual(["/tags"]);
    expect(found.overflow).toBeGreaterThan(0);
  });

  it("would miss unreadable text if the page kept its dots", async () => {
    // Why NO_DOTS exists. If this starts failing, axe has learned to see
    // through a background image and the override can go.
    const { violations } = await report(
      "index.astro",
      {},
      plant('<p style="color:#fbf7f3">Cream on cream.</p>'),
    );
    expect(violations.map((v) => v.id)).not.toContain("color-contrast");
  });

  it("reports a skipped heading level", () => {
    expect(skippedLevels([1, 2, 4, 2, 3])).toEqual(["h2 to h4"]);
  });
});
