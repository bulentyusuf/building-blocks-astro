// The public origin, from `site` in astro.config.ts. Trailing slashes are
// stripped, since consumers append paths.
export const SITE_URL = import.meta.env.SITE!.replace(/\/+$/, "");

export const SITE_HOSTNAME = new URL(SITE_URL).hostname;

export const SITE_TITLE = "Be Useful.";

export const SITE_DESCRIPTION =
  "A blog about building this blog, using AI assistance for code and content.";

// Home's own title and description. The title is short of the full site
// description, which would run past Bing's cut-off.
export const HOME_TITLE = `${SITE_TITLE} A blog about building this blog`;
export const HOME_DESCRIPTION =
  "A blog about building this blog, using AI assistance for code and content. Detours into films, games, single-board computers and mechanical keyboards.";

export const SITE_AUTHOR = "Bulent Yusuf";

export const SITE_FOOTER_BLURB =
  "A blog about content, code, and collaborating with generative AI. Written in Munich and published from a headless CMS.";

export const SITE_REPO_URL = "https://github.com/bulentyusuf/building-blocks";

// Must match the GraphQL limit and the Contentful validation, or a fourth
// author silently vanishes.
export const MAX_AUTHORS = 3;

// Twin of --color-brand-bg in src/styles/global.css; change both.
export const THEME_COLOR = "#FAF5F1";

// Dark-scheme twin.
export const THEME_COLOR_DARK = "#18181B";

export const DEFAULT_LOCALE = "en-GB";

// Open Graph uses an underscore.
export const DEFAULT_OG_LOCALE = "en_GB";

// Per-post opt-in under English chrome; no fallback, so empty means untranslated.
export const GERMAN_LOCALE = "de-DE";
export const GERMAN_OG_LOCALE = "de_DE";

/** Cloudflare Web Analytics site token. Public: it is in every page's source. */
export const ANALYTICS_TOKEN = "deb38ac39ad9479bac8f684b669441f8";
