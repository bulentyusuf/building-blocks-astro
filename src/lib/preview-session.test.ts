import { describe, it, expect } from "vitest";
import { isPreviewSession, issuePreviewSession } from "./preview-session";
import { safeCompare } from "./secret";

const SECRET = "a-long-random-preview-secret";
const NOW = Date.UTC(2026, 10, 14, 12);
const HOUR = 60 * 60 * 1000;

describe("safeCompare", () => {
  it("matches equal strings only", () => {
    expect(safeCompare(SECRET, SECRET)).toBe(true);
    expect(safeCompare("nope", SECRET)).toBe(false);
    expect(safeCompare(`${SECRET}x`, SECRET)).toBe(false);
  });

  it("never matches a missing value, even against another missing value", () => {
    expect(safeCompare(null, SECRET)).toBe(false);
    expect(safeCompare(SECRET, undefined)).toBe(false);
    expect(safeCompare("", "")).toBe(false);
    expect(safeCompare(undefined, undefined)).toBe(false);
  });
});

describe("a preview session", () => {
  const { value, maxAge } = issuePreviewSession(SECRET, NOW);

  it("is accepted until it expires, and the cookie expires with it", () => {
    expect(isPreviewSession(value, SECRET, NOW)).toBe(true);
    expect(isPreviewSession(value, SECRET, NOW + maxAge * 1000 - 1000)).toBe(
      true,
    );
    expect(isPreviewSession(value, SECRET, NOW + maxAge * 1000)).toBe(false);
    expect(maxAge).toBe(8 * 60 * 60);
  });

  it("does not carry the secret", () => {
    expect(value).not.toContain(SECRET);
  });

  it("is refused under a different secret", () => {
    expect(isPreviewSession(value, "another-secret", NOW)).toBe(false);
    expect(isPreviewSession(value, undefined, NOW)).toBe(false);
  });

  it("cannot be extended by editing the expiry", () => {
    const [expires, signature] = value.split(".");
    const later = `${Number(expires) + 24 * 3600}.${signature}`;
    expect(isPreviewSession(later, SECRET, NOW)).toBe(false);
    // Known-bad control: the untouched pair is still good at the same instant.
    expect(isPreviewSession(`${expires}.${signature}`, SECRET, NOW)).toBe(true);
  });

  it("refuses anything that is not a signed expiry", () => {
    for (const forged of [
      undefined,
      "",
      "1",
      "true",
      "9999999999",
      "9999999999.",
      "9999999999.deadbeef",
      `${value}.extra`,
      `x${value}`,
    ]) {
      expect(isPreviewSession(forged, SECRET, NOW), String(forged)).toBe(false);
    }
  });

  it("stays refused once expired, however it is replayed", () => {
    expect(isPreviewSession(value, SECRET, NOW + 9 * HOUR)).toBe(false);
  });
});
