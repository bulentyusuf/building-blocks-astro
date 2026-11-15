# building-blocks-astro

Building blocks for building blogs, redux. The source of
[beuseful.net](https://beuseful.net): an Astro site on Cloudflare Workers,
with content from Contentful.

Public pages are built once and served as static files, each post's social
card included. The Worker runs only for draft previews.

## Setup

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env`. The four `CONTENTFUL_*` values come from the Contentful space
(Settings, API keys). `CONTENTFUL_PREVIEW_SECRET` is any long random string,
and must match the `secret` in the space's preview URL.

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

## Search

The search index is written at the end of every build, from the built pages.
A post published in Contentful appears in search, and anywhere else on the
site, after the next build.

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

## Licence

MIT. See `LICENSE.md`.
