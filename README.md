# Be Useful.

The source for [beuseful.net](https://beuseful.net), a personal blog about content, code, and making things with generative AI.

## 👋 About

A small, statically built blog. Posts are written and managed in a headless CMS, built with Astro, and served from Cloudflare. Public pages are plain files. The Worker runs only for draft previews.

With `ROUTE_CACHE=true` the pages that show posts are rendered on request and
held in Cloudflare's cache instead, so a publish shows within seconds. See
[Publishing](#publishing).

The content model is deliberately compact: a Post type backed by Author, Category and Tag, with a Code Block type for embedded snippets, a Prompt Block type for publishing the image prompt behind a cover, and a Callout type for boxed asides. There's also a Page type for standalone pages like the privacy notice.

The site is written in British English. Some posts also have a German translation, published post by post rather than site-wide: a translated post gets a second page under `/de/posts/`, and everything else stays English.

A recurring subject of the blog is the process of building and maintaining it. Much of the codebase has been developed in collaboration with [Claude](https://claude.ai), and several posts document what that's actually like in practice. The visual identity uses editorial-style cover images generated with [Midjourney](https://www.midjourney.com).

## 🧱 Stack

- **[Astro](https://astro.build)**, rendering and routing, with no framework JavaScript shipped to readers
- **[Cloudflare](https://www.cloudflare.com)**, hosting and deployment, through the Astro adapter. Static files for public pages, a Worker for draft previews
- **[Contentful](https://www.contentful.com)**, headless CMS queried over GraphQL, with a preview API for drafts
- **[Tailwind CSS](https://tailwindcss.com)**, styling
- **[Pagefind](https://pagefind.app)**, search index built after the site builds, running entirely in the browser
- **[Shiki](https://shiki.style)**, syntax highlighting at build time
- **[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)**, page counts, on the live site only
- **TypeScript** throughout

## 🧩 Content model

- **Post**, the main entry type. Title, slug, publish and updated dates, cover image, excerpt, rich-text body, a numbered-sections switch, a link to one category, links to up to three authors, and up to three tags. Title, excerpt and body can carry a German translation, and so can the alt text and caption of an image embedded in the body
- **Author**, name, picture, slug, and a short bio, with its own landing page. A post can carry more than one, and every author it names lists that post
- **Category**, name, slug, and a short description, with its own landing page. Posts are filed under one of three strands, Blogging, Films, or Games & Gadgets
- **Tag**, name, slug, and a short description, with its own landing page. Cross-cutting topics, up to three per post: where Category says where a post lives, a Tag says what it is about
- **Code Block**, embedded into post bodies for syntax-highlighted snippets. Optional filename and a language
- **Prompt Block**, embedded into post bodies to publish the generative-image prompt behind a cover, with an optional label and image
- **Callout**, embedded into post bodies to box a passage the author wants to stand out, with a short label. Its body takes text, links and lists only. A callout can be hidden from search, and its label and body can carry a German translation
- **Page**, standalone rich-text pages such as About and Privacy

## ✨ Features

**Publishing**

- Every publish, unpublish or delete in Contentful rebuilds the whole site, search index included. See Publishing below
- Draft previews at `/preview/posts/<slug>`, behind a signed session, for editing posts before publishing
- Syntax-highlighted code blocks with a copy button, powered by Shiki
- Published image prompts alongside the covers they generated

**Finding things**

- Site search that runs entirely in the visitor's browser, with no third-party service and no query leaving the page
- A header of strand chips, one per category, that marks where the reader is. On phones they become one row that scrolls sideways, and the other links move into a menu
- A home page with the latest post as a feature card, five more as cards and a link to the archive. No pagination anywhere
- Category, tag and author landing pages that show every post: the latest six as cards, the rest as compact rows. There is no index page for categories or authors, and those URLs redirect
- A tag index with a post count per topic, each linking to its tag page. Tag pills on each post and on the feature card
- Archive page listing every post grouped by year
- Related posts scored on shared tags weighted by rarity, so an uncommon tag counts for more than a common one, with category and shared authorship as lesser signals
- Breadcrumb trails with `BreadcrumbList` structured data on tag and author pages, the archive, tags and search pages, and About and Privacy

**Reading**

- Light and dark colour schemes, following the operating system preference
- Per-post table of contents, reading time, and an image lightbox
- Shared bylines, with overlapping author portraits and a bio for each author at the foot of the post
- Skip link, a single visible focus indicator across the site, and reduced-motion support

**German translations**

- Opt-in per post. A post gets a German page at `/de/posts/<slug>` once its title, excerpt and body have German text, and no page otherwise. There is no fallback to English
- The German page translates the article and keeps the site around it in English. Anything still English inside a German article is marked as English for screen readers
- Each version links to the other under the byline, and both are paired with `hreflang` alternates in the page metadata. The sitemap lists both URLs
- German pages stay out of site search and the RSS feed, which are English only

**Metadata and machines**

- Generated sitemap, `robots.txt`, web manifest and RSS feed
- Open Graph and Twitter card metadata for shareable links, with a social card drawn for each post at build time
- JSON-LD structured data, escaped before it is written into a page
- Hand-written `llms.txt`

**Engineering**

- Content Security Policy, HSTS, Permissions-Policy and other security headers, defined once in `src/lib/security-headers.ts`. Static files get them from the generated `_headers`, and every Worker response gets them from the Worker's entry, `src/worker.ts`
- A build is closed to search engines unless `ALLOW_INDEXING=true`
- Formatting, type and test checks on every pull request, and Cloudflare builds each branch and reports on the pull request too
- CodeQL scanning, branch protection and Dependabot, configured in GitHub's settings rather than in the code
- A URL parity script that compares the live site with a build, path by path

## 🚀 Getting started (fork your own)

The repo is a template. With your own Contentful space and Cloudflare account,
you can go from a fork to a working copy of the site, with example content to
look at, in the steps below. Do them in order.

### 1. What you need

- **Node.js**, the version in `engines.node` in `package.json`.
- **An empty Contentful space.** A new space's default locale is English
  (United States), `en-US`, and that is what the content model and the
  example content are written for. Keep it. The site still marks its pages up
  as British English (`DEFAULT_LOCALE` in `src/lib/constants.ts`), because
  that is only the `lang` value in the HTML, and the queries read whichever
  locale is your space's default.
- **A Cloudflare account.** The free Workers plan is enough to start.
- **Chrome or Chromium, for the tests.** Some of the tests measure pages in a
  real browser. If yours is not found, set `CHROME_PATH` to its executable.

### 2. Install

Fork the repo on GitHub, clone your fork, then:

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Then fill in `.env`. It is ignored by git, so nothing in it is committed.

| Value                             | What it is, and where to find it                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTENTFUL_SPACE_ID`             | Your space's id. In Contentful, Settings, API keys, Add API key. The new key's page shows it                                                                                    |
| `CONTENTFUL_ACCESS_TOKEN`         | The Content Delivery API token, on the same page. It reads published content                                                                                                    |
| `CONTENTFUL_PREVIEW_ACCESS_TOKEN` | The Content Preview API token, on the same page. It reads drafts, for [draft previews](#draft-previews)                                                                         |
| `CONTENTFUL_PREVIEW_SECRET`       | Any long random string you make up. It guards draft previews                                                                                                                    |
| `CONTENTFUL_WEBHOOK_SECRET`       | Another long random string. It is only used by [instant publishing](#instant-publishing), but Cloudflare refuses a deploy without it, so set one now                            |
| `SITE_URL`                        | Your site's address, such as `https://example.com`. Leave it empty locally. Without it in production, every canonical link, the sitemap and the feed point at the original site |
| `ALLOW_INDEXING`                  | Leave empty locally. See step 7                                                                                                                                                 |
| `ROUTE_CACHE`                     | Leave empty. See step 9                                                                                                                                                         |

One way to make a long random string is `openssl rand -hex 32`.

### 4. Import the content model

The content model is the set of content types the site reads: Post, Author,
Category, Tag, Page, and the Code Block, Prompt Block and Callout types that
go inside a post. It is in `contentful/export.json`. Import it with:

```bash
npm run import:contentful -- --space-id <your space id> --management-token <your management token>
```

This needs a **Contentful Management token**, which is different from the two
tokens in `.env`. Those can only read. A management token can change anything
in every space you can reach, so it is never written into `.env`, a file or
the repo. Create one in Contentful under your account settings, CMA tokens,
use it here, and revoke it when you are done.

The import runs `contentful-import` once through `npx`, at a pinned version,
so it is not one of the repo's dependencies.

### 5. Add example content (optional)

```bash
npm run import:seed -- --space-id <your space id> --management-token <your management token>
```

This publishes three example posts, two authors, the three categories, two
tags, an About and a Privacy page, and one of each embedded block. Between
them they show every feature the site has, such as a table of contents, a
numbered post, code, an image prompt and a callout. Every cover, portrait and
body image is the same placeholder picture, `contentful/seed-assets/placeholder.jpg`,
which Contentful fetches from this repo on GitHub when you import.

The example content is written by `contentful/build-seed.mjs`, and
`contentful/seed.json` is its output. To change the example content, edit
the generator and run `npm run build:seed`, never the JSON by hand. A test
fails if the two disagree.

Replace or delete the example entries in Contentful once you have your own.

### 6. Run it locally

```bash
npm run dev
```

The dev server, at `http://localhost:4321`, shows your published content and
updates as you edit the code. Search does not work there, because its index
is written at the end of a build. To try search, or anything the Worker does,
build the site and serve the build:

```bash
npm run build
```

```bash
npm run preview
```

### 7. Deploy to Cloudflare Workers

1. **Name the Worker.** Its name is `name` in `wrangler.jsonc`, and the
   Worker you create in Cloudflare must have the same name, or the build
   refuses to deploy. Pick one and set both.
2. **Connect the fork.** In Cloudflare, Workers & Pages, create a Worker by
   importing your GitHub repository, which sets up Workers Builds. In the
   Worker's Settings, Build, set the build command to `npm run build` and the
   deploy command to `npx wrangler deploy`.
3. **Add the runtime secrets.** In the Worker's Settings, Variables & Secrets,
   add all five `CONTENTFUL_*` values as secrets. These are what the running
   site reads, for draft previews and the purge endpoint.
4. **Add the build variables.** In the Worker's Settings, Build, Build
   variables and secrets, add `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ACCESS_TOKEN`
   and `SITE_URL`. These are what the build reads to fetch your content and
   write the pages.
5. **Open it to search engines, on production only.** Add `ALLOW_INDEXING`
   with the value `true` as a build variable for production, never for branch
   previews. Until then every page tells search engines to stay away. See
   [Indexing](#indexing).
6. **Add your domain.** In the Worker's Settings, Domains & Routes, add a
   Custom Domain. The domain must be on Cloudflare already, as a zone in your
   account. `wrangler.jsonc` turns the `workers.dev` address off, so until a
   domain is added the site has no public address. See Make it yours.

**Runtime secrets and build variables are separate**, and confusing them is
the commonest failure. The build cannot read the Worker's secrets, and the
Worker cannot read the build variables, so `CONTENTFUL_SPACE_ID` and
`CONTENTFUL_ACCESS_TOKEN` go in both places. A build that stops with an
error naming `CONTENTFUL_SPACE_ID` is missing a build variable. A deploy refused
over a missing secret is missing a runtime secret. See [Secrets](#secrets),
which also covers branch previews.

### 8. Publish from Contentful

Public pages are built, so a publish in Contentful shows only after the site
rebuilds. To rebuild on every publish:

1. In the Worker's Settings, Build, Deploy Hooks, create a deploy hook for
   your production branch and copy its address. Treat the address as a
   secret, since anyone holding it can start a build.
2. In Contentful, Settings, Webhooks, add a webhook that sends a `POST` to
   that address, triggered by Publish, Unpublish and Delete, for entries and
   assets.

A publish then shows on the site about a minute later. See
[Publishing](#publishing).

### 9. Instant publishing (optional)

With the build variable `ROUTE_CACHE=true`, the pages that show posts are
rendered on request and held in Cloudflare's cache, so a publish shows within
seconds. It needs a second Contentful webhook, to `/api/purge`, carrying the
`CONTENTFUL_WEBHOOK_SECRET` value in an `X-Webhook-Secret` header. Rendering
a post on request can take longer than the 10 ms of CPU time the free Workers
plan allows per request, so check your Worker's logs for CPU limit errors
after turning it on. If they appear, the fix is the paid plan. Turning it on and off
is in [Instant publishing](#instant-publishing).

### 10. Preview drafts from Contentful

In Contentful, Settings, Content preview, add preview URLs for the Post and
Page content types, using your `CONTENTFUL_PREVIEW_SECRET`. The exact
addresses are in [Draft previews](#draft-previews).

## 🎨 Make it yours

A fork inherits the original site's identity, and some of it would point your
readers, search engines or analytics at the original. Change these before
you deploy.

- **Site address (required).** `SITE_URL` as a build variable. Without it the
  build falls back to `https://beuseful.net`, the default in `astro.config.ts`,
  and every canonical link, the sitemap, the feed and the social cards name
  that site. The default is also written in a comment in `.env.example`, and
  `scripts/audit-a11y.mjs` uses it when no address is given.
- **Site identity (required).** In `src/lib/constants.ts`: `SITE_TITLE`,
  `SITE_DESCRIPTION`, `HOME_TITLE`, `HOME_DESCRIPTION`, `SITE_AUTHOR` and
  `SITE_FOOTER_BLURB`. The title also names the web manifest.
- **Repository link.** `SITE_REPO_URL` in `src/lib/constants.ts` is the
  footer's "Fork on GitHub" link. Point it at your fork, or remove the link
  from `src/components/Footer.astro`.
- **Analytics (required).** `ANALYTICS_TOKEN` in `src/lib/constants.ts` is the
  original site's Cloudflare Web Analytics token. Cloudflare only accepts
  page views from the hostname a token was made for, so on your domain it
  counts nothing. Create a site in Cloudflare Web Analytics and use its
  token, or remove the beacon from `src/layouts/Layout.astro` and the tests
  that expect it. The beacon is only ever sent on a
  build with `ALLOW_INDEXING=true`.
- **Worker name and address.** `name` in `wrangler.jsonc` must match your
  Worker's name in Cloudflare. `workers_dev` is `false` in the same file,
  because the original site has its own domain. Without a custom domain,
  set it to `true` so the site is reachable at its `workers.dev` address.
- **`llms.txt`.** `public/llms.txt` is a hand-written description of the
  original site, for AI tools, and every link in it points there. Rewrite it
  or delete it.
- **Redirects.** `public/_redirects` holds the original site's renamed
  addresses. Empty it, keeping any rule you want.
- **Strands.** The header's three chips and the strand pages are the
  categories in `STRANDS` in `src/lib/strands.ts`, by slug: `blogging`,
  `films` and `games-and-gadgets`. The example content creates categories
  with those slugs. To use your own, change `STRANDS` and the matching
  `--color-strand-*` tokens in `src/styles/global.css` together.
- **Brand colours.** The palette is the `--color-brand-*` tokens in
  `src/styles/global.css`, once for light and once, in the dark-mode media
  query, for dark. `THEME_COLOR` and `THEME_COLOR_DARK` in
  `src/lib/constants.ts` repeat the page colour for the browser's toolbar and
  must change with `--color-brand-bg`. The social cards draw in their own
  copies of three colours, `BRAND_BG`, `BRAND_INK` and `BRAND_CRIMSON` in
  `src/lib/og-card.ts`.
- **Brand images.** In `public/`: `be_useful.jpg`, the social card for every
  page that is not a post, then `favicon.ico`, `apple-icon.png`,
  `icon-192.png` and `icon-512.png`. Keep the file names or update
  `src/layouts/Layout.astro`, `src/components/PostView.astro` and
  `src/pages/manifest.webmanifest.ts`.
- **Illustrations.** The search page's emblem, `public/search-emblem.svg`, and
  the not-found page's gremlin, `public/404-gremlin.webp`, with its caption
  and alt text in `src/pages/404.astro`, are made for the original site.
  Replace or remove them.
- **Language and dates.** The site is written in British English. Set
  `DEFAULT_LOCALE` in `src/lib/constants.ts` to your own, for example
  `"en-US"`, and the page language, the Open Graph locale, the date format
  ("16 November 2026" becomes "November 16, 2026") and the order of tags all
  follow it. The content model's locale is separate and already `en-US`.
  Some tests check the British format, so `npm test` will name them; update
  their expected values to match.
- **German posts (optional).** The content model ships one locale, so a fork
  has no German pages and needs no setup. In a space without German, the
  build's German queries come back empty, with a warning in the build log,
  and the site carries on. To translate a post, add a `de-DE` locale to the
  space with no fallback, then fill in the post's German title, excerpt and
  body. Another language is more than a constant change: German words are
  written into the code, for example in `src/components/PostView.astro` and
  `src/components/UpdatedStamp.astro`.
- **Security headers (careful).** All of them are in
  `src/lib/security-headers.ts`. Two relaxations are load-bearing.
  WebAssembly is allowed on `/search` and `/pagefind/*` only, because search
  runs as WebAssembly in the browser, and without it search fails with no
  visible error. Framing by Contentful is allowed on `/preview/*` only,
  which is what lets Contentful show a draft beside the editor. Remove
  neither, and widen neither.
- **The placeholder image.** `PLACEHOLDER_ASSET_URL` in
  `contentful/build-seed.mjs` fetches the picture from this repo on GitHub.
  It works as it is. To serve it from your fork, change the address, run
  `npm run build:seed`, and commit both files.
- **Licence.** `LICENSE.md` names the original author. The MIT licence asks you
  to keep that notice. Add your own name beside it for your changes.
- **`CLAUDE.md` (optional).** The standing rules for working on the repo with
  Claude Code. It is useful as it is, but some rules are this site's own
  choices, such as British spelling and the strand names. Edit it to suit.
- **This README.** The introduction and the URL parity example describe the
  original site.

## 🛠 Working on it

### Setup

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env`. The first four `CONTENTFUL_*` values come from the Contentful
space (Settings, API keys). `CONTENTFUL_PREVIEW_SECRET` is any long random
string, and must match the `secret` in the space's preview URL.
`CONTENTFUL_WEBHOOK_SECRET` is another, and must match the header on the
space's purge webhook.

### Commands

| Command                 | What it does                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Development server, in the Workers runtime                                                                            |
| `npm run build`         | Type-check, then build to `dist/`                                                                                     |
| `npm run preview`       | Serve the build locally, in the Workers runtime                                                                       |
| `npm test`              | Unit tests                                                                                                            |
| `npm run check`         | Type-check only                                                                                                       |
| `npm run format`        | Format every file with Prettier                                                                                       |
| `npm run audit:a11y`    | Accessibility audit of a running site in a real browser, by hand: `SITE_URL=http://localhost:4321 npm run audit:a11y` |
| `npm run measure:bloat` | Prints the repo's bloat signals, by hand, such as what ships to readers and over-long comments                        |

`npm run preview` is the one to trust for anything the Worker does: it runs
the build in the same runtime as production.

Every pull request runs the format check, the type check and the tests on
GitHub. Cloudflare builds the branch and reports there too.

### Publishing

A publish, unpublish or delete in Contentful triggers a webhook, which calls a
Cloudflare deploy hook on `main`. That rebuilds the whole site, search index
included, so nothing waits on a separate refresh.

The webhook lives in Contentful, under Settings, Webhooks. The deploy hook
lives in Cloudflare, on the Worker's Builds settings, under Deploy Hooks. The
deploy hook's address is a secret: anyone holding it can trigger a build, so
keep it out of the repo and out of chat.

#### Instant publishing

There are two ways the site can publish, chosen by one build variable.

**`ROUTE_CACHE` unset.** Every page is a static file. A publish in Contentful
calls the deploy hook, the site rebuilds, and the change shows about 70
seconds later.

**`ROUTE_CACHE=true`.** Home, the archive, posts in both languages, and the
tag, strand and author pages are rendered on request and held in Cloudflare's
cache. A publish does two things at once:

1. Contentful calls `/api/purge`. The pages that show the changed entry are
   dropped from the cache, and the next visitor gets them rendered fresh.
   This takes seconds.
2. Contentful calls the deploy hook, as before. The rebuild rewrites what is
   still built: the search index, `feed.xml`, `sitemap.xml`, the social
   cards, and the About, Privacy, Search and not-found pages. A deploy also
   empties the whole cache, so nothing stale outlives it.

| Shows within seconds                                      | Follows with the rebuild                   |
| --------------------------------------------------------- | ------------------------------------------ |
| A new, edited or unpublished post, both languages         | The post in search results                 |
| Home, the archive, the tag index                          | The post in `feed.xml` and `sitemap.xml`   |
| The post's strand, tag and author pages                   | A new post's social card                   |
| Every page showing an edited strand, tag, author or image | About and Privacy                          |
|                                                           | Related posts and tag pills on other posts |

Each cached page is tagged with the id of every entry and image it shows, so
a change drops only the pages it reaches. The scheme is in
`src/lib/cache-tags.ts`.

#### Turning it on

1. In Cloudflare, add the secret `CONTENTFUL_WEBHOOK_SECRET`, any long random
   string, to the Worker, for production and for previews.
2. In Contentful, under Settings, Webhooks, add a webhook:
   - URL: `https://<site>/api/purge`, method `POST`.
   - Triggers: Publish, Unpublish and Delete, for Entry and for Asset. No
     others: a save or an autosave is refused.
   - Headers: add a secret header named `X-Webhook-Secret` with the same
     value as the Cloudflare secret.
   - Payload: leave the default.
3. Keep the existing deploy hook webhook. It still does the rebuild.
4. In Cloudflare, set the build variable `ROUTE_CACHE=true` and deploy.

#### Turning it off

Remove the build variable `ROUTE_CACHE`, or set it to anything but `true`, and
deploy. Every page is a static file again and `/api/purge` answers 404. The
purge webhook in Contentful then logs failures, which is harmless. No code
change is needed.

#### Checking it

```bash
curl -sI https://<site>/posts/<slug> | grep -i cf-cache-status
```

`MISS` the first time and `HIT` after means the page is held. After a publish
in Contentful the same command says `MISS` once more, and Contentful's webhook
log shows a `200` listing the tags it purged.

### Search

The search index is written at the end of every build, from built pages. A
post published in Contentful appears in search after the next build, which the
deploy hook starts on every publish.

With `ROUTE_CACHE=true` a post is not a built page, so the build also writes
each English post under `/search-source/` for the index alone. The index reads
them at the post's own address and they are deleted before anything is
deployed.

### Draft previews

In the Contentful space, set the Post preview URL to:

```
https://<site>/api/draft?secret=<CONTENTFUL_PREVIEW_SECRET>&slug={entry.fields.slug}&locale={locale}
```

The link checks the secret, starts a preview session and opens the draft at
`/preview/posts/<slug>`, or `/preview/de/posts/<slug>` for German. The "Exit
preview" button ends the session.

For the Page content type (About and Privacy), set its preview URL to:

```
https://<site>/api/draft?secret=<CONTENTFUL_PREVIEW_SECRET>&type=page&slug={entry.fields.slug}
```

It opens the draft at `/preview/pages/<slug>`. Listing pages, the home page
and the archive, are not previewed with draft posts in them.

### URL parity

```bash
node scripts/url-parity.mjs https://beuseful.net http://localhost:4321
```

Compares the live site with a local build, for use after a change that could
move a URL. It requests every path in the first site's sitemap, and every
source in this repo's `public/_redirects`, from both sites, and prints any
that answer differently.

### Indexing

A build is closed to search engines by default: every response carries
`X-Robots-Tag: noindex` and `robots.txt` disallows everything. Set
`ALLOW_INDEXING=true` on the production build only.

That switch also controls analytics. An open build renders the Cloudflare Web
Analytics beacon on public pages and adds the beacon's two hosts to the
content security policy. Closed builds, branch previews and `/preview/*`
never carry it.

### Secrets

Secrets are read from the environment and never committed. In production they
are Worker secrets (`npx wrangler secret put <NAME>`).

Cloudflare keeps runtime variables, which the Worker reads, separate from
build variables, which the build reads. The five `CONTENTFUL_*` values are
runtime secrets, and the build also needs `CONTENTFUL_SPACE_ID` and
`CONTENTFUL_ACCESS_TOKEN` as build variables.

Branch previews read runtime secrets from Previews Base. Each branch preview
takes its own copy when it is first created, so fixing Previews Base later does
not repair an existing preview.

`workers_dev` and `preview_urls` are set in `wrangler.jsonc` on purpose,
because saving settings in the dashboard can otherwise switch them off. The
`workers.dev` copy of the site is off, since beuseful.net serves it. Branch
preview addresses stay on.

Every secret named in `wrangler.jsonc` must exist before a deploy, or the
deploy is refused. That includes `CONTENTFUL_WEBHOOK_SECRET`, whether or not
`ROUTE_CACHE` is on.

## Licence

MIT. See `LICENSE.md`.
