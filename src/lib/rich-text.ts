import { documentToHtmlString } from "@contentful/rich-text-html-renderer";
import type { Next } from "@contentful/rich-text-html-renderer";
import { BLOCKS, INLINES } from "@contentful/rich-text-types";
import type { Block, Inline } from "@contentful/rich-text-types";
import { DEFAULT_LOCALE } from "./constants";
import type { Heading } from "./headings";
import { attributes, escapeHtml } from "./html";
import { fixedSource, loadingAttributes, responsiveSource } from "./image";
import { present } from "./links";
import { isPlaceholderTitle } from "./placeholder-title";
import { resolveHyperlink } from "./rich-text-link";
import type { Asset, Callout, CodeBlock, Content, PromptBlock } from "./types";
import { widont } from "./typography";

// Contentful rich text to an HTML string, through Contentful's own renderer
// with this site's markup for each node. Everything interpolated is escaped.

type RichNode = Block | Inline;

function plainText(node: RichNode): string {
  if (!node?.content) return "";
  return node.content
    .map((child) =>
      child.nodeType === "text" ? child.value : plainText(child as RichNode),
    )
    .join("");
}

// A column is numeric when every body cell is a number or a placeholder dash,
// and at least one is a number. Numeric columns right-align in tabular figures,
// header included. Per column, because alignment is a column property.
const NUMERIC_CELL = /^[+\-−]?[#£$€]?\d[\d,]*(\.\d+)?%?$/;
const PLACEHOLDER_CELL = /^[-–—]?$/;

// A column of bare numbers or percentages, signed or not, takes the narrowest
// width instead of an equal share. Per column, so one longer value keeps it normal.
const SHORT_CELL = /^[+\-−]?\d+(\.\d+)?%?$/;

export function numericColumns(table: RichNode): boolean[] {
  return matchingColumns(table, NUMERIC_CELL);
}

export function shortColumns(table: RichNode): boolean[] {
  return matchingColumns(table, SHORT_CELL);
}

function matchingColumns(table: RichNode, cellPattern: RegExp): boolean[] {
  const columns: string[][] = [];
  for (const row of table.content ?? []) {
    const cells = (row as Block).content ?? [];
    cells.forEach((cell, i) => {
      if (cell.nodeType !== BLOCKS.TABLE_CELL) return;
      (columns[i] ??= []).push(plainText(cell as Block).trim());
    });
  }
  return columns.map(
    (values = []) =>
      values.some((v) => cellPattern.test(v)) &&
      values.every((v) => cellPattern.test(v) || PLACEHOLDER_CELL.test(v)),
  );
}

// widont() rewrites a run as a string, so only an unmarked one qualifies. A
// lone code, bold or italic run would otherwise lose its mark.
function plainRun(node: RichNode): boolean {
  const only = node.content?.length === 1 ? node.content[0] : undefined;
  return (
    only?.nodeType === "text" &&
    ((only as { marks?: unknown[] }).marks?.length ?? 0) === 0
  );
}

const NEW_WINDOW_HINT =
  '<span class="sr-only" data-pagefind-ignore> (opens in a new window)</span>';

// Invisible until the page's script reveals it, so with scripts off nothing
// announces a button that does nothing, and its arrival moves nothing.
function copyButton(label: string): string {
  return `<button type="button" data-copy="${label}" data-pagefind-ignore aria-label="Copy ${label}" class="tap-area invisible rounded-md border-[1.5px] border-white/60 bg-transparent px-2 py-1 font-mono text-xs text-white transition-colors hover:border-white hover:bg-white/10">Copy</button><span class="sr-only" role="status" aria-live="polite"></span>`;
}

const FIGURE_IMAGE =
  "mx-auto w-full h-auto rounded-content border-2 border-gray-300 dark:border-brand-dark/15";

function figure(
  asset: Asset,
  { lightbox, priority }: { lightbox: boolean; priority: boolean },
): string {
  // `title` is the alt text, so a filing label there reaches screen readers.
  // No warning for a missing description: that only means no caption.
  if (isPlaceholderTitle(asset.title, asset.fileName)) {
    console.warn(
      `[rich-text] Embedded asset ${asset.sys.id} has no usable title (${JSON.stringify(asset.title ?? null)}), so its alt text does not describe the image.`,
    );
  }

  // 3:2 when the asset reports no size.
  const width = asset.width ?? 1200;
  const height = asset.height ?? 800;
  const image = `<img${attributes({
    ...responsiveSource(
      asset.url,
      "(width < 48rem) calc(100vw - 2rem), min(calc(100vw - 12.25rem), 42rem)",
    ),
    alt: asset.title ?? "",
    width,
    height,
    ...loadingAttributes(priority),
    class: FIGURE_IMAGE,
    // Never wider than the asset, or a narrow screenshot stretches and blurs.
    style: `max-width:${width}px`,
    // The page's script offers the enlarged view where it would be larger.
    "data-lightbox": lightbox,
  })}>`;
  const caption = asset.description
    ? `<figcaption class="text-[0.875em] italic text-brand-muted mt-1.5 text-center">${escapeHtml(asset.description)}</figcaption>`
    : "";

  // not-prose: the plugin's own figure margins would swamp the caption gap.
  // Alt and caption are English unless a German page translated both.
  return `<figure${attributes({ lang: asset.lang ?? DEFAULT_LOCALE })} class="not-prose my-8">${image}${caption}</figure>`;
}

function codeBlock(
  entry: CodeBlock,
  html: string | undefined,
  position: number,
): string {
  // A filename names the region better than a number.
  const label = entry.filename || `Code block ${position}`;
  // The bar's mono label: the filename, else what the block holds.
  const tag =
    entry.filename ||
    (entry.language === "bash" ? "terminal" : entry.language || "code");
  const region = attributes({
    tabindex: 0,
    role: "region",
    "aria-label": label,
    "data-copy-source": true,
  });
  const body = html
    ? `<div${region} class="overflow-x-auto text-[0.78em] [&_pre]:m-0 [&_pre]:p-4 [&_pre]:w-max [&_pre]:min-w-full focus-visible:outline-offset-[-2px]">${html}</div>`
    : `<pre${region} class="overflow-x-auto p-4 text-[0.78em] text-white/90 focus-visible:outline-offset-[-2px]"><code>${escapeHtml(entry.code)}</code></pre>`;

  // An ink block with a bar, flat. A grey edge in dark mode keeps it off the
  // page.
  return `<div data-copy-root class="not-prose my-8 overflow-hidden rounded-content bg-surface-dark dark:border-2 dark:border-brand-muted"><div class="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-2 pointer-coarse:py-2.5 font-mono text-xs font-medium text-white/75"><span><span aria-hidden="true">// </span>${escapeHtml(tag)}</span>${copyButton("code")}</div>${body}</div>`;
}

function callout(entry: Callout): string {
  const labelId = `callout-${entry.sys.id}`;
  // Text, links and lists only: a callout carries no embeds of its own.
  const body = renderRichText({
    content: { json: entry.body.json, links: { assets: { block: [] } } },
    headings: [],
    lightbox: false,
  });
  // Marks exactly the text the author boxed: 2px ink, cream, flat and straight.
  return `<aside${attributes({
    "aria-labelledby": labelId,
    lang: entry.lang,
    "data-pagefind-ignore": entry.hideFromSearch ? "" : undefined,
  })} class="my-8 rounded-content border-2 border-outline bg-brand-bg px-5 py-5 text-[0.94em] sm:px-6 [&_p:first-of-type]:mt-0 [&_p:last-child]:mb-0"><span${attributes({ id: labelId })} class="mb-2 block font-display text-[1.06em] font-bold leading-snug text-brand-dark">${escapeHtml(entry.label)}</span>${body}</aside>`;
}

function promptBlock(entry: PromptBlock, isCoverPrompt: boolean): string {
  const thumb = entry.image?.url;
  // From 480px the thumbnail and label share a header row and the prompt runs
  // the full width below. The figcaption stays first: it names the figure.
  const side = thumb ? " min-[480px]:col-start-2 min-[480px]:row-start-1" : "";
  const below = thumb ? " min-[480px]:col-span-2" : "";
  const layout = thumb
    ? " min-[480px]:grid-cols-[7.5rem_1fr] min-[480px]:items-center min-[480px]:gap-y-4"
    : "";
  const thumbnail = thumb
    ? `<span aria-hidden="true" class="relative mb-2 block aspect-video w-30 overflow-hidden rounded-nested border-2 border-brand-bg min-[480px]:col-start-1 min-[480px]:row-start-1 min-[480px]:mb-0 dark:border-white"><img${attributes(
        {
          ...fixedSource(thumb, 120),
          alt: "",
          ...loadingAttributes(false),
          class: "absolute inset-0 size-full object-cover",
        },
      )}></span>`
    : "";

  // A fixed id: the cover's button links to this literal. Never localised, so
  // always English, even in a German article. Indexed at a low weight, so a
  // prompt match does not anchor a search excerpt.
  return `<figure${attributes({
    id: isCoverPrompt ? "cover-prompt" : undefined,
    lang: DEFAULT_LOCALE,
    "data-pagefind-weight": "0.1",
    "data-copy-root": true,
  })} class="not-prose mt-10 mb-6 grid gap-x-5 gap-y-2 rounded-content bg-surface-dark px-5 py-6 text-white last:mb-0 sm:px-7 dark:border-2 dark:border-brand-muted${layout}"><figcaption class="flex items-center justify-between gap-3${side}"><span class="min-w-0 flex-1 font-display text-base font-bold leading-snug text-prompt-label">${escapeHtml(entry.label || "Prompt")}</span>${copyButton("prompt")}</figcaption>${thumbnail}<div class="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed${below}"><code data-copy-source>${escapeHtml(entry.prompt)}</code></div></figure>`;
}

export function renderRichText({
  content,
  headings,
  highlighted,
  lightbox = true,
  prioritizeFirstImage = false,
  coverPromptId,
  numbered = false,
}: {
  content: Content;
  headings: Heading[];
  highlighted?: Map<string, string>;
  lightbox?: boolean;
  prioritizeFirstImage?: boolean;
  // The prompt block that made the cover gets the id the cover's button links to.
  coverPromptId?: string;
  // Stamps each H2 with its number, matching the numbered contents list.
  numbered?: boolean;
}): string {
  // One index per non-empty H2, pairing each with extractHeadings()' slug. The
  // empty-heading skip must mirror extractHeadings(); a test holds them.
  let headingIndex = 0;
  // Pages prioritise their first image; on posts the cover loads first.
  let assetIndex = 0;
  // A scroll region's name is its position, never a summary of its contents.
  let tableIndex = 0;
  let codeBlockIndex = 0;

  // The post title is the only h1, so body h1s become h2s. H3 to H6 keep their
  // levels and stay out of the contents list.
  const coalesceToH2 = (node: RichNode, next: Next) =>
    `<h2>${next(node.content)}</h2>`;

  return documentToHtmlString(content.json, {
    renderNode: {
      [BLOCKS.HEADING_2]: (node, next) => {
        const text = plainText(node).trim();
        if (!text) return `<h2>${next(node.content)}</h2>`;
        const number = ++headingIndex;
        const slug = headings[number - 1]?.slug;
        // Just "Permalink": inside the h2, a longer name would repeat the
        // heading. The glyph is generated content, so it stays out of the
        // search excerpt. Hidden below md and on touch: it appears on hover.
        const permalink = slug
          ? `<a${attributes({ href: `#${slug}` })} data-pagefind-ignore aria-label="Permalink" class="ml-2 -mr-[0.75em] inline-block max-md:hidden pointer-coarse:hidden align-middle text-brand-muted no-underline opacity-0 transition-opacity duration-200 group-hover/heading:opacity-100 focus-visible:opacity-100 hover:text-brand-crimson"><span aria-hidden="true" class="after:content-['#']"></span></a>`
          : "";
        const body = `${plainRun(node) ? escapeHtml(widont(text)) : next(node.content)}${permalink}`;
        const id = attributes({ id: slug });
        // No scroll margin on a heading: the offset is html's alone.
        if (!numbered) return `<h2${id} class="group/heading">${body}</h2>`;
        // A rubber stamp, so it tilts, with a hanging indent beside it. Hidden
        // and unindexed: the number is position, not part of the heading.
        return `<h2${id} class="group/heading flex items-start gap-3.5"><span aria-hidden="true" data-pagefind-ignore class="-mt-[0.15em] inline-flex size-[2.625rem] shrink-0 -rotate-8 items-center justify-center rounded-full bg-brand-dark font-ui text-sm font-bold tracking-normal tabular-nums text-brand-bg">${String(number).padStart(2, "0")}</span><span class="min-w-0">${body}</span></h2>`;
      },
      [BLOCKS.HEADING_1]: coalesceToH2,
      [BLOCKS.PARAGRAPH]: (node, next) => {
        // Contentful's editor keeps an empty paragraph after a trailing embed,
        // which would cost the embed its last:mb-0. Drop blank ones.
        const blank = node.content.every(
          (c) => c.nodeType === "text" && !c.value.trim(),
        );
        if (blank) return "";
        const text = plainRun(node)
          ? (node.content[0] as { value?: string }).value?.trim()
          : undefined;
        return `<p>${text ? escapeHtml(widont(text)) : next(node.content)}</p>`;
      },
      [BLOCKS.QUOTE]: (node, next) =>
        // Pull quote. not-prose so the plugin's blockquote styles stay out.
        `<blockquote class="not-prose my-9 border-l-4 border-brand-crimson pl-5 font-display text-2xl font-normal leading-snug text-brand-dark md:text-[1.75rem] [&_p]:m-0 [&_p+p]:mt-4">${next(node.content)}</blockquote>`,
      [BLOCKS.TABLE]: (node, next) => {
        const position = ++tableIndex;
        const numeric = numericColumns(node);
        const short = shortColumns(node);
        const rows = (node.content as Block[])
          .map((row) => {
            const cells = (row.content as Block[])
              .map((cell, i) => {
                const flag = attributes({ "data-numeric": numeric[i] });
                const narrow = short[i] ? " w-[1%] whitespace-nowrap" : "";
                // Contentful puts header cells only in the first row, so
                // scope=col is right.
                if (cell.nodeType === BLOCKS.TABLE_HEADER_CELL) {
                  return `<th scope="col"${flag} class="border-b border-table-edge bg-table-header px-3 py-3 text-start font-semibold data-numeric:text-end${narrow}">${next(cell.content)}</th>`;
                }
                return `<td${flag} class="px-3 py-3 text-start align-top data-numeric:text-end data-numeric:tabular-nums${narrow}">${next(cell.content)}</td>`;
              })
              .join("");
            // The last row drops its rule so it cannot double the edge.
            return `<tr class="border-b border-table-rule last:border-b-0">${cells}</tr>`;
          })
          .join("");
        // A focusable, named scroll region: Contentful gives no column hints
        // to reflow from. Two wrappers, because one element cannot both clip
        // to the radius and scroll.
        return `<div class="not-prose my-8 overflow-hidden rounded-content border border-table-edge"><div class="overflow-x-auto" tabindex="0" role="region" aria-label="Table ${position}"><table class="w-full border-collapse text-[0.9em]"><tbody>${rows}</tbody></table></div></div>`;
      },
      [BLOCKS.EMBEDDED_ASSET]: (node) => {
        const id = node.data.target.sys.id;
        const asset = content.links.assets.block
          ?.filter(present)
          .find((a) => a.sys.id === id);
        if (!asset?.url) return "";
        return figure(asset, {
          lightbox,
          priority: prioritizeFirstImage && assetIndex++ === 0,
        });
      },
      [BLOCKS.EMBEDDED_ENTRY]: (node) => {
        const id = node.data.target.sys.id;
        const entry = content.links.entries?.block
          ?.filter(present)
          .find((e) => e.sys.id === id);
        if (!entry) return "";
        if (entry.__typename === "CodeBlock") {
          return codeBlock(entry, highlighted?.get(id), ++codeBlockIndex);
        }
        if (entry.__typename === "Callout") return callout(entry);
        if (entry.__typename === "PromptBlock") {
          return promptBlock(entry, entry.sys.id === coverPromptId);
        }
        return "";
      },
      // There are no sidenotes: nothing renders inline, and a leftover embed
      // must not print the library's placeholder text.
      [INLINES.EMBEDDED_ENTRY]: () => "",
      [INLINES.EMBEDDED_RESOURCE]: () => "",
      [INLINES.ASSET_HYPERLINK]: (node, next) => next(node.content),
      [INLINES.ENTRY_HYPERLINK]: (node, next) => next(node.content),
      [INLINES.RESOURCE_HYPERLINK]: (node, next) => next(node.content),
      // The one hyperlink renderer for every rich-text field.
      [INLINES.HYPERLINK]: (node, next) => {
        const children = next(node.content);
        const link = resolveHyperlink(node.data.uri);
        if (!link) return children;
        const href = attributes({ href: link.href });
        return link.external
          ? `<a${href} target="_blank" rel="noopener noreferrer">${children}${NEW_WINDOW_HINT}</a>`
          : `<a${href}>${children}</a>`;
      },
    },
  });
}
