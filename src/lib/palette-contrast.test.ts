import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLOR, THEME_COLOR_DARK } from "./constants";

// The palette's numbers. The browser tests run axe on every rendered page,
// which holds text to AA. These pairings are held higher, to AAA, and axe
// does not check that. The second half pins the colours written out as
// literals, where a custom property cannot reach, to the tokens they repeat.

const AAA = 7;

const read = (file: string) =>
  fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

const css = read("src/styles/global.css");
const darkBlock =
  /@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(
    css,
  )?.[1] ?? "";

type Rgb = [number, number, number];

const parse = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function tokenIn(source: string, name: string): Rgb | undefined {
  const hex = new RegExp(`${name}:\\s*(#[0-9a-f]{6})\\b`, "i").exec(source);
  return hex ? parse(hex[1]) : undefined;
}

/** A token's colour in one scheme. Dark falls back to light, as the page does. */
function token(name: string, scheme: "light" | "dark"): Rgb {
  const value =
    (scheme === "dark" && tokenIn(darkBlock, name)) || tokenIn(css, name);
  if (!value) throw new Error(`No hex colour for ${name} in global.css.`);
  return value;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb
    .map((channel) => channel / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES = ["light", "dark"] as const;

describe.each(SCHEMES)("in the %s scheme", (scheme) => {
  const on = (text: string, ground: string) =>
    contrast(token(text, scheme), token(ground, scheme));

  it("reads the scheme's own values, not the other's", () => {
    // The dark block has to be found, or dark is light checked twice.
    expect(token("--color-brand-bg", scheme)).toEqual(
      parse(scheme === "light" ? "#faf5f1" : "#18181b"),
    );
  });

  it("the crimson of links and labels clears AAA on the page and on a card", () => {
    // The dark value is a hand-carried lift, not derived from the light one.
    expect(on("--color-brand-crimson", "--color-brand-bg")).toBeGreaterThan(
      AAA,
    );
    expect(on("--color-brand-crimson", "--color-card")).toBeGreaterThan(AAA);
  });

  it("body ink clears AAA on the page and on a card", () => {
    expect(on("--color-brand-dark", "--color-brand-bg")).toBeGreaterThan(AAA);
    expect(on("--color-brand-dark", "--color-card")).toBeGreaterThan(AAA);
  });

  it("inline code clears AAA on the page and on a card", () => {
    expect(on("--color-code-ink", "--color-brand-bg")).toBeGreaterThan(AAA);
    expect(on("--color-code-ink", "--color-card")).toBeGreaterThan(AAA);
  });

  it("the prompt label and white text clear AAA on the ink surface", () => {
    const ground = token("--color-surface-dark", scheme);
    expect(on("--color-prompt-label", "--color-surface-dark")).toBeGreaterThan(
      AAA,
    );
    expect(contrast(parse("#ffffff"), ground)).toBeGreaterThan(AAA);
  });
});

it("would catch a colour that falls short", () => {
  // Known-bad control: the retired label brown, 3.8:1 on the page.
  expect(
    contrast(parse("#8a7a70"), token("--color-brand-bg", "light")),
  ).toBeLessThan(4.5);
});

describe("colours written out as literals track their tokens", () => {
  // Compared by channel: the stylesheet writes lowercase, the code uppercase.
  const literal = (source: string, constant: string): Rgb => {
    const hex = new RegExp(`${constant}\\s*=\\s*"(#[0-9a-f]{6})"`, "i").exec(
      source,
    );
    if (!hex) throw new Error(`No literal for ${constant}.`);
    return parse(hex[1]);
  };

  it.each([
    ["BRAND_BG", "--color-brand-bg"],
    ["BRAND_INK", "--color-brand-dark"],
    ["BRAND_CRIMSON", "--color-brand-crimson"],
  ])("the social card's %s is %s", (constant, name) => {
    // The card is drawn where no custom property exists, into a picture
    // nobody looks at day to day.
    expect(literal(read("src/lib/og-card.ts"), constant)).toEqual(
      token(name, "light"),
    );
  });

  it("the browser's theme colour is the page colour, in each scheme", () => {
    // A drift paints a phone's address bar in the old colour.
    expect(parse(THEME_COLOR)).toEqual(token("--color-brand-bg", "light"));
    expect(parse(THEME_COLOR_DARK)).toEqual(token("--color-brand-bg", "dark"));
  });

  const emblem = read("public/search-emblem.svg");
  const fill = (svg: string, id: string) => {
    const hex = new RegExp(`id="${id}"[^>]*fill="(#[0-9a-f]{6})"`, "i").exec(
      svg,
    );
    if (!hex) throw new Error(`No fill for #${id} in the search emblem.`);
    return parse(hex[1]);
  };

  it("the search emblem is the light crimson on the light page colour, in both schemes", () => {
    // Its ground is a fixed cream island, so the lifted dark crimson would
    // wash out on it and the dark page colour would paint a black glass.
    expect(fill(emblem, "search-emblem-ink")).toEqual(
      token("--color-brand-crimson", "light"),
    );
    expect(fill(emblem, "search-lens-ground")).toEqual(
      token("--color-brand-bg", "light"),
    );
  });

  it("would catch the dark crimson wired into the emblem", () => {
    const wrong = emblem.replace(
      /(id="search-emblem-ink"[^>]*fill=")#[0-9a-f]{6}/i,
      "$1#F594A4",
    );
    expect(fill(wrong, "search-emblem-ink")).not.toEqual(
      token("--color-brand-crimson", "light"),
    );
    expect(fill(wrong, "search-emblem-ink")).toEqual(
      token("--color-brand-crimson", "dark"),
    );
  });

  it("the focus ring on an ink block is the dark crimson", () => {
    // The block stays ink in the light scheme, where the token is too dark.
    const ring =
      /\.bg-surface-dark :focus-visible\s*\{\s*outline-color:\s*(#[0-9a-f]{6})/i.exec(
        read("src/styles/global.css"),
      );
    expect(ring).not.toBeNull();
    expect(parse(ring![1])).toEqual(token("--color-brand-crimson", "dark"));
  });

  it("the search emblem carries no colour-scheme query", () => {
    // Safari does not apply one inside an <img> SVG.
    const scheme = /prefers-color-scheme/i;
    expect(scheme.test("@media (prefers-color-scheme:dark){}")).toBe(true);
    expect(scheme.test(emblem)).toBe(false);
  });
});
