import type { Document } from "@contentful/rich-text-types";
import type {
  Asset,
  Author,
  Category,
  Content,
  EntryLink,
  ListPost,
  Page,
  Post,
  Tag,
} from "../lib/types";

// The site's content for the browser tests, in the shapes Contentful returns.
// Enough of it that every page shows its full state: more than six posts, so
// listings run to rows, and a post body with one of everything.

const image = (name: string) =>
  `https://images.ctfassets.net/space/${name}/hash/${name}.jpg`;

// A real description, not a filename: a placeholder title renders empty alt.
const cover = (name: string) => ({
  url: image(name),
  title: "A hand-lettered sign in a shop window",
  fileName: `${name}.jpg`,
});

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
const h2 = (value: string) => block("heading-2", text(value));
const link = (uri: string, label: string) => ({
  nodeType: "hyperlink",
  data: { uri },
  content: [text(label)],
});
const embed = (nodeType: string, id: string) => ({
  nodeType,
  data: { target: { sys: { id } } },
  content: [],
});
const row = (cell: string, ...values: string[]) =>
  block("table-row", ...values.map((value) => block(cell, p(text(value)))));
const doc = (...content: unknown[]) =>
  ({ nodeType: "document", data: {}, content }) as unknown as Document;

const content = (
  json: Document,
  assets: Asset[] = [],
  entries: EntryLink["block"] = [],
): Content => ({
  json,
  links: { assets: { block: assets }, entries: { block: entries } },
});

const FILLER =
  "A paragraph of body copy, long enough to read as an article rather than a stub, so the page has a real column to measure and a real distance to scroll.";

export const TAGS: Tag[] = [
  { name: "Design", slug: "design", description: "How things get made." },
  { name: "Retro", slug: "retro", description: "Old machines, still running." },
];
// On one post only, so below the threshold: no pill and no page.
const LONELY_TAG: Tag = { name: "Lonely", slug: "lonely" };

export const CATEGORIES: Category[] = [
  { name: "Blogging", slug: "blogging", description: "Building the site." },
  { name: "Films", slug: "films", description: "Things on screens." },
  {
    name: "Games & Gadgets",
    slug: "games-and-gadgets",
    description: "Things with buttons.",
  },
];

export const AUTHORS: Author[] = [
  {
    name: "Bulent Yusuf",
    slug: "bulent-yusuf",
    picture: { url: image("bulent") },
    bio: content(doc(p(text("Writes about content, code and generative AI.")))),
  },
  {
    name: "Genial Yeti",
    slug: "genial-yeti",
    picture: null,
    bio: content(doc(p(text("A yeti. Reviews the pull requests.")))),
  },
];
const [BULENT, YETI] = AUTHORS;
const listAuthor = ({ name, slug, picture }: Author) => ({
  name,
  slug,
  picture,
});

// Nine posts, newest first, across two years and all three strands. Seven are
// in Blogging and eight carry Design, so both of those pages run past six.
const LIST: [slug: string, title: string, date: string, strand: number][] = [
  ["first-post", "The first post, with one of everything", "2026-03-02", 0],
  ["second-post", "A second post about old machines", "2026-02-11", 1],
  ["third-post", "The third post", "2026-01-20", 0],
  ["fourth-post", "A fourth post with a rather longer title", "2025-12-24", 2],
  ["fifth-post", "The fifth post", "2025-11-30", 0],
  ["sixth-post", "The sixth post", "2025-10-12", 0],
  ["seventh-post", "The seventh post", "2025-09-01", 0],
  ["eighth-post", "The eighth post", "2025-08-15", 0],
  ["ninth-post", "The ninth post", "2025-07-04", 0],
];

export const POSTS: ListPost[] = LIST.map(([slug, title, date, strand], i) => ({
  slug,
  title,
  date: `${date}T00:00:00.000Z`,
  excerpt: `Everything worth knowing about ${title.toLowerCase()}, in a sentence long enough to wrap.`,
  coverImage: cover(slug),
  category: CATEGORIES[strand],
  tagsCollection: {
    items: [
      ...(i < 8 ? [TAGS[0]] : []),
      ...(i < 2 ? [TAGS[1]] : []),
      ...(i === 0 ? [LONELY_TAG] : []),
    ],
  },
  authorsCollection: {
    items: [listAuthor(BULENT), ...(i < 2 ? [listAuthor(YETI)] : [])],
  },
}));

export const GERMAN_SLUGS = ["first-post"];

/** The body pictures, by the name their files carry: two photographs worth
 *  enlarging, and a screenshot barely wider than the column. */
export const LANDSCAPE = "landscape";
export const PANORAMA = "panorama";
export const SCREENSHOT = "screenshot";

const ASSETS: Asset[] = [
  {
    sys: { id: LANDSCAPE },
    url: image(LANDSCAPE),
    title: "A desk with two monitors and a mechanical keyboard",
    description: "Where the site gets written.",
    fileName: "desk.jpg",
    width: 2400,
    height: 1600,
  },
  {
    sys: { id: PANORAMA },
    url: image(PANORAMA),
    title: "A long bookshelf, end to end",
    // No caption, so the enlarged view is named by the alt.
    description: "",
    fileName: "shelf.jpg",
    width: 2400,
    height: 1200,
  },
  {
    sys: { id: SCREENSHOT },
    url: image(SCREENSHOT),
    title: "The editor with one entry open",
    description: "Not much wider than the column.",
    fileName: "editor.png",
    width: 800,
    height: 500,
  },
];

