import { createHmac } from "node:crypto";
import type { AstroCookieSetOptions } from "astro";
import { safeCompare } from "./secret";

// A preview session is a signed expiry time, so it needs no storage and cannot
// be forged or extended without the preview secret. Rotating the secret ends
// every session.

export const PREVIEW_COOKIE = "preview_session";

// Sent only to the preview pages, never to the published site.
export const PREVIEW_PATH = "/preview";

const LIFETIME_SECONDS = 8 * 60 * 60;

// Contentful shows the preview in a frame on its own site, where a browser
// only keeps a cookie that is SameSite=None, and Partitioned once third-party
// cookies are blocked.
export const PREVIEW_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: PREVIEW_PATH,
  httpOnly: true,
  secure: true,
  sameSite: "none",
  partitioned: true,
};

const sign = (expires: number, secret: string) =>
  createHmac("sha256", secret).update(`preview.${expires}`).digest("hex");

export function issuePreviewSession(
  secret: string,
  now: number = Date.now(),
): { value: string; maxAge: number } {
  const expires = Math.floor(now / 1000) + LIFETIME_SECONDS;
  return {
    value: `${expires}.${sign(expires, secret)}`,
    maxAge: LIFETIME_SECONDS,
  };
}

export function isPreviewSession(
  value: string | null | undefined,
  secret: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!value || !secret) return false;
  const [expires, signature, ...rest] = value.split(".");
  if (rest.length > 0 || !/^\d{1,12}$/.test(expires)) return false;
  if (Number(expires) * 1000 <= now) return false;
  return safeCompare(signature, sign(Number(expires), secret));
}
