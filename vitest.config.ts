/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    css: true,
    // A file's first browser test renders a page cold, which a slow CI
    // runner can push past the 5s default. A ceiling, not an assertion.
    testTimeout: 30_000,
  },
});
