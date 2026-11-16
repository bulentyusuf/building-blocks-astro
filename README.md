# building-blocks-astro

Building blocks for building blogs, redux. The source of
[beuseful.net](https://beuseful.net): an Astro site on Cloudflare Workers,
with content from Contentful.

By default public pages are built once and served as static files, each post's
social card included, and the Worker runs only for draft previews. With
`ROUTE_CACHE=true` the pages that show posts are rendered on request and held
in Cloudflare's cache instead, so a publish shows within seconds. See
[Publishing](#publishing).

## Setup

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

## Commands

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

## Publishing

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

### Turning it on

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

### Turning it off

Remove the build variable `ROUTE_CACHE`, or set it to anything but `true`, and
deploy. Every page is a static file again and `/api/purge` answers 404. The
purge webhook in Contentful then logs failures, which is harmless. No code
change is needed.

### Checking it

```bash
curl -sI https://<site>/posts/<slug> | grep -i cf-cache-status
```

`MISS` the first time and `HIT` after means the page is held. After a publish
in Contentful the same command says `MISS` once more, and Contentful's webhook
log shows a `200` listing the tags it purged.

## Search

The search index is written at the end of every build, from built pages. A
post published in Contentful appears in search after the next build, which the
deploy hook starts on every publish.

With `ROUTE_CACHE=true` a post is not a built page, so the build also writes
each English post under `/search-source/` for the index alone. The index reads
them at the post's own address and they are deleted before anything is
deployed.

## Draft previews

In the Contentful space, set the Post preview URL to:

```
https://<site>/api/draft?secret=<CONTENTFUL_PREVIEW_SECRET>&slug={entry.fields.slug}&locale={locale}
```

The link checks the secret, starts a preview session and opens the draft at
`/preview/posts/<slug>`, or `/preview/de/posts/<slug>` for German. The "Exit
preview" button ends the session.

## URL parity

```bash
node scripts/url-parity.mjs https://beuseful.net http://localhost:4321
```

Requests every path in the first site's sitemap from both sites and prints any
that answer differently. A third argument names a config module whose
`redirects()` sources are checked too.

## Indexing

A build is closed to search engines by default: every response carries
`X-Robots-Tag: noindex` and `robots.txt` disallows everything. Set
`ALLOW_INDEXING=true` on the production build only.

## Secrets

Secrets are read from the environment and never committed. In production they
are Worker secrets (`npx wrangler secret put <NAME>`), and the build needs
`CONTENTFUL_SPACE_ID` and `CONTENTFUL_ACCESS_TOKEN` as build variables.

Every secret named in `wrangler.jsonc` must exist before a deploy, or the
deploy is refused. That includes `CONTENTFUL_WEBHOOK_SECRET`, whether or not
`ROUTE_CACHE` is on.

## Licence

MIT. See `LICENSE.md`.
