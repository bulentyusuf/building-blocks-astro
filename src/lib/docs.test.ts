import fs from "node:fs";
import { describe, expect, it } from "vitest";

// The README and CLAUDE.md name files and npm scripts. A rename that leaves
// them behind sends the next reader, or the next session, to nothing.

const read = (file: string) =>
  fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const DOCS = ["README.md", "CLAUDE.md"];
const scripts = Object.keys(JSON.parse(read("package.json")).scripts);

/** Repo paths a document names in backticks: anything under a top folder. */
const paths = (doc: string) =>
  [
    ...doc.matchAll(
      /`((?:src|scripts|integrations|public|\.github)\/[\w./[\]-]+)`/g,
    ),
  ].map((m) => m[1]);
const npmScripts = (doc: string) =>
  [...doc.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
const missing = (file: string) =>
  !fs.existsSync(new URL(`../../${file}`, import.meta.url));

describe.each(DOCS)("%s", (file) => {
  const doc = read(file);

  it("names only files that exist", () => {
    expect(paths(doc).length).toBeGreaterThan(0);
    expect(paths(doc).filter(missing)).toEqual([]);
  });

  it("names only npm scripts that exist", () => {
    expect(npmScripts(doc).filter((s) => !scripts.includes(s))).toEqual([]);
  });
});

it("would catch a renamed file or script", () => {
  const doc = "See `src/lib/gone.ts` and run `npm run vanished`.";
  expect(paths(doc).filter(missing)).toEqual(["src/lib/gone.ts"]);
  expect(npmScripts(doc).filter((s) => !scripts.includes(s))).toEqual([
    "vanished",
  ]);
});
