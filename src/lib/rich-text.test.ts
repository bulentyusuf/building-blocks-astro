import { describe, it, expect, vi, afterEach } from "vitest";
import type { Document } from "@contentful/rich-text-types";
import { extractHeadings } from "./headings";
import { numericColumns, renderRichText, shortColumns } from "./rich-text";
import type { Asset, Content, EntryLink } from "./types";

const NBSP = String.fromCharCode(0x00a0);

type Mark = "bold" | "italic" | "code";
const text = (value: string, ...marks: Mark[]) => ({
  nodeType: "text",
  value,
  marks: marks.map((type) => ({ type })),
  data: {},
});
const block = (nodeType: string, ...content: unknown[]) => ({
  nodeType,
  data: {},
  content,
});
const p = (...content: unknown[]) => block("paragraph", ...content);
const h2 = (...content: unknown[]) => block("heading-2", ...content);
const link = (uri: string, label = "text") => ({
  nodeType: "hyperlink",
  data: { uri },
  content: [text(label)],
});
const embed = (nodeType: string, id: string) => ({
  nodeType,
  data: { target: { sys: { id } } },
  content: [],
});
const doc = (...content: unknown[]) =>
  ({ nodeType: "document", data: {}, content }) as unknown as Document;

function render(
  json: Document,
  {
    assets = [],
    entries = [],
    ...options
  }: {
    assets?: (Asset | null)[];
    entries?: EntryLink["block"];
  } & Partial<Parameters<typeof renderRichText>[0]> = {},
) {
  const content: Content = {
    json,
    links: { assets: { block: assets }, entries: { block: entries } },
  };
  return renderRichText({
    content,
    headings: extractHeadings(json),
    ...options,
  });
}

const ids = (html: string) =>
  [...html.matchAll(/<h2 id="([^"]*)"/g)].map((m) => m[1]);

afterEach(() => vi.restoreAllMocks());

describe("headings", () => {
  const body = doc(
    h2(text("Setup")),
    block("heading-1", text("A body h1")),
    h2(text("  ")),
    block("heading-3", text("Detail")),
    h2(text("Setup")),
    h2(text("Für Anfänger")),
  );

  it("gives each h2 the id the contents list links to, in order", () => {
    expect(ids(render(body))).toEqual(
      extractHeadings(body).map((h) => h.slug),
    );
    expect(ids(render(body))).toEqual(["setup", "setup-1", "fuer-anfaenger"]);
  });

  it("turns a body h1 into an h2 and keeps h3, neither taking an id", () => {
    const html = render(body);
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2>A body h1</h2>");
    expect(html).toContain("<h3>Detail</h3>");
  });

  it("gives an empty heading no id and no permalink", () => {
    expect(render(doc(h2(text("  "))))).toBe("<h2>  </h2>");
  });

  it("adds a permalink that is named, focusable and out of the search text", () => {
    const html = render(doc(h2(text("Setup"))));
    const anchor = /<a [^>]*href="#setup"[^>]*>/.exec(html)?.[0] ?? "";
    expect(anchor).toContain('aria-label="Permalink"');
    expect(anchor).toContain("data-pagefind-ignore");
    expect(anchor).toContain("focus-visible:opacity-100");
    // The glyph is generated content: no "#" text node inside the heading.
    expect(html.replace(/<[^>]*>/g, "")).toBe("Setup");
  });

  it("glues the last two words of a plain heading, and keeps a marked one marked", () => {
    expect(
      render(doc(h2(text("Zak McKracken and the Alien Mindbenders (1988)")))),
    ).toContain(`Mindbenders${NBSP}(1988)`);
    expect(render(doc(h2(text("An italic heading here", "italic"))))).toContain(
      "<i>An italic heading here</i>",
    );
  });

  it("stamps each non-empty h2 in order when numbered, and only then", () => {
    const stamps = (html: string) =>
      [...html.matchAll(/<span aria-hidden="true" data-pagefind-ignore[^>]*>(\d\d)<\/span>/g)].map(
        (m) => m[1],
      );
    expect(stamps(render(body, { numbered: true }))).toEqual(["01", "02", "03"]);
    expect(stamps(render(body))).toEqual([]);
  });
});

describe("paragraphs", () => {
  it("drops blank ones and keeps one holding only a link", () => {
    const html = render(doc(p(text("")), p(text("  ")), p(link("/a", "A"))));
    expect(html).toBe('<p><a href="/a">A</a></p>');
  });

  it("glues the last two words of an unmarked paragraph", () => {
    expect(render(doc(p(text("One two three four"))))).toBe(
      `<p>One two three${NBSP}four</p>`,
    );
  });

  it("keeps a single marked run marked", () => {
    expect(render(doc(p(text("npm run build", "code"))))).toBe(
      "<p><code>npm run build</code></p>",
    );
  });

  it("escapes text, so content cannot become markup", () => {
    const html = render(doc(p(text("<script>alert(1)</script> & more text"))));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a quote as a pull quote outside the prose styles", () => {
    const html = render(doc(block("blockquote", p(text("Said so.")))));
    expect(html).toMatch(/^<blockquote class="not-prose [^"]*">/);
  });
});

