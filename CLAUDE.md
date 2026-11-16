# CLAUDE.md

Standing rules for this repo. Read before implementation work, so house
conventions are not relearned by accident. Each entry is a decision someone
had to defend. Keep an entry to a few lines.

## Bloat is the default failure mode

Solve the problem with the smallest thing that works inside the stack already
here, and treat reaching outside it as a claim needing evidence.

The stack is Astro, the Cloudflare adapter, Contentful's GraphQL API, Tailwind
and Shiki. Before adding a dependency, say what it does that nothing present
can. No UI framework ships to the browser.

- **Prefer the platform.** The scroll offset is one `scroll-padding-top`, the
  lightbox a native `<dialog>`, the menus `<details>`. Behaviour is native
  HTML, CSS or a small `<script>` in the component that owns it.
- **Count the duplication before abstracting it.** An abstraction needing a
  branch per caller is just the callers, spelled worse.
- **A helper earns its place by removing a decision, not lines.**
- **Do not build machinery for a problem that has not happened.** No rate
  limiting, no `X-Frame-Options`, no nonce pipeline.

## How the site is served

- **Public pages are static files unless `ROUTE_CACHE=true`.** Then the pages
  in `ON_DEMAND_PAGES` (`integrations/route-cache.ts`) render on request and
  Cloudflare's cache holds them. Otherwise only `/api/*`, `/preview/*` and the
  adapter's `/_image` run in the Worker. A new on-demand route needs a reason.
- **`ROUTE_CACHE` is a kill switch, so the off state stays exact.** Unset, the
  built site is byte-identical to one without the feature. Nothing may run,
  render or be configured differently unless the switch is on.
- **A page renders the same either way.** `missing()` fails a build and is a
  404 on request, `hold()` is a no-op on a built page. Cache tags are set in
  the page's frontmatter: a component can run after the response has begun.
- **A cached page is tagged with the id of everything it shows**, through
  `src/lib/cache-tags.ts`. A query feeding a cached page selects `sys { id }`.
- **The purge endpoint purges by tag only.** One webhook event, one purge
  call. Never `purgeEverything`: a deploy is what empties the cache.
- **A built page must never shadow an on-demand route.** The static host
  serves a file before the Worker runs. The build fails if one would.
- **The rebuild on publish stays.** It writes the search index, the feed, the
  sitemap and the social cards, and its deploy empties the cache.
- **Pages are rendered in the Workers runtime at build**, the adapter's
  default, so code shared with the draft pages cannot pass a build and then
  fail in the Worker. Do not switch prerendering to Node.
- **Check on-demand changes with `npm run preview`**, which serves the build
  in the Workers runtime, not only with the tests.
- **Two Node steps follow the page build**, both in `integrations/`: the
  social cards are drawn and the search index is written.
- **The feed and the sitemap are written directly**, in `src/lib/feed.ts` and
  `src/lib/sitemap.ts`. The sitemap lists only what has a page.

## Security

- **Response headers are defined once**, in `src/lib/security-headers.ts`.
  Static files get them from the generated `_headers`, every Worker response
  from `src/worker.ts`, the Worker's entry. `_headers` never applies to a
  Worker response, and the middleware never sees a framework-made one.
- **A Worker redirect never repeats the query string**, so a preview link
  with a stray trailing slash cannot hand its secret back.
- **`'unsafe-inline'` stays sitewide. Every other relaxation is per route**:
  `'wasm-unsafe-eval'` on `/search` and `/pagefind/*` only, Contentful framing
  on `/preview/*` only. Never on the base policy.
- **A build is closed to search engines unless `ALLOW_INDEXING=true`.** Every
  Worker response is `noindex` and `no-store`, except a public page held in
  the route cache, which takes exactly the headers its static file had.
- **Nothing private is ever cached.** `src/worker.ts` refuses to hold a draft,
  an endpoint, a redirect, an error or a response that sets a cookie,
  whatever the route asked for.
- **Secrets are read from the environment, through `astro:env`.** Never commit
  one, never inline one at build. The preview token and both secrets are used
  only on the server, and each is compared through `safeCompare`.
- **The analytics beacon and its two CSP hosts are tied to `ALLOW_INDEXING`.**
  Public pages only, never `/preview/*`, never a closed build.
- **Draft pages are gated in the middleware**, not in each page. A new draft
  route goes under `/preview/` and is covered without further work.
- **Every JSON-LD block goes through `jsonLdHtml`**, which escapes the
  HTML-significant characters.
- **Markup built as a string escapes everything it interpolates**, through
  `src/lib/html.ts`. Only the rich-text renderer builds strings.

## Search

- **Search runs on Pagefind's web components** with a house result template.
  Keyboard and ARIA behaviour is upstream's and is not reimplemented.
- **A search never leaves the browser.** The term is kept in `sessionStorage`,
  never in the address, a request or `localStorage`. The privacy page promises
  this.
- **Pagefind's script and styles load on `/search` only**, and `/search` is
  `noindex`.
- **The index is built from built pages.** With `ROUTE_CACHE=true` those are
  the copies from `src/search-source.astro`, which must render a post exactly
  as `src/pages/posts/[slug].astro` does and are deleted before deploy.
