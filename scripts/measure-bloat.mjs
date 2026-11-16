#!/usr/bin/env node
// Prints this repository's bloat signals, by hand. Numbers only: what one
// means is a reading someone makes against CLAUDE.md.
//
//   npm run measure:bloat
//   npm run measure:bloat -- --self-test
//
// What ships to readers, if dist/ holds a build; then dependencies, CLAUDE.md
// entries past a few lines, comments past two lines, comments that repeat the
// documentation or narrate the past. The self test runs first, every time:
// the repetition figures count for nothing until the detector is seen to
// find copied text and pass over invented text.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
// Words per run: long enough that a shared phrase is a copy, not an idiom.
const N = 8;

const read = (path) => readFileSync(join(ROOT, path), "utf8");

function walk(dir, test, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, test, out);
    else if (test(name)) out.push(path);
  }
  return out;
}

const words = (text) =>
  text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function shingles(list) {
  const set = new Set();
  for (let i = 0; i + N <= list.length; i++)
    set.add(list.slice(i, i + N).join(" "));
  return set;
}

/** Each comment in a source file, as its first line and its text. */
function comments(source) {
  const found = [];
  const lineOf = (index) => source.slice(0, index).split("\n").length;
  // Runs of // lines are one comment.
  for (const m of source.matchAll(/(?:^[ \t]*\/\/.*\n?)+/gm)) {
    found.push({
      line: lineOf(m.index),
      text: m[0].replace(/^\s*\/\/ ?/gm, ""),
    });
  }
  // A block comment opens after a space or brace, so "**/*" in a string is not one.
  for (const m of source.matchAll(
    /(?<=^|[\s{])\/\*(?=[\s*])([\s\S]*?)\*\/|<!--([\s\S]*?)-->/gm,
  )) {
    found.push({
      line: lineOf(m.index),
      text: (m[1] ?? m[2]).replace(/^\s*\* ?/gm, ""),
    });
  }
  return found.map((c) => ({
    ...c,
    lines: c.text.trim().split("\n").length,
  }));
}

function selfTest(docs) {
  // Twenty real words from CLAUDE.md must be found, and invented ones not.
  const lifted = words(read("CLAUDE.md")).slice(200, 220).join(" ");
  const invented =
    "zephyr marmalade quantum lighthouse accordion tangerine velvet orbit " +
    "parsnip glacier kettle saxophone meridian pumpkin lantern cobalt";
  const hits = (text) =>
    [...shingles(words(text))].filter((k) => docs.has(k)).length;
  if (hits(lifted) === 0) {
    console.error(
      "SELF TEST FAILED: text copied from CLAUDE.md was not found.",
    );
    process.exit(1);
  }
  if (hits(invented) !== 0) {
    console.error("SELF TEST FAILED: invented text was reported as copied.");
    process.exit(1);
  }
  // Comment extraction, on each kind the source uses.
  const sample =
    '// one\n// two\nconst a = 1; /* three */\nroute("**/*", go);\n<!-- four\nfive -->\n';
  const lines = comments(sample).map((c) => c.lines);
  if (lines.join() !== "2,1,2") {
    console.error(
      `SELF TEST FAILED: comments read as ${lines.join()} lines, not 2,1,2.`,
    );
    process.exit(1);
  }
  console.log(
    `Self test passed: ${hits(lifted)} copied runs found, none invented.\n`,
  );
}

const docs = shingles(words(read("CLAUDE.md") + read("README.md")));
selfTest(docs);
if (process.argv.includes("--self-test")) process.exit(0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const assets = join(ROOT, "dist/client/_astro");
if (existsSync(assets)) {
  console.log("SHIPPED TO READERS (dist/, gzipped)");
  for (const ext of ["js", "css"]) {
    const files = walk("dist/client/_astro", (name) =>
      name.endsWith(`.${ext}`),
    );
    const size = files.reduce(
      (sum, f) => sum + gzipSync(readFileSync(join(ROOT, f))).length,
      0,
    );
    console.log(
      `  ${ext.padEnd(4)} ${String(files.length).padStart(3)} files  ${kb(size)}`,
    );
  }
  const pages = walk("dist/client", (name) => name.endsWith(".html"));
  const inline = pages.map((f) =>
    [
      ...readFileSync(join(ROOT, f), "utf8").matchAll(
        /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ]
      .map((m) => m[1].length)
      .reduce((a, b) => a + b, 0),
  );
  console.log(
    `  inline scripts, largest on any page  ${kb(Math.max(0, ...inline))}`,
  );
  console.log();
} else {
  console.log("SHIPPED TO READERS  no dist/, run npm run build first\n");
}

const pkg = JSON.parse(read("package.json"));
console.log(
  `DEPENDENCIES  ${Object.keys(pkg.dependencies ?? {}).length} runtime, ${Object.keys(pkg.devDependencies ?? {}).length} development\n`,
);

// "Keep an entry to a few lines."
const claude = read("CLAUDE.md").split("\n");
console.log(`CLAUDE.md  ${claude.length} lines`);
console.log("  Entries of four lines or more:");
for (let i = 0; i < claude.length; i++) {
  if (!claude[i].startsWith("- **")) continue;
  let n = 1;
  while (claude[i + n]?.startsWith("  ")) n++;
  if (n >= 4)
    console.log(
      `  line ${String(i + 1).padStart(3)}, ${n} lines  ${claude[i].slice(0, 60)}`,
    );
}
console.log();

const source = [
  ...walk(
    "src",
    (name) => /\.(ts|astro)$/.test(name) && !name.includes(".test."),
  ).filter((file) => !file.startsWith("src/test/")),
  ...walk("integrations", (name) => name.endsWith(".ts")),
  ...walk(
    "scripts",
    (name) => /\.m?[jt]s$/.test(name) && !name.includes(".test."),
  ),
  "astro.config.ts",
];
const all = source.flatMap((file) =>
  comments(read(file)).map((c) => ({ ...c, file })),
);

// "Comments are one or two lines."
const long = all.filter((c) => c.lines > 2).sort((a, b) => b.lines - a.lines);
console.log(`COMMENTS OVER TWO LINES  ${long.length} of ${all.length}`);
for (const c of long.slice(0, 12)) {
  console.log(
    `  ${String(c.lines).padStart(3)}  ${relative(ROOT, join(ROOT, c.file))}:${c.line}`,
  );
}
console.log();

const repeats = all
  .map((c) => ({
    ...c,
    shared: [...shingles(words(c.text))].filter((k) => docs.has(k)).length,
  }))
  .filter((c) => c.shared > 0)
  .sort((a, b) => b.shared - a.shared);
console.log(`COMMENTS REPEATING CLAUDE.md OR THE README  ${repeats.length}`);
for (const c of repeats.slice(0, 10)) {
  console.log(`  ${String(c.shared).padStart(3)} runs  ${c.file}:${c.line}`);
}
console.log();

const HISTORY =
  /\b(used to|no longer|formerly|was retired|previously|once shipped|the old)\b/i;
const history = all.filter((c) => HISTORY.test(c.text));
console.log(`COMMENTS NARRATING EARLIER BEHAVIOUR  ${history.length}`);
for (const c of history.slice(0, 10)) console.log(`  ${c.file}:${c.line}`);