describe("hyperlinks", () => {
  const a = (uri: string) => render(doc(p(link(uri), text(" tail"))));

  it("renders an internal link plainly", () => {
    expect(a("/posts/hello#part")).toContain(
      '<a href="/posts/hello#part">text</a>',
    );
  });

  it("opens an external link in a new window, and says so", () => {
    const html = a("https://example.com/x");
    expect(html).toContain(
      '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">',
    );
    expect(html).toContain("(opens in a new window)");
  });

  it("degrades an unsafe URI to its text", () => {
    for (const uri of ["javascript:alert(1)", "//evil.example", "/\t/evil.example"]) {
      expect(a(uri), uri).toBe("<p>text tail</p>");
    }
  });

  it("escapes the href", () => {
    expect(a('https://example.com/?q="><script>')).toContain(
      'href="https://example.com/?q=&quot;&gt;&lt;script&gt;"',
    );
  });
});

describe("inline embeds", () => {
  it("render nothing where a leftover embed sits", () => {
    const html = render(
      doc(p(text("Before "), embed("embedded-entry-inline", "x1"), text(" after"))),
    );
    expect(html).toBe("<p>Before  after</p>");
  });
});

describe("embedded images", () => {
  const asset: Asset = {
    sys: { id: "a1" },
    url: "https://images.ctfassets.net/s/a1/h/shot.png",
    title: 'A "search" page',
    description: "Fig <1>",
    width: 900,
    height: 600,
  };
  const body = doc(embed("embedded-asset-block", "a1"));

  it("puts the title in the alt and the description in the caption, escaped", () => {
    const html = render(body, { assets: [asset] });
    expect(html).toContain('alt="A &quot;search&quot; page"');
    expect(html).toContain(">Fig &lt;1&gt;</figcaption>");
    expect(html).toContain('width="900" height="600"');
    expect(html).toContain("max-width:900px");
  });

  it("marks the figure English unless a German page translated it", () => {
    expect(render(body, { assets: [asset] })).toContain('<figure lang="en-GB"');
    expect(
      render(body, { assets: [{ ...asset, lang: "de-DE" }] }),
    ).toContain('<figure lang="de-DE"');
  });

  it("falls back to 3:2 when the asset carries no size", () => {
    const html = render(body, {
      assets: [{ ...asset, width: null, height: null }],
    });
    expect(html).toContain('width="1200" height="800"');
  });

  it("offers the enlarged view on a post and not where it is turned off", () => {
    expect(render(body, { assets: [asset] })).toContain("data-lightbox");
    expect(render(body, { assets: [asset], lightbox: false })).not.toContain(
      "data-lightbox",
    );
  });

  it("loads lazily unless it is the page's first image and asked to lead", () => {
    const two = doc(
      embed("embedded-asset-block", "a1"),
      embed("embedded-asset-block", "a1"),
    );
    expect(render(two, { assets: [asset] })).not.toContain("fetchpriority");
    const leading = render(two, { assets: [asset], prioritizeFirstImage: true });
    expect(leading.match(/fetchpriority="high"/g)).toHaveLength(1);
    expect(leading.match(/loading="lazy"/g)).toHaveLength(1);
  });

  it("skips a null item, which is what an unpublished asset returns", () => {
    expect(render(body, { assets: [null] })).toBe("");
  });

  it("warns when the title is missing or only the filename", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(body, { assets: [{ ...asset, title: null }] });
    render(body, {
      assets: [{ ...asset, title: "shot", fileName: "shot.png" }],
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("stays quiet about a missing caption", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = render(body, { assets: [{ ...asset, description: "" }] });
    expect(warn).not.toHaveBeenCalled();
    expect(html).not.toContain("<figcaption");
  });
});

describe("code blocks", () => {
  const entries: EntryLink["block"] = [
    { __typename: "CodeBlock", sys: { id: "c1" }, language: "bash", code: "ls <dir>" },
    {
      __typename: "CodeBlock",
      sys: { id: "c2" },
      language: "typescript",
      code: "const a = 1;",
      filename: "a.ts",
    },
  ];
  const body = doc(
    embed("embedded-entry-block", "c1"),
    embed("embedded-entry-block", "c2"),
  );

  it("names each scroll region by position, or by its filename", () => {
    const html = render(body, { entries });
    expect(html).toContain('aria-label="Code block 1"');
    expect(html).toContain('aria-label="a.ts"');
    expect(html.match(/tabindex="0" role="region"/g)).toHaveLength(2);
  });

  it("labels the bar with what the block holds", () => {
    const html = render(body, { entries });
    expect(html).toContain("</span>terminal</span>");
    expect(html).toContain("</span>a.ts</span>");
  });

  it("uses the highlighted markup when given, and escaped code when not", () => {
    const html = render(body, {
      entries,
      highlighted: new Map([["c2", '<pre class="shiki"><code>HL</code></pre>']]),
    });
    expect(html).toContain("<code>ls &lt;dir&gt;</code>");
    expect(html).toContain('<pre class="shiki"><code>HL</code></pre>');
  });

  it("carries a copy button that stays hidden until the page reveals it", () => {
    const html = render(body, { entries });
    expect(html.match(/<button type="button" data-copy="code"[^>]*class="[^"]*\binvisible\b/g)).toHaveLength(2);
    expect(html.match(/data-copy-source/g)).toHaveLength(2);
  });
});

describe("callouts", () => {
  const callout = (extra: object = {}): EntryLink["block"] => [
    {
      __typename: "Callout",
      sys: { id: "k1" },
      label: "Editor's <note>",
      body: { json: doc(p(text("Boxed words go here")), p(link("/x", "More"))) },
      ...extra,
    },
  ];
  const body = doc(embed("embedded-entry-block", "k1"));

  it("renders an aside named by its label, with its own text inside", () => {
    const html = render(body, { entries: callout() });
    expect(html).toContain('<aside aria-labelledby="callout-k1"');
    expect(html).toContain('<span id="callout-k1"');
    expect(html).toContain("Editor&#39;s &lt;note&gt;");
    expect(html).toContain('<a href="/x">More</a>');
  });

  it("keeps one marked Hide from search out of the index, and only that one", () => {
    expect(render(body, { entries: callout({ hideFromSearch: true }) })).toContain(
      'data-pagefind-ignore=""',
    );
    expect(render(body, { entries: callout() })).not.toContain(
      "data-pagefind-ignore",
    );
  });

  it("says so when an English callout stands in on a German page", () => {
    expect(render(body, { entries: callout({ lang: "en-GB" }) })).toContain(
      'lang="en-GB"',
    );
  });
});

describe("prompt blocks", () => {
  const prompt = (extra: object = {}): EntryLink["block"] => [
    { __typename: "PromptBlock", sys: { id: "p1" }, prompt: "Draw <this>", ...extra },
  ];
  const body = doc(embed("embedded-entry-block", "p1"));

  it("is always English, with the prompt escaped and copyable", () => {
    const html = render(body, { entries: prompt() });
    expect(html).toMatch(/^<figure lang="en-GB"/);
    expect(html).toContain("<code data-copy-source>Draw &lt;this&gt;</code>");
    expect(html).toContain('data-copy="prompt"');
    expect(html).toContain(">Prompt</span>");
  });

  it("gets the id the cover's button links to, only when it made the cover", () => {
    expect(render(body, { entries: prompt(), coverPromptId: "p1" })).toContain(
      'id="cover-prompt"',
    );
    expect(render(body, { entries: prompt(), coverPromptId: "other" })).not.toContain(
      "cover-prompt",
    );
  });

  it("shows a decorative thumbnail only when it has an image", () => {
    const withImage = render(body, {
      entries: prompt({
        image: { url: "https://images.ctfassets.net/s/i/h/t.png" },
      }),
    });
    expect(withImage).toMatch(/<span aria-hidden="true"[^>]*><img [^>]*alt=""/);
    expect(render(body, { entries: prompt() })).not.toContain("<img");
  });
});

describe("tables", () => {
  const cell = (value: string) => block("table-cell", p(text(value)));
  const head = (value: string) => block("table-header-cell", p(text(value)));
  const row = (...cells: unknown[]) => block("table-row", ...cells);
  const table = block(
    "table",
    row(head("Name"), head("Score"), head("Share"), head("Rank")),
    row(cell("First entry"), cell("1,200"), cell("45%"), cell("1")),
    row(cell("Second"), cell("—"), cell("£3.50"), cell("12")),
  );

  it("flags each column of numbers and placeholders, never one with a word", () => {
    expect(numericColumns(table as never)).toEqual([false, true, true, true]);
    expect(shortColumns(table as never)).toEqual([false, false, false, true]);
  });

  it("does not flag a column of placeholders alone", () => {
    const dashes = block("table", row(head("A")), row(cell("—")), row(cell("")));
    expect(numericColumns(dashes as never)).toEqual([false]);
  });

  it("marks every cell of a numeric column, header included, and no other", () => {
    const html = render(doc(table, table));
    expect(html.match(/<th scope="col" data-numeric/g)).toHaveLength(6);
    expect(html.match(/<td data-numeric/g)).toHaveLength(12);
    expect(html.match(/<th scope="col" class/g)).toHaveLength(2);
  });

  it("narrows the body cells of a short column and never its header", () => {
    const html = render(doc(table));
    expect(html.match(/<td[^>]*whitespace-nowrap/g)).toHaveLength(2);
    expect(html).not.toMatch(/<th[^>]*whitespace-nowrap/);
  });

  it("names each scroll region by its position", () => {
    const html = render(doc(table, table));
    expect(html).toContain('role="region" aria-label="Table 1"');
    expect(html).toContain('role="region" aria-label="Table 2"');
  });
});
