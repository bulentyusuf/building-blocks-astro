#!/usr/bin/env node
// Audits a running copy of the site for accessibility in a real browser, by
// hand. Every line it prints is a measurement taken from a rendered page.
//
//   SITE_URL=https://beuseful.net npm run audit:a11y
//   SITE_URL=http://localhost:4321 npm run audit:a11y -- --all
//   npm run audit:a11y -- --route /posts/some-post
//   npm run audit:a11y -- --self-test
//
// Routes come from the site's own sitemap, so a new page is audited without
// editing this file: one per page shape, or every one with --all. Each is
// measured four times: 1280px, 375px, 375px at a 20px root font size, and
// 1280px in dark mode. The self test runs first, every time: a clean report
// counts for nothing until axe has been seen to report a planted defect.
//
// CHROME_PATH names a browser. Without it, the installed Google Chrome.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { sitemapPaths } from "./url-parity.mjs";

const AXE = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

const BASE = new URL(process.env.SITE_URL || "https://beuseful.net").origin;
const ARGS = process.argv.slice(2);
const ALL = ARGS.includes("--all");
const ROUTE = ARGS.includes("--route") ? ARGS[ARGS.indexOf("--route") + 1] : "";

// wcag22aa brings the criteria added in 2.2, target size among them.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PASSES = [
  { name: "1280px", width: 1280, height: 900, root: 16 },
  { name: "375px", width: 375, height: 812, root: 16 },
  { name: "375px, 20px root", width: 375, height: 812, root: 20 },
  { name: "1280px, dark", width: 1280, height: 900, root: 16, dark: true },
];

async function launch() {
  try {
    return process.env.CHROME_PATH
      ? await chromium.launch({ executablePath: process.env.CHROME_PATH })
      : await chromium.launch({ channel: "chrome" });
  } catch (error) {
    console.error(
      "Could not start a browser. Install Google Chrome, or set CHROME_PATH to a\n" +
        `Chromium-based browser. The error was:\n  ${String(error.message).split("\n")[0]}`,
    );
    process.exit(1);
  }
}

// /posts/a and /posts/b are one shape, and so are /de/posts/a and /de/posts/b.
function shapeOf(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length < 2
    ? `/${segments.join("")}`
    : `/${segments.slice(0, -1).join("/")}/*`;
}

async function routes() {
  if (ROUTE) return [ROUTE];
  const paths = (await sitemapPaths(BASE)).sort();
  if (paths.length === 0) {
    console.error(`${BASE}/sitemap.xml lists nothing. Nothing to audit.`);
    process.exit(1);
  }
  if (ALL) return paths;
  const first = new Map();
  for (const path of paths)
    if (!first.has(shapeOf(path))) first.set(shapeOf(path), path);
  // Pages kept out of the sitemap, which a reader still reaches.
  return [...first.values(), "/search", "/404"];
}

// The element that makes the page scroll sideways. One box reaching past the
// edge may be clipped and cost nothing, so this hides one subtree at a time
// and descends into the one whose hiding removes the overflow.
function bisectOverflow() {
  const root = document.documentElement;
  const over = () => root.scrollWidth - root.clientWidth;
  if (over() <= 1) return null;
  let node = document.body;
  for (let depth = 0; depth < 40; depth++) {
    const culprit = [...node.children].find((child) => {
      const before = child.style.display;
      child.style.display = "none";
      const gone = over() <= 1;
      child.style.display = before;
      return gone;
    });
    if (!culprit) break;
    node = culprit;
  }
  const box = node.getBoundingClientRect();
  return {
    over: over(),
    where:
      node === document.body
        ? "no single element accounts for it"
        : `${node.tagName.toLowerCase()}, ${Math.round(box.width)}px wide, right edge at ${Math.round(box.right)}px`,
    text: (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70),
  };
}

// Text drawn straight on the graph paper. axe cannot see through the dots'
// gradient, so these boxes are measured from pixels instead.
function textOnGround() {
  const opaque = (style) =>
    style.backgroundImage !== "none" ||
    !/rgba\(.*,\s*0\)$|transparent/.test(style.backgroundColor);
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    const style = getComputedStyle(el);
    if (style.visibility !== "visible" || Number(style.opacity) === 0) continue;
    let onGround = true;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      // Clipped text, such as a screen-reader label, is never drawn.
      if (opaque(s) || s.clip !== "auto" || s.clipPath !== "none")
        onGround = false;
    }
    if (!onGround) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // The text's own line boxes, cut to every clipping ancestor, so a cell
    // scrolled out of its region is not read as drawing nothing.
    let rects = [...range.getClientRects()].map((r) => ({
      l: r.left,
      t: r.top,
      r: r.right,
      b: r.bottom,
    }));
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const c = a.getBoundingClientRect();
      rects = rects.map((r) => ({
        l: Math.max(r.l, c.left),
        t: Math.max(r.t, c.top),
        r: Math.min(r.r, c.right),
        b: Math.min(r.b, c.bottom),
      }));
    }
    rects = rects
      .map((r) => ({
        x: r.l + scrollX,
        y: r.t + scrollY,
        w: r.r - r.l,
        h: r.b - r.t,
      }))
      .filter((r) => r.w >= 2 && r.h >= 2);
    if (rects.length === 0) continue;
    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    boxes.push({
      id: el.id,
      tag: el.tagName.toLowerCase(),
      text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 60),
      color: style.color,
      need: size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5,
      rects,
    });
  }
  return boxes;
}

