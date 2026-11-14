import { WIDEST_SERVED_FILE } from "./image";

// Offer the click only if the enlarged view is at least this much wider. On a
// phone most pictures already fill the column.
const MIN_ENLARGE_GAIN = 1.25;

// Mirrors enlargedWidth below. The dialog's padding (p-4, md:p-8) and 75vh
// must change with these.
export function worthEnlarging({
  shownWidth,
  assetWidth,
  assetHeight,
  viewportWidth,
  viewportHeight,
  rootFontSize,
}: {
  shownWidth: number;
  assetWidth: number;
  assetHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  rootFontSize: number;
}): boolean {
  const padding = (viewportWidth >= 48 * rootFontSize ? 2 : 1) * rootFontSize;
  const enlarged = Math.min(
    viewportWidth - 2 * padding,
    (0.75 * viewportHeight * assetWidth) / assetHeight,
    Math.min(assetWidth, WIDEST_SERVED_FILE),
  );
  return enlarged >= shownWidth * MIN_ENLARGE_GAIN;
}

// The smallest of the dialog's width, 75vh tall, and the served file's width.
// Accepted: a square picture on a short screen can open smaller than inline.
export function enlargedWidth(width: number, height: number): string {
  return `min(100%, calc(75vh * ${width} / ${height}), ${Math.min(width, WIDEST_SERVED_FILE)}px)`;
}
