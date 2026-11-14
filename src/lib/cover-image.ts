import { isPlaceholderTitle } from "./placeholder-title";
import type { CoverImage } from "./types";

// The asset's alt text, or "" when it is only a filename. It matters on the
// post's cover, which renders no link.
export function coverAltText(image: CoverImage): string {
  if (isPlaceholderTitle(image.title, image.fileName)) {
    console.warn(
      `[cover-image] ${image.url} has no usable title (${JSON.stringify(
        image.title ?? null,
      )}), so it renders with empty alt text rather than a filename.`,
    );
    return "";
  }
  return image.title ?? "";
}
