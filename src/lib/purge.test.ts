import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { POSTS_TAG, listingTag } from "./cache-tags";
import { WEBHOOK_SECRET_HEADER, handlePurge, purgeTags } from "./purge";

// Contentful's webhook, as the purge endpoint sees it.

const SECRET = "a-long-random-webhook-secret";
const link = (id: string) => ({ sys: { type: "Link", linkType: "Entry", id } });

// A published post, as Contentful sends it: every field keyed by locale.
const post = {
  sys: { type: "Entry", id: "post1", contentType: { sys: { id: "post" } } },
  fields: {
    title: { "en-GB": "A post", "de-DE": "Ein Beitrag" },
    category: { "en-GB": link("strand1") },
    tags: { "en-GB": [link("tag1"), link("tag2")] },
    authors: { "en-GB": [link("author1")] },
    content: {
      "en-GB": {
        nodeType: "document",
        content: [
          { nodeType: "embedded-entry-block", data: { target: link("code1") } },
        ],
      },
    },
  },
};

function call(
  body: unknown,
  {
    secret = SECRET,
    topic = "ContentManagement.Entry.publish",
    purge = vi.fn(async () => ({ success: true })),
  }: {
    secret?: string | null;
    topic?: string | null;
    purge?: (tags: string[]) => Promise<{ success: boolean }>;
  } = {},
) {
  const headers = new Headers();
  if (secret !== null) headers.set(WEBHOOK_SECRET_HEADER, secret);
  if (topic !== null) headers.set("X-Contentful-Topic", topic);
  const request = new Request("https://example.com/api/purge", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return {
    purge,
    response: handlePurge(request, { secret: SECRET, purge }),
  };
}

describe("the tags a change purges", () => {
  it("are a published post's own, every-post pages, and its listings", () => {
    expect(purgeTags(post)).toEqual([
      "post1",
      POSTS_TAG,
      listingTag("strand1"),
      listingTag("tag1"),
      listingTag("tag2"),
      listingTag("author1"),
    ]);
  });

  it("never include what the body only embeds", () => {
    expect(purgeTags(post)).not.toContain(listingTag("code1"));
  });

  it("are an unpublished or deleted entry's own and the every-post pages", () => {
    // No fields arrive, so the pages that showed it are reached by its id.
    expect(purgeTags({ sys: { type: "DeletedEntry", id: "post1" } })).toEqual([
      "post1",
      POSTS_TAG,
    ]);
  });

  it("are an asset's own tag and nothing else", () => {
    for (const type of ["Asset", "DeletedAsset"]) {
      expect(purgeTags({ sys: { type, id: "image1" } }), type).toEqual([
        "image1",
      ]);
    }
  });

  it("stay within one purge call however many links a post has", () => {
    const many = {
      sys: { type: "Entry", id: "post1" },
      fields: {
        tags: {
          "en-GB": Array.from({ length: 300 }, (_, i) => link(`tag${i}`)),
        },
      },
    };
    expect(purgeTags(many)).toHaveLength(100);
  });

  it("are none for anything that is not one entry or asset", () => {
    for (const payload of [
      null,
      "post1",
      [],
      {},
      { sys: {} },
      { sys: { type: "Entry" } },
      { sys: { type: "Entry", id: 7 } },
      { sys: { type: "Entry", id: "" } },
      { sys: { type: "Entry", id: "a,b" } },
      { sys: { type: "Entry", id: "a b" } },
      { sys: { type: "Space", id: "space1" } },
      { sys: { type: "ContentType", id: "post" } },
    ]) {
      expect(purgeTags(payload), JSON.stringify(payload)).toBeUndefined();
    }
  });

  it("drop a link whose id could not be a tag", () => {
    const odd = {
      sys: { type: "Entry", id: "post1" },
      fields: { tags: { "en-GB": [link("ok"), link("a,b"), link("")] } },
    };
    expect(purgeTags(odd)).toEqual(["post1", POSTS_TAG, listingTag("ok")]);
  });
});

describe("the purge endpoint", () => {
  it("purges a publish, an unpublish and a delete, of entries and assets", async () => {
    for (const topic of [
      "ContentManagement.Entry.publish",
      "ContentManagement.Entry.unpublish",
      "ContentManagement.Entry.delete",
      "ContentManagement.Asset.publish",
      "ContentManagement.Asset.unpublish",
      "ContentManagement.Asset.delete",
    ]) {
      const { purge, response } = call(post, { topic });
      expect((await response).status, topic).toBe(200);
      expect(purge, topic).toHaveBeenCalledOnce();
    }
  });

  it("answers with the tags it purged", async () => {
    const { purge, response } = call(post);
    expect(await (await response).json()).toEqual({ purged: purgeTags(post) });
    expect(purge).toHaveBeenCalledWith(purgeTags(post));
  });

  it("refuses a missing or wrong secret, and purges nothing", async () => {
    for (const secret of [null, "", "wrong", `${SECRET}x`, SECRET.slice(1)]) {
      const { purge, response } = call(post, { secret });
      expect((await response).status, String(secret)).toBe(401);
      expect(purge, String(secret)).not.toHaveBeenCalled();
    }
  });

  it("refuses everyone when no secret is configured", async () => {
    const purge = vi.fn(async () => ({ success: true }));
    for (const sent of ["", "undefined", SECRET]) {
      const request = new Request("https://example.com/api/purge", {
        method: "POST",
        headers: {
          [WEBHOOK_SECRET_HEADER]: sent,
          "X-Contentful-Topic": "ContentManagement.Entry.publish",
        },
        body: JSON.stringify(post),
      });
      const response = await handlePurge(request, { secret: undefined, purge });
      expect(response.status, sent).toBe(401);
    }
    expect(purge).not.toHaveBeenCalled();
  });

  it("checks the secret before it reads anything else", async () => {
    const { response } = call("{ not json", { secret: "wrong", topic: null });
    expect((await response).status).toBe(401);
  });

  it("refuses a save, an autosave and any other event", async () => {
    for (const topic of [
      null,
      "",
      "ContentManagement.Entry.save",
      "ContentManagement.Entry.auto_save",
      "ContentManagement.Entry.create",
      "ContentManagement.Entry.archive",
      "ContentManagement.ContentType.publish",
      "ContentManagement.Entry.publish.extra",
    ]) {
      const { purge, response } = call(post, { topic });
      expect((await response).status, String(topic)).toBe(400);
      expect(purge, String(topic)).not.toHaveBeenCalled();
    }
  });

  it("refuses a malformed body, and purges nothing", async () => {
    for (const body of ["", "{ not json", "null", "[]", "{}", '{"sys":{}}']) {
      const { purge, response } = call(body);
      expect((await response).status, body).toBe(400);
      expect(purge, body).not.toHaveBeenCalled();
    }
  });

  it("has no way to purge the whole cache", () => {
    const everything = /purgeEverything|pathPrefixes/;
    for (const file of ["src/lib/purge.ts", "src/pages/api/purge.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(everything);
    }
    // Known-bad control: the call this guards against.
    expect("cache.purge({ purgeEverything: true })").toMatch(everything);
  });

  it("reports a purge Cloudflare refused, or one that threw", async () => {
    const refused = call(post, {
      purge: async () => ({ success: false }),
    });
    expect((await refused.response).status).toBe(502);
    const threw = call(post, {
      purge: () => {
        throw new TypeError("cache.purge is not a function");
      },
    });
    expect((await threw.response).status).toBe(502);
  });
});
