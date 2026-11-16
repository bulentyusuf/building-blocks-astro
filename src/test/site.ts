import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { build } from "vite";
import siteCss from "../styles/global.css?inline";
import { SITE_URL } from "../lib/constants";

// The site in a real browser, with no build and no Contentful. Each page is
// rendered by Astro from the fixtures, then loaded into Chromium with the
// compiled stylesheet and the components' own scripts. Web fonts are not
// served, so text is set in each face's metric-matched fallback.

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Every page in src/pages, with the address and parameters it renders at. */
export const ROUTES: Record<string, { path: string; slug?: string }> = {
  "index.astro": { path: "/" },
  "404.astro": { path: "/404" },
  "about.astro": { path: "/about" },
  "privacy.astro": { path: "/privacy" },
  "archive.astro": { path: "/archive" },
  "search.astro": { path: "/search" },
  "tags/index.astro": { path: "/tags" },
  "tags/[slug].astro": { path: "/tags/design", slug: "design" },
  "authors/[slug].astro": {
    path: "/authors/bulent-yusuf",
    slug: "bulent-yusuf",
  },
  "categories/[slug].astro": { path: "/categories/blogging", slug: "blogging" },
  "posts/[slug].astro": { path: "/posts/first-post", slug: "first-post" },
  "de/posts/[slug].astro": { path: "/de/posts/first-post", slug: "first-post" },
  "preview/posts/[slug].astro": {
    path: "/preview/posts/first-post",
    slug: "first-post",
  },
  "preview/de/posts/[slug].astro": {
    path: "/preview/de/posts/first-post",
    slug: "first-post",
  },
  "preview/pages/[slug].astro": { path: "/preview/pages/about", slug: "about" },
};

const pages = import.meta.glob<{ default: unknown }>("../pages/**/*.astro");

/** The page files on disk, as ROUTES keys them. */
export const PAGE_FILES = Object.keys(pages).map((file) =>
  file.replace("../pages/", ""),
);

let container: Promise<AstroContainer> | undefined;

/** A page's whole document, rendered from the fixtures. */
export async function renderRoute(file: string): Promise<string> {
  const route = ROUTES[file];
  if (!route) throw new Error(`No entry in ROUTES for src/pages/${file}.`);
  container ??= AstroContainer.create();
  const page = await pages[`../pages/${file}`]();
  const html = await (
    await container
  ).renderToString(page.default as never, {
    request: new Request(`${SITE_URL}${route.path}`),
    params: route.slug ? { slug: route.slug } : {},
    partial: false,
  });
  return inlineScripts(html);
}

// A component's <script>, as Astro numbers them: the plain ones, in order.
const COMPONENT_SCRIPT =
  /<script type="module" src="([^"]+\.astro)\?astro&(?:amp;)?type=script&(?:amp;)?index=(\d+)&(?:amp;)?lang\.ts"><\/script>/g;

const bundles = new Map<string, Promise<string>>();

function bundle(file: string, index: number): Promise<string> {
  const key = `${file}#${index}`;
  let bundled = bundles.get(key);
  if (!bundled) {
    const source = [
      ...fs
        .readFileSync(file, "utf8")
        .matchAll(/<script>([\s\S]*?)<\/script>/g),
    ][index]?.[1];
    if (source === undefined) throw new Error(`No script ${index} in ${file}.`);
    const entry = path.join(path.dirname(file), `__script-${index}.ts`);
    bundled = build({
      configFile: false,
      logLevel: "silent",
      root: SRC,
      plugins: [
        {
          name: "component-script",
          resolveId: (id) => (id === entry ? entry : undefined),
          load: (id) => (id === entry ? source : undefined),
        },
      ],
      build: {
        write: false,
        minify: false,
        rollupOptions: { input: entry, output: { format: "es" } },
      },
    }).then((result) => {
      const [{ output }] = Array.isArray(result) ? result : [result as never];
      return (output as { code?: string }[]).map((o) => o.code ?? "").join("");
    });
    bundles.set(key, bundled);
  }
  return bundled;
}

