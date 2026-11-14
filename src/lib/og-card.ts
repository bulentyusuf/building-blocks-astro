import { CONTENTFUL_IMAGE_HOST } from "./image";
import { widont } from "./typography";

// The post's social card as an element tree for the image renderer, which
// lays out flexbox only and cannot read custom properties, so colours are
// literal.

export const CARD_SIZE = { width: 1200, height: 630 };

const BRAND_BG = "#FAF5F1";
const BRAND_INK = "#241B1D";
const BRAND_CRIMSON = "#9E2238";
const FACE = "Bricolage Grotesque";

// The renderer has no ellipsis, so clamp here, then glue what renders.
export function cardTitle(title: string): string {
  const clamped =
    title.length > 90 ? `${title.slice(0, 90).trimEnd()}…` : title;
  return widont(clamped);
}

// Host-checked: the build fetches this URL and bakes it into a published
// image. An unusable URL degrades to the solid panel.
export function coverPanelUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
    if (parsed.hostname !== CONTENTFUL_IMAGE_HOST) return null;
    // The panel's exact size; the card is a fixed 1200x630.
    parsed.searchParams.set("w", "480");
    parsed.searchParams.set("h", "630");
    parsed.searchParams.set("fit", "fill");
    parsed.searchParams.set("fm", "jpg");
    parsed.searchParams.set("q", "80");
    return parsed.toString();
  } catch {
    return null;
  }
}

/** What a card says, passed from the page build to the step that draws it. */
export interface CardContent {
  title: string;
  siteTitle: string;
  author: string;
  coverUrl: string | null;
}

export function cardContent({
  title,
  siteTitle,
  author,
  coverUrl,
}: {
  title: string;
  siteTitle: string;
  author: string;
  coverUrl: string | undefined;
}): CardContent {
  return {
    title: cardTitle(title),
    siteTitle,
    author,
    coverUrl: coverPanelUrl(coverUrl),
  };
}

type Style = Record<string, string | number>;
type Child = Element | string | null;
interface Element {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [name: string]: unknown };
}

const box = (style: Style, children?: Child | Child[]): Element => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children },
});

/** `cover` is the cover image as a data URL, or null for the solid panel. */
export function ogCard({
  title,
  siteTitle,
  author,
  cover,
}: {
  title: string;
  siteTitle: string;
  author: string;
  cover: string | null;
}): Element {
  return box({ width: "100%", height: "100%", background: BRAND_BG }, [
    box(
      {
        flexDirection: "column",
        // The padding sits inside the 60%, or the two panels overflow the card.
        boxSizing: "border-box",
        width: "60%",
        height: "100%",
        padding: 64,
      },
      [
        box({
          width: 96,
          height: 8,
          background: BRAND_CRIMSON,
          marginBottom: 40,
        }),
        box(
          { fontFamily: FACE, fontSize: 60, lineHeight: 1.1, color: BRAND_INK },
          title,
        ),
        box(
          {
            flexDirection: "column",
            marginTop: "auto",
            fontFamily: FACE,
            color: BRAND_INK,
            opacity: 0.7,
            fontSize: 28,
          },
          [box({}, siteTitle), box({ marginTop: 4 }, author)],
        ),
      ],
    ),
    // Solid ink when there is no cover, so the layout holds.
    box(
      { width: "40%", height: "100%", background: BRAND_INK },
      cover
        ? {
            type: "img",
            props: {
              src: cover,
              width: 480,
              height: 630,
              style: { width: "100%", height: "100%", objectFit: "cover" },
            },
          }
        : null,
    ),
  ]);
}
