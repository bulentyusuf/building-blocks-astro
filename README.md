# Be Useful.

The source for [beuseful.net](https://beuseful.net), a personal blog about content, code, and making things with generative AI.

## 👋 About

A small, statically built blog. Posts are written and managed in a headless CMS, built with Astro, and served from Cloudflare. Public pages are plain files. The Worker runs only for draft previews.

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

## 🛠 Working on it

### Setup

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env`. The four `CONTENTFUL_*` values come from the Contentful space
(Settings, API keys). `CONTENTFUL_PREVIEW_SECRET` is any long random string,
and must match the `secret` in the space's preview URL.

### Commands

| Command           | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Development server, in the Workers runtime      |
| `npm run build`   | Type-check, then build to `dist/`               |
| `npm run preview` | Serve the build locally, in the Workers runtime |
| `npm test`        | Unit tests                                      |
| `npm run check`   | Type-check only                                 |
| `npm run format`  | Format every file with Prettier                 |

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

### Search

The search index is written at the end of every build, from the built pages.
A post published in Contentful appears in search, and anywhere else on the
site, after the next build.

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
build variables, which the build reads. The four `CONTENTFUL_*` values are
runtime secrets, and the build also needs `CONTENTFUL_SPACE_ID` and
`CONTENTFUL_ACCESS_TOKEN` as build variables.

Branch previews read runtime secrets from Previews Base. Each branch preview
takes its own copy when it is first created, so fixing Previews Base later does
not repair an existing preview.

`workers_dev` and `preview_urls` are set in `wrangler.jsonc` on purpose,
because saving settings in the dashboard can otherwise switch them off.

## Licence

MIT. See `LICENSE.md`.
