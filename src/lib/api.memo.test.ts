import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { createMemoStore, memoise, withMemo } from "./memo";

// Every fetcher in api.ts is memoised, so a page that asks twice in one build
// pass makes one request, and none takes a defaulted or optional parameter,
// since the argument list is the memo key.

vi.mock("astro:env/server", () => ({
  getSecret: (name: string) => process.env[name],
}));

const empty = () =>
  new Response(JSON.stringify({ data: {} }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let fetches: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("CONTENTFUL_SPACE_ID", "space123");
  vi.stubEnv("CONTENTFUL_ACCESS_TOKEN", "cda-token");
  vi.stubEnv("CONTENTFUL_PREVIEW_ACCESS_TOKEN", "cpa-token");
  fetches = vi.fn(async () => empty());
  vi.stubGlobal("fetch", fetches);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Fetcher = (...args: never[]) => Promise<unknown>;

/** Requests made by calling a fetcher `times` times in one build pass. */
async function requests(fetcher: Fetcher, args: unknown[], times: number) {
  fetches.mockClear();
  await withMemo(createMemoStore(), () =>
    Promise.all(
      Array.from({ length: times }, () =>
        (fetcher as (...a: unknown[]) => Promise<unknown>)(...args),
      ),
    ),
  );
  return fetches.mock.calls.length;
}

// Each exported fetcher, with arguments it accepts.
const ARGS: Record<string, unknown[]> = {
  getAllPosts: [false],
  getPost: ["a-post", false],
  getPostAndMorePosts: ["a-post", false],
  getGermanPostSlugs: [false],
  getGermanPostAndMorePosts: ["a-post", false],
  getPage: ["about", false],
  getAllPages: [false],
  getTagBySlug: ["design", false],
  getAllCategories: [false],
  getCategoryBySlug: ["blogging", false],
  getAuthorBySlug: ["bulent-yusuf", false],
  getAllAuthors: [false],
};

it("knows every fetcher api.ts exports", () => {
  const exported = Object.entries(api)
    .filter(
      ([name, value]) =>
        typeof value === "function" && name !== "setRetryDelayForTests",
    )
    .map(([name]) => name);
  expect(exported.sort()).toEqual(Object.keys(ARGS).sort());
});

describe.each(Object.entries(ARGS))("%s", (name, args) => {
  const fetcher = api[name as keyof typeof api] as Fetcher;

  it("asks once when called twice in one pass", async () => {
    const once = await requests(fetcher, args, 1);
    expect(once).toBeGreaterThan(0);
    expect(await requests(fetcher, args, 2)).toBe(once);
  });
});

it("would catch a fetcher that is not memoised", async () => {
  // Known-bad control: the same probe on an unwrapped fetcher.
  const bare = async (preview: boolean) =>
    fetch(`https://graphql.contentful.com/?preview=${preview}`);
  expect(await requests(bare, [false], 2)).toBe(2);
  expect(await requests(memoise(bare), [false], 2)).toBe(1);
});

// The parameter lists of every memoised fetcher, from the source.
const parameterLists = (source: string) =>
  [...source.matchAll(/memoise\(\s*async\s*\(([^)]*)\)/g)].map((m) => m[1]);
const optional = (params: string) =>
  params
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /\?\s*:|=/.test(p));

describe("fetcher parameters", () => {
  const source = fs.readFileSync(new URL("./api.ts", import.meta.url), "utf8");

  it("are all required, with the draft flag last", () => {
    const lists = parameterLists(source);
    expect(lists).toHaveLength(Object.keys(ARGS).length);
    for (const params of lists) {
      expect(optional(params), params).toEqual([]);
      expect(params.trim().split(",").filter(Boolean).at(-1)?.trim()).toBe(
        "preview: boolean",
      );
    }
  });

  it("would catch a defaulted or optional one", () => {
    const bad = parameterLists(
      "memoise(\n  async (slug?: string, preview = false) => {})",
    );
    expect(optional(bad[0])).toEqual(["slug?: string", "preview = false"]);
  });
});
