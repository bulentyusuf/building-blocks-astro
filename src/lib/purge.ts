import { POSTS_TAG, listingTag } from "./cache-tags";
import { safeCompare } from "./secret";

// Where a change in Contentful becomes the cache tags to purge. The tags
// themselves are described in src/lib/cache-tags.ts.

/** The request header Contentful's webhook carries the secret in. */
export const WEBHOOK_SECRET_HEADER = "X-Webhook-Secret";

// Only these change what the site shows. A save or an autosave does not, and
// purging on one would spend the purge allowance on nothing.
const TOPIC = /^ContentManagement\.(Entry|Asset)\.(publish|unpublish|delete)$/;

const ENTRY_TYPES = new Set(["Entry", "DeletedEntry"]);
const ASSET_TYPES = new Set(["Asset", "DeletedAsset"]);

// Contentful's own rule for an id, so nothing else can reach a purge.
const ID = /^[A-Za-z0-9._-]{1,64}$/;

// Cloudflare's ceiling for one purge call.
const MAX_TAGS = 100;

type PurgeResult = { success: boolean; errors?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The entries a published one links to from its own fields: a post's strand,
// tags and authors. Links inside rich text are embeds, never a listing.
function linkedIds(fields: unknown): string[] {
  if (!isRecord(fields)) return [];
  return Object.values(fields)
    .flatMap((byLocale) => (isRecord(byLocale) ? Object.values(byLocale) : []))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .flatMap((item) => {
      const sys = isRecord(item) ? item.sys : undefined;
      return isRecord(sys) &&
        sys.type === "Link" &&
        typeof sys.id === "string" &&
        ID.test(sys.id)
        ? [sys.id]
        : [];
    });
}

/**
 * The tags one webhook payload purges, or undefined when it is not an entry
 * or an asset. The changed thing's own tag reaches every page showing it. An
 * entry also reaches the pages listing every post, and the listings of what
 * it links to, which is how a new post arrives on pages that never showed it.
 */
export function purgeTags(payload: unknown): string[] | undefined {
  const sys = isRecord(payload) ? payload.sys : undefined;
  if (!isRecord(sys) || typeof sys.id !== "string" || !ID.test(sys.id)) {
    return undefined;
  }
  if (ASSET_TYPES.has(sys.type as string)) return [sys.id];
  if (!ENTRY_TYPES.has(sys.type as string)) return undefined;

  const fields = isRecord(payload) ? payload.fields : undefined;
  const tags = [sys.id, POSTS_TAG, ...linkedIds(fields).map(listingTag)];
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

const text = (body: string, status: number) => new Response(body, { status });

/**
 * Answers Contentful's webhook. Anything but an authenticated publish,
 * unpublish or delete of one entry or asset is refused, and nothing here can
 * purge the whole cache.
 */
export async function handlePurge(
  request: Request,
  {
    secret,
    purge,
  }: {
    secret: string | undefined;
    purge: (tags: string[]) => Promise<PurgeResult>;
  },
): Promise<Response> {
  if (!safeCompare(request.headers.get(WEBHOOK_SECRET_HEADER), secret)) {
    return text("Invalid secret", 401);
  }
  if (!TOPIC.test(request.headers.get("X-Contentful-Topic") ?? "")) {
    return text("Not a publish, unpublish or delete", 400);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return text("Not JSON", 400);
  }
  const tags = purgeTags(payload);
  if (!tags) return text("Not an entry or an asset", 400);

  // A purge that is refused or fails is an error here, so Contentful's log
  // shows it. The rebuild that follows a publish empties the cache either way.
  let result: PurgeResult;
  try {
    result = await purge(tags);
  } catch (cause) {
    result = { success: false, errors: String(cause) };
  }
  if (!result.success) {
    console.error(`[purge] failed: ${JSON.stringify(result.errors)}`);
    return text("Purge failed", 502);
  }
  return Response.json({ purged: tags });
}