// The container leaves each component script as a dev-server address. Bundle
// it from the component's source and write it into the page.
async function inlineScripts(html: string): Promise<string> {
  const found = [...html.matchAll(COMPONENT_SCRIPT)];
  const code = await Promise.all(
    found.map(([, file, index]) => bundle(file, Number(index))),
  );
  let i = 0;
  return html.replace(
    COMPONENT_SCRIPT,
    () =>
      `<script type="module">${code[i++].replace(/<\/script/g, "<\\/script")}</script>`,
  );
}

// search.astro's own global styles, which the container does not emit.
const searchCss =
  /<style is:global>([\s\S]*?)<\/style>/.exec(
    fs.readFileSync(path.join(SRC, "pages/search.astro"), "utf8"),
  )?.[1] ?? "";

/** The compiled stylesheet every page is loaded with. */
export const STYLESHEET = `${siteCss}\n${searchCss}`;

// No browser is a failure, not a skip: these tests measure layout.
function browserPath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    "/opt/pw-browsers/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    throw new Error(
      "No Chromium-family browser found. Set CHROME_PATH to one: these tests measure layout and cannot run without it.",
    );
  }
  return found;
}

export function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: browserPath() });
}

// A stand-in picture at the width the CDN was asked for. Its colour comes
// from the asset's name, so two pictures are told apart on screen as well.
function picture(url: URL): string {
  const width = Number(url.searchParams.get("w")) || 1200;
  const shape = url.pathname.includes("panorama") ? 2 : 1.5;
  const height = Math.round(width / shape);
  const hue = [...url.pathname].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${hue % 360} 45% 45%)"/></svg>`;
}

export interface OpenOptions {
  width?: number;
  height?: number;
  /** A touch screen: a coarse pointer, and taps for clicks. */
  touch?: boolean;
  dark?: boolean;
  reducedMotion?: boolean;
  /** With scripts off, as a reader with JavaScript disabled sees it. */
  scripts?: boolean;
  /** Extra CSS, for a known-bad control or a larger root font size. */
  css?: string;
  /** The fragment to load the page at. */
  hash?: string;
  /** Milliseconds to hold back each picture whose address has these words. */
  slowPictures?: { match: string; delay: number };
  /** Files to serve under the site's own origin, by path. */
  files?: Map<string, { body: string | Buffer; type: string }>;
}

/** Loads a rendered page at its own address. The caller closes the context. */
export async function open(
  browser: Browser,
  file: string,
  options: OpenOptions = {},
): Promise<{ page: Page; context: BrowserContext; requests: string[] }> {
  const html = (await renderRoute(file)).replace(
    "</head>",
    `<style>${STYLESHEET}${options.css ?? ""}</style></head>`,
  );
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: options.height ?? 900 },
    hasTouch: options.touch ?? false,
    isMobile: options.touch ?? false,
    colorScheme: options.dark ? "dark" : "light",
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    javaScriptEnabled: options.scripts ?? true,
  });
  const page = await context.newPage();
  const address = `${SITE_URL}${ROUTES[file].path}`;
  const requests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (url.origin + url.pathname === address) {
      return route.fulfill({ contentType: "text/html", body: html });
    }
    if (url.hostname === "images.ctfassets.net") {
      const slow = options.slowPictures;
      if (slow && url.href.includes(slow.match)) {
        await new Promise((resolve) => setTimeout(resolve, slow.delay));
      }
      return route.fulfill({
        contentType: "image/svg+xml",
        body: picture(url),
      });
    }
    const file = url.origin === SITE_URL && options.files?.get(url.pathname);
    if (file) return route.fulfill({ contentType: file.type, body: file.body });
    return route.abort();
  });
  await page.goto(`${address}${options.hash ?? ""}`, { waitUntil: "load" });
  return { page, context, requests };
}

/** axe-core's source, for a page to run. */
export const AXE = fs.readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);