const ENTRIES: EntryLink["block"] = [
  {
    __typename: "CodeBlock",
    sys: { id: "code-named" },
    language: "ts",
    filename: "src/lib/example.ts",
    code: 'export const greeting = "hello";\n// A comment, the dimmest thing in the block.\n',
  },
  {
    __typename: "CodeBlock",
    sys: { id: "code-bare" },
    language: "bash",
    code: "npm run build && npm test -- --reporter=verbose --a-flag-long-enough-to-scroll-sideways-on-a-phone",
  },
  {
    __typename: "PromptBlock",
    sys: { id: "prompt-cover" },
    label: "The prompt behind this cover",
    prompt: "An editorial illustration of a shop window, flat colour, grain.",
    image: { url: image("first-post") },
  },
  {
    __typename: "Callout",
    sys: { id: "callout" },
    label: "Editor's note",
    body: { json: doc(p(text("This post was updated after publication."))) },
    hideFromSearch: true,
  },
];

const body = (german: boolean) =>
  doc(
    p(
      text(german ? "Ein Absatz mit einem " : "An opening paragraph with an "),
      link("https://example.com/elsewhere", german ? "externen" : "external"),
      text(german ? " und einem " : " link and an "),
      link("/archive", german ? "internen" : "internal"),
      text(german ? " Link. " : " one. "),
      text(FILLER),
    ),
    h2(german ? "Was ist ein Baustein?" : "What is a building block?"),
    p(text(FILLER)),
    embed("embedded-asset-block", LANDSCAPE),
    p(text(FILLER)),
    p(
      text("An unbreakable string in inline code: "),
      text(
        "https://example.com/a/very/long/path/that/does/not/break/anywhere/at/all/on/a/phone/screen",
        "code",
      ),
      text("."),
    ),
    h2(german ? "Warum es schwer ist" : "Why it is hard"),
    p(text(FILLER)),
    embed("embedded-entry-block", "code-named"),
    p(text(FILLER)),
    embed("embedded-entry-block", "code-bare"),
    block("heading-3", text("A detail")),
    p(text(FILLER)),
    block(
      "table",
      row("table-header-cell", "Machine", "Year", "Price"),
      row("table-cell", "Amiga 500", "1987", "£499"),
      row("table-cell", "Atari ST", "1985", "£749"),
    ),
    h2(german ? "Die Bilder" : "The pictures"),
    p(text(FILLER)),
    embed("embedded-asset-block", PANORAMA),
    p(text(FILLER)),
    embed("embedded-asset-block", SCREENSHOT),
    block("blockquote", p(text("A pull quote, set apart from the prose."))),
    embed("embedded-entry-block", "callout"),
    h2(german ? "Zum Schluss" : "In closing"),
    p(text(FILLER)),
    p(text(FILLER)),
    block(
      "unordered-list",
      block("list-item", p(text("One thing."))),
      block("list-item", p(text("Another thing."))),
    ),
    embed("embedded-entry-block", "prompt-cover"),
    p(text(FILLER)),
  );

const fullPost = (german: boolean): Post => ({
  ...POSTS[0],
  ...(german && {
    title: "Der erste Beitrag, mit einem von allem",
    excerpt: "Alles Wissenswerte über den ersten Beitrag, in einem Satz.",
  }),
  updatedDate: "2026-03-09T00:00:00.000Z",
  content: content(body(german), ASSETS, ENTRIES),
  authorsCollection: { items: [BULENT, YETI] },
});

const PAGES: Page[] = ["about", "privacy"].map((slug) => ({
  slug,
  title: slug === "about" ? "About" : "Privacy",
  sys: { publishedAt: "2026-01-05T00:00:00.000Z", firstPublishedAt: null },
  body: content(
    doc(
      p(text(FILLER)),
      h2("What you'll find here"),
      p(text(FILLER), link("/archive", " The archive"), text(" has the rest.")),
    ),
  ),
}));

const morePosts = POSTS.slice(1, 3);

/** Stands in for src/lib/api.ts. Every fetcher, with nothing fetched. */
export const api = {
  getAllPosts: async () => POSTS,
  getPost: async (slug: string) =>
    slug === POSTS[0].slug ? fullPost(false) : undefined,
  getPostAndMorePosts: async (slug: string) => ({
    post: slug === POSTS[0].slug ? fullPost(false) : undefined,
    morePosts,
  }),
  getGermanPostSlugs: async () => GERMAN_SLUGS,
  getGermanPostAndMorePosts: async (slug: string) => ({
    post: GERMAN_SLUGS.includes(slug) ? fullPost(true) : undefined,
    morePosts,
  }),
  getPage: async (slug: string) => PAGES.find((page) => page.slug === slug),
  getAllPages: async () => PAGES,
  getTagBySlug: async (slug: string) => TAGS.find((tag) => tag.slug === slug),
  getAllCategories: async () => CATEGORIES,
  getCategoryBySlug: async (slug: string) =>
    CATEGORIES.find((category) => category.slug === slug),
  getAuthorBySlug: async (slug: string) =>
    AUTHORS.find((author) => author.slug === slug),
  getAllAuthors: async () => AUTHORS,
};