// Runs in the page, on two screenshots: with the text, and with it made
// transparent. Only pixels that differ are letters, and each letter is
// measured against the ground under it.
async function worstGround([withText, ground, boxes]) {
  const load = async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);
    return context;
  };
  const text = await load(withText);
  const bare = await load(ground);
  const lum = (r, g, b) =>
    [r, g, b]
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const bad = [];
  for (const box of boxes) {
    const [r, g, b] = box.color.match(/[\d.]+/g).map(Number);
    const ink = lum(r, g, b);
    let worst = Infinity;
    for (const rect of box.rects) {
      // Rounded inwards, so a neighbour's background at the edge never counts.
      const x = Math.max(0, Math.ceil(rect.x));
      const y = Math.max(0, Math.ceil(rect.y));
      const w = Math.min(bare.canvas.width, Math.floor(rect.x + rect.w)) - x;
      const h = Math.min(bare.canvas.height, Math.floor(rect.y + rect.h)) - y;
      if (w < 1 || h < 1) continue;
      const under = bare.getImageData(x, y, w, h).data;
      const drawn = text.getImageData(x, y, w, h).data;
      for (let i = 0; i < under.length; i += 4) {
        const letter =
          Math.abs(under[i] - drawn[i]) +
            Math.abs(under[i + 1] - drawn[i + 1]) +
            Math.abs(under[i + 2] - drawn[i + 2]) >
          24;
        if (letter)
          worst = Math.min(
            worst,
            ratio(ink, lum(under[i], under[i + 1], under[i + 2])),
          );
      }
    }
    // Text that draws no visible letter is indistinguishable from its ground.
    if (worst === Infinity) worst = 1;
    if (worst < box.need) {
      bad.push({
        ...box,
        rects: undefined,
        ratio: Math.round(worst * 100) / 100,
      });
    }
  }
  return bad;
}

async function groundContrast(page) {
  const boxes = await page.evaluate(textOnGround);
  // A full-page screenshot draws fixed elements once, over whatever is on the
  // first screen. They float over text rather than behind it, so they go.
  const floating = await page.evaluateHandle(() =>
    [...document.querySelectorAll("*")].filter((el) => {
      if (getComputedStyle(el).position !== "fixed") return false;
      el.dataset.auditVisibility = el.style.visibility;
      el.style.visibility = "hidden";
      return true;
    }),
  );
  const shot = async () =>
    (await page.screenshot({ fullPage: true })).toString("base64");
  const withText = await shot();
  const hide = await page.addStyleTag({
    content:
      "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}",
  });
  const ground = await shot();
  await hide.evaluate((el) => el.remove());
  await floating.evaluate((els) =>
    els.forEach((el) => {
      el.style.visibility = el.dataset.auditVisibility;
      delete el.dataset.auditVisibility;
    }),
  );
  return page.evaluate(worstGround, [withText, ground, boxes]);
}

// axe reports text over the dots as unsure, never as a failure, so they go
// before it runs. groundContrast has measured the dots by then.
const clearDots = (page) =>
  page.addStyleTag({ content: "body{background-image:none!important}" });

async function axe(page, context = "document") {
  if (!(await page.evaluate(() => "axe" in window))) {
    await page.addScriptTag({ content: AXE });
  }
  return page.evaluate(
    async ([tags, selector]) => {
      const root =
        selector === "document" ? document : document.querySelector(selector);
      const result = await window.axe.run(root, {
        runOnly: { type: "tag", values: tags },
      });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
        sample: v.nodes[0]?.target?.join(" ") ?? "",
        why: (v.nodes[0]?.failureSummary ?? "")
          .split("\n")
          .slice(1, 2)
          .join(" ")
          .trim(),
      }));
    },
    [TAGS, context],
  );
}

async function measure(page, path, pass) {
  await page.setViewportSize({ width: pass.width, height: pass.height });
  await page.emulateMedia({ colorScheme: pass.dark ? "dark" : "light" });
  const response = await page.goto(BASE + path, { waitUntil: "load" });
  const status = response?.status() ?? 0;
  if (pass.root !== 16) {
    await page.addStyleTag({ content: `html{font-size:${pass.root}px}` });
  }
  await page.waitForTimeout(250);
  const reflow = await page.evaluate(bisectOverflow);
  const ground = await groundContrast(page);
  await clearDots(page);
  return { status, reflow, ground, violations: await axe(page) };
}

