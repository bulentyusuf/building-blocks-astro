import { existsSync, readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  ON_DEMAND_PAGES,
  routeCache,
  routeCacheOn,
} from "../../integrations/route-cache";
import { CACHE_MAX_AGE, hold, missing } from "./route-cache";

// The kill switch, and the two helpers a page uses to render either way.

type Route = { component: string; prerender?: boolean };

function setUp(enabled: boolean, route: Route): Route {
  const hook = routeCache(enabled).hooks["astro:route:setup"]!;
  hook({ route, logger: undefined as never });
  return route;
}

describe("the route cache switch", () => {
  it("turns on only for the exact word", () => {
    expect(routeCacheOn("true")).toBe(true);
    expect(routeCacheOn(" true\n")).toBe(true);
    for (const value of [undefined, "", "1", "yes", "TRUE", "false"]) {
      expect(routeCacheOn(value), String(value)).toBe(false);
    }
  });

  it("on, renders its pages on request and leaves every other route alone", () => {
    for (const component of ON_DEMAND_PAGES) {
      expect(setUp(true, { component }).prerender, component).toBe(false);
    }
    for (const component of [
      "src/pages/about.astro",
      "src/pages/search.astro",
      "src/pages/feed.xml.ts",
      "src/pages/posts/[slug]/opengraph-image.ts",
    ]) {
      expect(setUp(true, { component }).prerender, component).toBeUndefined();
    }
  });

  it("off, changes no route at all", () => {
    for (const component of ON_DEMAND_PAGES) {
      expect(setUp(false, { component }).prerender, component).toBeUndefined();
    }
  });

  it("names only pages that exist, and each can render on request", () => {
    for (const component of ON_DEMAND_PAGES) {
      expect(existsSync(component), component).toBe(true);
      const source = readFileSync(component, "utf8");
      // Without these a page held nowhere, or a missing entry as a 500.
      expect(source, component).toContain("hold(Astro.cache, ");
      expect(source, component).not.toContain("throw new Error");
    }
  });

  it("never names a draft page or an endpoint", () => {
    for (const component of ON_DEMAND_PAGES) {
      expect(component).not.toMatch(/\/(preview|api)\//);
    }
    // Known-bad control: a draft page would be caught.
    expect("src/pages/preview/posts/[slug].astro").toMatch(/\/(preview|api)\//);
  });

  it("is never asked to hold a draft page", () => {
    for (const draft of [
      "src/pages/preview/posts/[slug].astro",
      "src/pages/preview/de/posts/[slug].astro",
    ]) {
      expect(readFileSync(draft, "utf8"), draft).not.toMatch(
        /Astro\.cache|hold\(/,
      );
    }
  });
});

describe("a missing entry", () => {
  it("fails a build", () => {
    expect(() => missing({ isPrerendered: true }, "No post.")).toThrow(
      "No post.",
    );
  });

  it("is a 404 with no body on request, so the site's own page answers", async () => {
    const response = missing({ isPrerendered: false }, "No post.");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});

describe("holding a page", () => {
  it("sets the tags and the lifetime when the cache is on", () => {
    const set = vi.fn();
    hold({ enabled: true, set }, ["post1"]);
    expect(set).toHaveBeenCalledWith({
      maxAge: CACHE_MAX_AGE,
      tags: ["post1"],
    });
  });

  it("does nothing when it is off, as on a built page", () => {
    const set = vi.fn();
    hold({ enabled: false, set }, ["post1"]);
    expect(set).not.toHaveBeenCalled();
  });
});