- **Only an English post's `h1` and `<article>` carry `data-pagefind-body`.**
  German is not indexed. Anything inside that is not the post's own words
  needs `data-pagefind-ignore`: `aria-hidden` and `opacity-0` do not hide
  text from the index.
- **Style the component hosts or the template's own classes**, never a `pf-*`
  class, and never with `!important`.

## Page shapes

- **A route is wide or narrow, decided by its header.** Wide (`/archive`,
  `/tags`, `/search`) renders through `WidePage.astro`. Narrow (`/about`,
  `/privacy`) is one centred 49.25rem column, through `ContentPage.astro`.
- **Home and the strand pages are neither**: cards under the header's chips,
  an `sr-only` `h1`, no trail. Tag and author pages add a trail and a visible
  `h1`, through `CollectionPage.astro`.
- **No page draws a rule under its header or carries a standfirst.**

## Data and Contentful

- **Contentful is read-only here.** Delivery and preview APIs only. No content
  or content model changes from this repo.
- **Every fetcher in `src/lib/api.ts` is wrapped in `memoise()`** and takes the
  draft flag last, with no defaulted or optional parameter: the argument list
  is the memo key.
- **Every unbounded collection query pages through
  `fetchAllCollectionItems`**, takes `$limit: Int!` and `$skip: Int!`, and
  selects `total`. Drop `total` and the first response becomes the whole result.
- **Scheduling is Contentful's job.** `date` is display metadata, never a
  filter in a query.
- **The locale is `en-GB`, with opt-in `de-DE` posts.** American formats are a
  regression. German has no fallback: an untranslated field is empty.
- **Posts carry `authors`, an ordered list capped at three.** `MAX_AUTHORS`,
  the GraphQL limit and the Contentful validation move together.
- **Images are plain `<img>` elements on Contentful's image CDN.** Only `w`,
  `q` and `fm=webp` are passed. Cropping is CSS-side. Nothing is processed at
  build.
- **Every rich-text field renders through `renderRichText`**, and every
  hyperlink in it through `resolveHyperlink`. Do not copy either.

## Type and styling

- **Four roles, three faces, and nothing in a component names a family.**
  `--font-display` (Bricolage Grotesque), `--font-body` (Literata), `--font-ui`,
  `--font-mono` (IBM Plex Mono). Never `font-sans`.
- **Fonts are self-hosted, Latin only**, through Astro's fonts config. Do not
  add `latin-ext`, including for German. The italic is not preloaded.
- **Never measure a prose column in `ch`.** The measure lives on the column's
  parent, in rem.
- **`@utility prose` carries `overflow-wrap: break-word`.** Do not narrow it
  to a child selector.
- **Dark mode follows the OS.** Only token values change, in one media query.
  No toggle, no class, no stored preference.
- **`THEME_COLOR` and `THEME_COLOR_DARK` twin `--color-brand-bg`.** Change both.
- **Border roles are not interchangeable**: the hairline (dividers), the cover
  keyline, the table tokens, the quiet edge (read) and the ink edge (pressed).
- **Corners come from three radius tokens by role**: `rounded-container`,
  `-content`, `-nested`. No literal radius on a box.
- **One focus indicator, in `@layer base`.** The named exceptions are the
  controls floating over mixed grounds.
- **One scroll offset, `scroll-padding-top` on `html`.** Never `scroll-mt-*`.
- **There are no sidenotes.** A callout is the only boxed aside. Inline embeds
  render nothing.
- **Write whole class strings.** A class glued to `${...}` is never generated.
- **`src/lib/highlight.ts` imports each grammar and the theme by name**, never
  the `shiki` entry, and replaces min-dark's comment colour at highlight time.
- **The post `h1` renders the title directly, never through `widont()`.**

## Accessibility

- **One announced link per card, one description per figure.** A figure's
  `alt` is the asset's title, its caption the description.
- **A scroll region's accessible name is its position** (`Table 2`, `Code
block 2`), or a code block's filename.
- **Standalone controls are 44px to tap on a touch screen.** A mouse keeps
  24px. Links inside a sentence are exempt.
- **The skip link's target, `<main id="main">`, carries `tabindex="-1"`.**
- **A control that needs a script is revealed by that script.** With scripts
  off there is no copy or enlarge button that does nothing.
- **The lightbox is a native `<dialog>` via `showModal()`.** No hand-rolled
  focus trap, Escape handler or scroll lock.

## Testing and workflow

- **`npm run build`, `npm test` and `npm run format:check` pass before every
  commit.** The build type-checks first. `.github/workflows/checks.yml` runs
  the format check, the type check and the tests on every pull request.
- **Prettier formats, it does not lint.** Run `npm run format` before pushing.
  After formatting a template, check the page: whitespace there is content.
- **Tests check behaviour**, and a pattern-matching guard keeps a known-bad
  control beside it. Do not weaken a guard to make a change pass.
- **`node scripts/url-parity.mjs <live> <candidate>`** reports any path that
  answers differently.
- British spelling. Comments are one or two lines and say only what the code
  cannot. Conventional commits, one concern per pull request.
