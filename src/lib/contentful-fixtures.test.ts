import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_AUTHORS } from "./constants";
import { MIN_HEADINGS } from "./headings";

// The template a fork imports: the content model and the example content.
// A query that asks for a type or field the model lacks fails whole, with a
// 400, so a fork built on a drifted export has no site at all.

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

type ContentType = {
  sys: { id: string; publishedVersion?: number };
  fields: {
    id: string;
    validations?: { size?: { min?: number; max?: number } }[];
  }[];
};
type Export = {
  contentTypes: ContentType[];
  editorInterfaces?: { sys: { contentType: { sys: { id: string } } } }[];
  locales?: { code: string; default?: boolean }[];
};

const exportData: Export = JSON.parse(read("contentful/export.json"));
const seedData = JSON.parse(read("contentful/seed.json"));
const apiSource = read("src/lib/api.ts");

const defaultLocale = exportData.locales?.find((l) => l.default)?.code;
const typeIds = new Set(exportData.contentTypes.map((ct) => ct.sys.id));
const fieldsOf = (typeId: string) =>
  new Set(
    exportData.contentTypes
      .find((ct) => ct.sys.id === typeId)
      ?.fields.map((f) => f.id),
  );

// GraphQL type names are PascalCase; content type ids are camelCase.
const typeIdOf = (name: string) => name[0].toLowerCase() + name.slice(1);

/** The fields selected directly in a selection set, not in nested ones. */
function topLevelFields(selection: string): string[] {
  const flat = selection
    .replace(/#.*$/gm, "")
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\.\.\.\s*on\s+\w+/g, "");
  const fields: string[] = [];
  let depth = 0;
  for (const token of flat.match(/[{}]|[A-Za-z_]\w*/g) ?? []) {
    if (token === "{") depth++;
    else if (token === "}") depth--;
    else if (depth === 0) fields.push(token);
  }
  // `sys` and `__typename` are GraphQL's, not the content model's.
  return fields.filter((f) => f !== "sys" && !f.startsWith("__"));
}

/** The body of the braces that open at `start`. */
function braced(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) {
      return source.slice(start + 1, i);
    }
  }
  return "";
}

// Which content type each shared fragment is selected against. Every
// `*_GRAPHQL_FIELDS` constant must be listed, so a new one is never skipped.
const FRAGMENTS: Record<string, string> = {
  POST_GRAPHQL_FIELDS: "post",
  LIST_GRAPHQL_FIELDS: "post",
  PAGE_GRAPHQL_FIELDS: "page",
};

/** Each `... on X` in the source whose type the export lacks. */
function missingTypes(source: string): string[] {
  const names = [...source.matchAll(/\.\.\. on ([A-Z]\w*)/g)].map((m) => m[1]);
  return [...new Set(names)].filter((name) => !typeIds.has(typeIdOf(name)));
}