// A clean report and a silent axe look the same from outside, so this plants
// defects on the real home page and stops unless each one is reported.
async function selfTest(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const fail = (why) => {
    console.error(`SELF TEST FAILED: ${why}`);
    process.exit(1);
  };

  // Muted text on the graph paper, in the open and in a scroll region, once
  // in view and once scrolled away. Only drawn text may be measured.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    main.insertAdjacentHTML(
      "afterbegin",
      '<div id="scroll-control" style="overflow-x:auto;width:200px"><div style="display:flex;width:1200px"><p id="scroll-shown" style="color:#6b5a52;width:180px">Muted and in view.</p><p id="scroll-hidden" style="color:#6b5a52;margin-left:600px">Muted and scrolled away.</p></div></div>' +
        '<p id="ground-control" style="color:#6b5a52">Muted text on the graph paper.</p>',
    );
  });
  const real = await groundContrast(page);
  const darker = await page.addStyleTag({
    content: ":root{--color-dots:#8a7a72!important}",
  });
  const darkened = await groundContrast(page);
  await darker.evaluate((el) => el.remove());
  const ids = (found) => found.map((t) => t.id);
  if (ids(real).includes("ground-control")) {
    fail(
      "muted text failed against the real dots, so the dots or the measurement changed.",
    );
  }
  if (!ids(darkened).includes("ground-control")) {
    fail(
      "darkened dots went unreported, so text on the graph paper goes unchecked.",
    );
  }
  if (!ids(darkened).includes("scroll-shown")) {
    fail("darkened dots under a scroll region went unreported.");
  }
  if ([...ids(real), ...ids(darkened)].includes("scroll-hidden")) {
    fail(
      "text scrolled out of its region was measured, so every wide table reports 1:1.",
    );
  }
  await page.evaluate(() => {
    document.getElementById("ground-control").remove();
    document.getElementById("scroll-control").remove();
  });

  // Planted for axe: an image with no alt, an unnamed link, and faint text on
  // the page ground, which only counts once the dots are cleared.
  await clearDots(page);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="planted"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><a href="/"></a><p style="color:#cccccc">Faint text on the page ground.</p></div>' +
        '<div id="clean"><p>Ordinary text with nothing wrong with it.</p></div>',
    );
  });
  const planted = (await axe(page, "#planted")).map((v) => v.id);
  for (const id of ["image-alt", "link-name", "color-contrast"]) {
    if (!planted.includes(id))
      fail(`axe did not report the planted ${id} defect.`);
  }
  const clean = (await axe(page, "#clean")).map((v) => v.id);
  if (clean.length > 0)
    fail(`axe flagged ordinary markup (${clean.join(", ")}).`);
  await page.close();
  console.log(
    `Self test passed: axe reported ${planted.join(", ")}, the dots were measured, clean markup was silent.\n`,
  );
}

const browser = await launch();
await selfTest(browser);
if (ARGS.includes("--self-test")) {
  await browser.close();
  process.exit(0);
}

const paths = await routes();
console.log(`Auditing ${BASE}`);
console.log(
  `${paths.length} route${paths.length === 1 ? "" : "s"}, ${PASSES.length} passes each\n`,
);

const page = await browser.newPage();
let findings = 0;
for (const path of paths) {
  for (const pass of PASSES) {
    const { status, reflow, ground, violations } = await measure(
      page,
      path,
      pass,
    );
    const unexpected = status >= 400 && path !== "/404";
    if (
      !unexpected &&
      !reflow &&
      ground.length === 0 &&
      violations.length === 0
    )
      continue;
    findings++;
    console.log(`${path}  [${pass.name}]`);
    if (unexpected) console.log(`  STATUS    answered ${status}`);
    if (reflow) {
      console.log(
        `  REFLOW    page scrolls sideways by ${reflow.over}px, ${reflow.where}`,
      );
      if (reflow.text) console.log(`            "${reflow.text}"`);
    }
    for (const t of ground) {
      console.log(
        `  GROUND    ${t.ratio}:1 on the graph paper, needs ${t.need}:1, on ${t.tag}`,
      );
      console.log(`            "${t.text}"`);
    }
    for (const v of violations) {
      console.log(
        `  ${String(v.impact ?? "n/a").padEnd(8)}  ${v.id} on ${v.count} element${v.count === 1 ? "" : "s"}. ${v.help}`,
      );
      console.log(`            ${v.sample}`);
      if (v.why) console.log(`            ${v.why}`);
    }
    console.log();
  }
}
await browser.close();
console.log(
  findings
    ? `${findings} route and pass combinations with findings.`
    : "No findings.",
);
process.exit(findings ? 1 : 0);
