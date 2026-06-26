#!/usr/bin/env node
/**
 * migrate-folders.mjs
 *
 * Converts "Map-Making Folders" userscript exports into a clean format
 * for MMA tag folder import.
 *
 * Usage:
 *   node scripts/migrate-folders.mjs <input.json...> [-o outdir]
 *
 * Examples:
 *   node scripts/migrate-folders.mjs export.json
 *   node scripts/migrate-folders.mjs maps/*.json
 *   node scripts/migrate-folders.mjs maps/*.json -o converted/
 *
 * Input:  JSON files from the userscript's "Export" button
 * Output: cleaned folder trees with tag names, hierarchy, and cosmetics
 *         (written as <name>-mma.json next to each input, or into -o dir)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { basename, join, resolve, dirname } from "path";

const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    "Usage: node scripts/migrate-folders.mjs <input.json...> [-o outdir]"
  );
  process.exit(1);
}

let outDir = null;
const inputPaths = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" && args[i + 1]) {
    outDir = resolve(args[++i]);
  } else {
    inputPaths.push(args[i]);
  }
}

if (!inputPaths.length) {
  console.error("No input files specified.");
  process.exit(1);
}

if (outDir && !existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

function cleanFolder(f, stats) {
  stats.folders++;
  const tags = (f.tags || []).filter((t) => typeof t === "string" && t.trim());
  const aliases = (f.aliases || []).filter(
    (t) => typeof t === "string" && t.trim()
  );

  stats.tags += tags.length;
  stats.aliases += aliases.length;
  tags.forEach((t) => stats.tagNames.add(t));
  aliases.forEach((t) => stats.tagNames.add(t));

  const folder = {
    name: f.name || "Unnamed",
    color: f.color || "#c0f0f8",
    tags,
  };

  if (f.gradient && Array.isArray(f.gradient) && f.gradient.length >= 2) {
    folder.gradient = f.gradient;
  }

  if (f.noGrad) folder.noGrad = true;
  if (f.gradTags === false) folder.gradTags = false;
  if (f.gradFolders) folder.gradFolders = true;

  if (aliases.length) {
    folder.aliases = aliases.map((a) => {
      const conf = f.aliasConfig?.[a];
      const entry = { tag: a };
      if (conf?.customName && conf.customName !== a)
        entry.displayName = conf.customName;
      if (conf?.applyGrad === false) entry.applyGrad = false;
      if (conf?.useOriginal) entry.useOriginal = true;
      if (conf?.customColor) entry.customColor = conf.customColor;
      return entry;
    });
  }

  if (f.countAliases === false) folder.countAliases = false;

  const children = (f.children || []).map((c) => cleanFolder(c, stats));
  if (children.length) folder.children = children;

  if (f.itemsOrder && Array.isArray(f.itemsOrder) && f.itemsOrder.length) {
    folder.itemsOrder = f.itemsOrder;
  }

  return folder;
}

function processFile(inputPath) {
  const name = basename(inputPath);
  let raw;
  try {
    raw = JSON.parse(readFileSync(inputPath, "utf-8"));
  } catch (e) {
    console.error(`  SKIP ${name}: ${e.message}`);
    return false;
  }

  if (!raw.folders || !Array.isArray(raw.folders)) {
    console.error(`  SKIP ${name}: no folders array found`);
    return false;
  }

  const stats = { folders: 0, tags: 0, aliases: 0, tagNames: new Set() };
  const folders = raw.folders.map((f) => cleanFolder(f, stats));

  const output = {
    _format: "mma-tag-folders-v1",
    _source: "map-making-folders-userscript",
    _exportedAt: new Date().toISOString(),
    _sourceFile: name,
    folders,
  };

  const outName = name.replace(/\.json$/, "-mma.json");
  const outPath = outDir ? join(outDir, outName) : join(dirname(inputPath), outName);
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(
    `  ${name} -> ${basename(outPath)}  (${stats.folders} folders, ${stats.tags} tags, ${stats.aliases} aliases, ${stats.tagNames.size} unique)`
  );
  return true;
}

console.log(`Processing ${inputPaths.length} file(s)...`);
let ok = 0;
let fail = 0;
for (const p of inputPaths) {
  if (processFile(p)) ok++;
  else fail++;
}
console.log(`\nDone: ${ok} converted${fail ? `, ${fail} skipped` : ""}`);