/** Each selected field the export lacks, as `type.field`. */
function missingFields(source: string): string[] {
  const selections: [string, string][] = [];
  for (const [constant, typeId] of Object.entries(FRAGMENTS)) {
    const body = new RegExp(`const ${constant} = \`([\\s\\S]*?)\``).exec(
      source,
    )?.[1];
    if (body === undefined) return [`${constant} not found`];
    selections.push([typeId, body]);
  }
  for (const match of source.matchAll(/\.\.\. on ([A-Z]\w*)\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    selections.push([typeIdOf(match[1]), braced(source, open)]);
  }
  return selections.flatMap(([typeId, body]) => {
    const fields = fieldsOf(typeId);
    // Contentful names an Array field's collection `<field>Collection`.
    return topLevelFields(body)
      .map((f) => f.replace(/Collection$/, ""))
      .filter((f) => !fields.has(f))
      .map((f) => `${typeId}.${f}`);
  });
}

describe("the content model, contentful/export.json", () => {
  it("has content types, in one default locale", () => {
    expect(exportData.contentTypes.length).toBeGreaterThan(0);
    expect(defaultLocale).toBe("en-US");
  });

  it("marks every content type for activation", () => {
    // Without publishedVersion the import leaves the types as drafts, and the
    // GraphQL schema never exposes them.
    for (const ct of exportData.contentTypes) {
      expect(ct.sys.publishedVersion, ct.sys.id).toBeTypeOf("number");
    }
  });

  it("gives every content type an editor interface", () => {
    const withInterface = new Set(
      exportData.editorInterfaces?.map((ei) => ei.sys.contentType.sys.id),
    );
    for (const id of typeIds) {
      expect(withInterface.has(id), id).toBe(true);
    }
  });

  it("caps a post's authors at MAX_AUTHORS, with no minimum", () => {
    // Nothing enforces the match, and a mismatch drops a fourth author
    // silently. A minimum would refuse an emptied optional list.
    const authors = exportData.contentTypes
      .find((ct) => ct.sys.id === "post")
      ?.fields.find((f) => f.id === "authors");
    const size = authors?.validations?.find((v) => v.size)?.size;
    expect(size?.max).toBe(MAX_AUTHORS);
    expect(size?.min).toBeUndefined();
  });
});

describe("the queries in src/lib/api.ts", () => {
  it("ask only for content types the model ships", () => {
    expect(apiSource).toMatch(/\.\.\. on [A-Z]/);
    expect(missingTypes(apiSource)).toEqual([]);
  });

  it("select only fields the model ships", () => {
    const fragments = [...apiSource.matchAll(/const (\w+_GRAPHQL_FIELDS) =/g)];
    expect(fragments.map((m) => m[1]).sort()).toEqual(
      Object.keys(FRAGMENTS).sort(),
    );
    expect(missingFields(apiSource)).toEqual([]);
  });

  it("would be caught asking for a type or a field the model lacks", () => {
    // Known-bad control: a retired type, a field the post never had, and a
    // field nested inside an inline fragment.
    const bad = apiSource
      .replace("... on Callout {", "... on Sidenote {")
      .replace("  updatedDate\n", "  updatedDate\n  readingTime\n")
      .replace("filename\n", "filename\n            lineNumbers\n");
    expect(missingTypes(bad)).toEqual(["Sidenote"]);
    expect(missingFields(bad)).toEqual(
      expect.arrayContaining([
        "post.readingTime",
        "codeBlock.lineNumbers",
        "sidenote.label",
      ]),
    );
  });

  it("would miss nothing nested: a field deeper down is not a top-level one", () => {
    expect(topLevelFields("a b { c { d } } e(x: 1) ${F} # f\n g")).toEqual([
      "a",
      "b",
      "e",
      "g",
    ]);
  });
});

type Entity = {
  sys: {
    id: string;
    publishedVersion?: number;
    contentType?: { sys: { id: string } };
  };
  fields: Record<string, Record<string, unknown>>;
};
type RichTextNode = {
  nodeType?: string;
  marks?: unknown[];
  data?: { target?: { sys?: { id?: string; linkType?: string } } };
  content?: RichTextNode[];
};

function* walk(node: RichTextNode | undefined): Generator<RichTextNode> {
  if (!node) return;
  yield node;
  for (const child of node.content ?? []) yield* walk(child);
}

const L = defaultLocale!;
const assets: Entity[] = seedData.assets;
const entries: Entity[] = seedData.entries;
const typeOf = (e: Entity) => e.sys.contentType?.sys.id;
const posts = entries.filter((e) => typeOf(e) === "post");
const bodies = posts.map((p) => p.fields.content?.[L] as RichTextNode);
const nodes = bodies.flatMap((body) => [...walk(body)]);
const h2s = (body: RichTextNode) =>
  [...walk(body)].filter((n) => n.nodeType === "heading-2").length;

/** Each embed in the entries' rich text whose target the seed lacks. */
function dangling(seeded: Entity[]): string[] {
  const ids = {
    Entry: new Set(seeded.map((e) => e.sys.id)),
    Asset: new Set(assets.map((a) => a.sys.id)),
  };
  return seeded.flatMap((entry) =>
    Object.values(entry.fields)
      .map((field) => field[L] as RichTextNode)
      .flatMap((value) => [...walk(value)])
      .filter((n) => n.nodeType?.startsWith("embedded-"))
      .map((n) => n.data?.target?.sys)
      .filter((t) => !ids[t?.linkType as "Entry"]?.has(t?.id ?? ""))
      .map((t) => `${entry.sys.id} -> ${t?.linkType} ${t?.id}`),
  );
}

describe("the example content, contentful/seed.json", () => {
  it("is exactly what contentful/build-seed.mjs writes", () => {
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), "seed-")), "s");
    execFileSync("node", ["contentful/build-seed.mjs", out], { cwd: root });
    expect(readFileSync(out, "utf8")).toBe(read("contentful/seed.json"));
  });

  it("has assets and entries, all published on import", () => {
    expect(assets.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);
    for (const item of [...assets, ...entries]) {
      expect(item.sys.publishedVersion, item.sys.id).toBeTypeOf("number");
    }
  });

  it("points each asset at a url, never an upload", () => {
    // The importer checks files against url, and an upload aborts it.
    for (const asset of assets) {
      const file = asset.fields.file?.[L] as Record<string, unknown>;
      expect(file?.url, asset.sys.id).toBeTypeOf("string");
      expect("upload" in file, asset.sys.id).toBe(false);
    }
  });

  it("seeds every content type in the model, and no other", () => {
    const seeded = new Set(entries.map(typeOf));
    expect([...seeded].filter((t) => !typeIds.has(t!))).toEqual([]);
    expect([...typeIds].filter((t) => !seeded.has(t))).toEqual([]);
  });

  it("embeds only entries and assets it seeds", () => {
    // A dangling embed imports cleanly and then renders as nothing.
    expect(nodes.some((n) => n.nodeType?.startsWith("embedded-"))).toBe(true);
    expect(dangling(entries)).toEqual([]);
  });

  it("would be caught embedding something it does not seed", () => {
    // Known-bad control: one embed retargeted at an id nothing has.
    const broken: Entity[] = JSON.parse(
      JSON.stringify(entries).replace(
        '"linkType":"Entry","id":"code-example"',
        '"linkType":"Entry","id":"gone"',
      ),
    );
    expect(JSON.stringify(broken)).toContain('"gone"');
    expect(dangling(broken)).toEqual([expect.stringMatching(/-> Entry gone$/)]);
  });
});

describe("what the example content shows a fork", () => {
  it("gives one post a table of contents and another none", () => {
    expect(Math.max(...bodies.map(h2s))).toBeGreaterThanOrEqual(MIN_HEADINGS);
    expect(bodies.some((b) => h2s(b) === 0)).toBe(true);
  });

  it("embeds nothing inline, which would render nothing", () => {
    expect(nodes.filter((n) => n.nodeType === "embedded-entry-inline")).toEqual(
      [],
    );
  });

  it("dates an update, links out and marks some text", () => {
    expect(posts.some((p) => p.fields.updatedDate)).toBe(true);
    expect(nodes.some((n) => n.nodeType === "hyperlink")).toBe(true);
    expect(nodes.some((n) => n.nodeType === "text" && n.marks?.length)).toBe(
      true,
    );
  });
});
