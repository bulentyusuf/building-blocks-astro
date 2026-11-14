import { describe, it, expect, vi } from "vitest";
import { createMemoStore, memoise, withMemo } from "./memo";

const counted = () => {
  const fn = vi.fn(async (slug: string, preview: boolean) => ({
    slug,
    preview,
  }));
  return { fn, memoised: memoise(fn) };
};

describe("memoise", () => {
  it("shares identical calls inside one scope", async () => {
    const { fn, memoised } = counted();
    await withMemo(createMemoStore(), async () => {
      const [a, b] = await Promise.all([
        memoised("x", false),
        memoised("x", false),
      ]);
      expect(a).toBe(b);
      await memoised("x", false);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keys on every argument, so a draft never answers for a published call", async () => {
    const { fn, memoised } = counted();
    await withMemo(createMemoStore(), async () => {
      await memoised("x", false);
      await memoised("x", true);
      await memoised("y", false);
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("shares nothing between scopes", async () => {
    const { fn, memoised } = counted();
    await withMemo(createMemoStore(), () => memoised("x", true));
    await withMemo(createMemoStore(), () => memoised("x", true));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("remembers nothing outside a scope", async () => {
    // Known-bad control for the test above: a module-level memo would make
    // both pass or both fail together.
    const { fn, memoised } = counted();
    await memoised("x", false);
    await memoised("x", false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure", async () => {
    const fn = vi
      .fn<(slug: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("up");
    const memoised = memoise(fn);
    await withMemo(createMemoStore(), async () => {
      await expect(memoised("x")).rejects.toThrow("down");
      await expect(memoised("x")).resolves.toBe("up");
    });
  });
});
