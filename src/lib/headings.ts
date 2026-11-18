import type { Document, Node, Text } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";

export interface Heading {
  text: string;
  slug: string;
}

// Below three headings a contents list is as long as the article.
export const MIN_HEADINGS = 3;

// The one answer to "does this post get a ToC?", shared by the page's margin
// and the ToC's render guard so they cannot disagree.
export function hasTableOfContents(headings: Heading[]): boolean {
  return headings.length >= MIN_HEADINGS;
}

// Strip a listicle ordinal ("1. Title") so a renumber keeps the fragment.
// Trailing punctuation is required, so "2024 in review" is left alone.
function stripLeadingOrdinal(text: string): string {
  const stripped = text.replace(/^\d+[.)]\s+/, "");
  return stripped.trim() ? stripped : text;
}

// Spelled out before the diacritic strip, which would drop ß and leave ü as u.
const GERMAN_LETTERS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
  ẞ: "SS",
};

// Punctuation is stripped: an apostrophe in an id makes a fragile fragment.
function slugify(text: string): string {
  return stripLeadingOrdinal(text)
    .normalize("NFC")
    .replace(/[äöüÄÖÜßẞ]/g, (letter) => GERMAN_LETTERS[letter])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nodeText(node: Node): string {
  const anyNode = node as unknown as { content?: Array<Text | Node> };
  if (!anyNode.content) return "";
  return anyNode.content
    .map((child) => {
      if ((child as Text).nodeType === "text") return (child as Text).value;
      return nodeText(child as Node);
    })
    .join("");
}

/** Ids a post page gives its own elements, which no heading may take. */
export const PAGE_IDS = [
  "main",
  "lightbox",
  "lightbox-caption",
  "cover-prompt",
];

// Appends -1, -2 on repeats, skipping any id already taken, so "Setup 1"
// after two "Setup"s cannot collide. The renderer reads these slugs.
function createSlugger() {
  const taken = new Set(PAGE_IDS);
  const next = new Map<string, number>();
  return function nextSlug(text: string): string {
    const base = slugify(text) || "section";
    let count = next.get(base) ?? 0;
    let slug = count === 0 ? base : `${base}-${count}`;
    while (taken.has(slug)) slug = `${base}-${++count}`;
    next.set(base, count + 1);
    taken.add(slug);
    return slug;
  };
}

// H2 only: the content contract is "H2 is a section heading".
export function extractHeadings(document: Document): Heading[] {
  const slugger = createSlugger();
  const headings: Heading[] = [];
  for (const node of document.content) {
    if (node.nodeType === BLOCKS.HEADING_2) {
      const text = nodeText(node).trim();
      if (!text) continue;
      headings.push({ text, slug: slugger(text) });
    }
  }
  return headings;
}
