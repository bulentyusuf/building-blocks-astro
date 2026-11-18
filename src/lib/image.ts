// Contentful's image CDN resizes and re-encodes on request, so an image here
// is a plain <img> with a srcset of its URLs. Nothing is processed at build.

export const CONTENTFUL_IMAGE_HOST = "images.ctfassets.net";

// The widths a responsive image is offered at.
const WIDTHS = [384, 640, 750, 828, 1080, 1200, 1920];

/** Nothing enlarges past this: it is the widest file the srcset offers. */
export const WIDEST_SERVED_FILE = WIDTHS[WIDTHS.length - 1];

// Only `w`, `q` and `fm=webp`: cropping is CSS-side. Another host's URL passes
// through untouched.
export function contentfulSrc(src: string, width: number): string {
  // A //host address would follow the page's scheme, and http breaks the CSP.
  const absolute = src.startsWith("//") ? `https:${src}` : src;
  try {
    if (new URL(absolute).hostname !== CONTENTFUL_IMAGE_HOST) return src;
  } catch {
    return src;
  }
  return `${absolute}?w=${width}&q=75&fm=webp`;
}

export interface ImageSource {
  src: string;
  srcset: string;
  sizes?: string;
}

/** A layout-sized image: the browser picks a width from `sizes`. */
export function responsiveSource(src: string, sizes: string): ImageSource {
  return {
    src: contentfulSrc(src, WIDEST_SERVED_FILE),
    srcset: WIDTHS.map((w) => `${contentfulSrc(src, w)} ${w}w`).join(", "),
    sizes,
  };
}

/** A fixed-size image, such as a portrait: one file per pixel density. */
export function fixedSource(src: string, width: number): ImageSource {
  return {
    src: contentfulSrc(src, width * 2),
    srcset: `${contentfulSrc(src, width)} 1x, ${contentfulSrc(src, width * 2)} 2x`,
  };
}

// The page's largest image loads at once; every other one waits its turn.
export function loadingAttributes(priority: boolean) {
  return priority
    ? ({ fetchpriority: "high" } as const)
    : ({ loading: "lazy", decoding: "async" } as const);
}
