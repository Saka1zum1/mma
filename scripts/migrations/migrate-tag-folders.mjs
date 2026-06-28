#!/usr/bin/env node
/**
 * migrate-tag-folders.mjs
 *
 * Renames tags in a map-making.app export to include their folder path,
 * so MMA's tag tree view displays them hierarchically.
 *
 * Usage:
 *   node scripts/migrations/migrate-tag-folders.mjs <map-export.json...> [-o outdir]
 *   node scripts/migrations/migrate-tag-folders.mjs <map-export.json...> -f folders.json [-o outdir]
 *
 * The folder hierarchy is read from:
 *   1. The embedded storage tag in the map export (auto-detected), or
 *   2. A separate userscript export passed with -f (from the "Export" button)
 *
 * Output: map JSON(s) with tags renamed to folder/path/tag, ready to import.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { basename, join, resolve, dirname } from "path";

// Inlined LZString decompressor (WTFPL license, pieroxy.net/blog/pages/lz-string)
const lzDecompress = (() => {
  const f = String.fromCharCode;
  const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
  const baseReverseDic = {};
  function getBaseValue(alphabet, ch) {
    if (!baseReverseDic[alphabet]) {
      baseReverseDic[alphabet] = {};
      for (let i = 0; i < alphabet.length; i++) baseReverseDic[alphabet][alphabet[i]] = i;
    }
    return baseReverseDic[alphabet][ch];
  }
  function _decompress(length, resetValue, getNextValue) {
    const dictionary = []; let enlargeIn = 4, dictSize = 4, numBits = 3, entry, w, bits, resb, maxpower, power, c;
    const result = [];
    const data = { val: getNextValue(0), position: resetValue, index: 1 };
    for (let i = 0; i < 3; i++) dictionary[i] = i;
    bits = 0; maxpower = 4; power = 1;
    while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
    switch (bits) {
      case 0: bits = 0; maxpower = 256; power = 1; while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; } c = f(bits); break;
      case 1: bits = 0; maxpower = 65536; power = 1; while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; } c = f(bits); break;
      case 2: return "";
    }
    dictionary[3] = c; w = c; result.push(c);
    while (true) {
      if (data.index > length) return "";
      bits = 0; maxpower = Math.pow(2, numBits); power = 1;
      while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; }
      switch (c = bits) {
        case 0: bits = 0; maxpower = 256; power = 1; while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; } dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
        case 1: bits = 0; maxpower = 65536; power = 1; while (power !== maxpower) { resb = data.val & data.position; data.position >>= 1; if (!data.position) { data.position = resetValue; data.val = getNextValue(data.index++); } bits |= (resb > 0 ? 1 : 0) * power; power <<= 1; } dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
        case 2: return result.join("");
      }
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
      if (dictionary[c]) { entry = dictionary[c]; } else if (c === dictSize) { entry = w + w[0]; } else { return null; }
      result.push(entry);
      dictionary[dictSize++] = w + entry[0]; enlargeIn--;
      w = entry;
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    }
  }
  return (input) => {
    if (input == null) return ""; if (input === "") return null;
    input = input.replace(/ /g, "+");
    return _decompress(input.length, 32, (index) => getBaseValue(keyStr, input[index]));
  };
})();

const STORAGE_PREFIX = "[⚠️_DO_NOT_DELETE_MM_CLOUD_SAVE]";
const OLD_STORAGE_PREFIX = "[⚠️_NE_PAS_SUPPRIMER_MM_CLOUD_SAVE]";

const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    "Usage: node scripts/migrations/migrate-tag-folders.mjs <map-export.json...> [-f folders.json] [-o outdir]"
  );
  process.exit(1);
}

let outDir = null;
let foldersPath = null;
const inputPaths = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" && args[i + 1]) {
    outDir = resolve(args[++i]);
  } else if (args[i] === "-f" && args[i + 1]) {
    foldersPath = resolve(args[++i]);
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

// -- Folder tree → rename map --

function buildRenameMap(folders, parentPath = "") {
  const map = new Map();
  for (const f of folders) {
    const folderPath = parentPath ? `${parentPath}/${f.name}` : f.name;
    for (const tag of f.tags || []) {
      if (!map.has(tag)) map.set(tag, `${folderPath}/${tag}`);
    }
    if (f.children?.length) {
      for (const [k, v] of buildRenameMap(f.children, folderPath)) {
        if (!map.has(k)) map.set(k, v);
      }
    }
  }
  return map;
}

// MMA colors tag-tree folder nodes from MapSettings.virtualTags, keyed by the same
// full slash path the tags are renamed into. useParentColor folders inherit in MMA's
// tree, so only emit a color for folders that own one (top-level always own theirs).
function buildVirtualTags(folders, parentPath = "", out = {}) {
  for (const f of folders) {
    const folderPath = parentPath ? `${parentPath}/${f.name}` : f.name;
    if (f.color && !f.useParentColor) out[folderPath] = { color: f.color };
    if (f.children?.length) buildVirtualTags(f.children, folderPath, out);
  }
  return out;
}

function orderedFolderTags(f) {
  const tags = f.tags || [];
  if (!Array.isArray(f.itemsOrder) || !f.itemsOrder.length) return tags;
  const ordered = f.itemsOrder
    .filter((k) => k.startsWith("tag:"))
    .map((k) => k.slice(4))
    .filter((t) => tags.includes(t));
  for (const t of tags) if (!ordered.includes(t)) ordered.push(t);
  return ordered;
}

// MMA's tag tree sorts by each tag's `order` (default mode). Assign order from a
// pre-order walk of the tree -- a folder's tags (in itemsOrder), then its children --
// so the userscript's arrangement (within-folder order + folder order) is what MMA
// renders. Returns tag name -> order index.
function buildOrderMap(folders) {
  const order = new Map();
  let counter = 0;
  const walk = (list) => {
    for (const f of list) {
      for (const t of orderedFolderTags(f)) {
        if (!order.has(t)) order.set(t, counter++);
      }
      if (f.children?.length) walk(f.children);
    }
  };
  walk(folders);
  return order;
}

function isStorageTag(name) {
  return name.startsWith(STORAGE_PREFIX) || name.startsWith(OLD_STORAGE_PREFIX);
}

function extractEmbeddedFolders(mapData) {
  const tagDefs = mapData.extra?.tags;
  if (!tagDefs) return null;
  for (const tagName of Object.keys(tagDefs)) {
    if (!isStorageTag(tagName)) continue;
    const sep = tagName.indexOf(":::");
    if (sep === -1) continue;
    const encoded = tagName.slice(sep + 3);
    try {
      const parsed = JSON.parse(encoded);
      if (parsed?.folders) return parsed.folders;
    } catch {
      try {
        const decoded = lzDecompress(encoded);
        const parsed = JSON.parse(decoded);
        if (parsed?.folders) return parsed.folders;
      } catch (e) {
        console.error(`  Failed to decompress embedded folder data: ${e.message}`);
        return null;
      }
    }
  }
  return null;
}

function loadExternalFolders(path) {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  if (raw.folders && Array.isArray(raw.folders)) return raw.folders;
  console.error(`  ${basename(path)}: no folders array found`);
  return null;
}

// -- Process one map export --

function processFile(inputPath, externalFolders) {
  const name = basename(inputPath);
  let mapData;
  try {
    mapData = JSON.parse(readFileSync(inputPath, "utf-8"));
  } catch (e) {
    console.error(`  SKIP ${name}: ${e.message}`);
    return false;
  }

  const coords = mapData.customCoordinates || mapData.locations;
  if (!coords || !Array.isArray(coords)) {
    console.error(`  SKIP ${name}: no customCoordinates found`);
    return false;
  }

  const folders = externalFolders || extractEmbeddedFolders(mapData);
  if (!folders) {
    console.error(`  SKIP ${name}: no folder data found (pass -f folders.json)`);
    return false;
  }

  const renameMap = buildRenameMap(folders);
  const orderMap = buildOrderMap(folders);
  let renamed = 0;
  let skippedAliases = 0;

  // Count aliases (tags appearing in multiple folders)
  const tagFolderCount = new Map();
  const countTags = (fl) => {
    for (const tag of fl.tags || []) {
      tagFolderCount.set(tag, (tagFolderCount.get(tag) || 0) + 1);
    }
    for (const child of fl.children || []) countTags(child);
  };
  for (const f of folders) countTags(f);
  for (const [, count] of tagFolderCount) {
    if (count > 1) skippedAliases++;
  }

  // Rename tags on each location, mark storage-only locations for removal
  const storageLocIndices = new Set();
  for (let i = 0; i < coords.length; i++) {
    const loc = coords[i];
    const tags = loc.extra?.tags;
    if (!Array.isArray(tags)) continue;
    if (tags.every((t) => isStorageTag(t))) storageLocIndices.add(i);
    loc.extra.tags = tags
      .filter((t) => !isStorageTag(t))
      .map((t) => {
        const newName = renameMap.get(t);
        if (newName) {
          renamed++;
          return newName;
        }
        return t;
      });
  }

  // Strip storage-only locations
  if (mapData.customCoordinates) {
    mapData.customCoordinates = mapData.customCoordinates.filter((_, i) => !storageLocIndices.has(i));
  }

  // Rename tag definitions
  if (mapData.extra?.tags) {
    const newDefs = {};
    for (const [tagName, def] of Object.entries(mapData.extra.tags)) {
      if (isStorageTag(tagName)) continue;
      const newName = renameMap.get(tagName);
      const ord = orderMap.get(tagName);
      if (ord !== undefined && def && typeof def === "object") def.order = ord;
      newDefs[newName || tagName] = def;
    }
    mapData.extra.tags = newDefs;
  }

  // Carry folder colors as virtual tags under the map's settings (MMA colors folder
  // nodes from these). settings is a map field, so it rides in extra alongside tags.
  const virtualTags = buildVirtualTags(folders);
  const folderColors = Object.keys(virtualTags).length;
  if (folderColors) {
    if (!mapData.extra) mapData.extra = {};
    if (!mapData.extra.settings) mapData.extra.settings = {};
    mapData.extra.settings.virtualTags = virtualTags;
  }

  const outName = name.replace(/\.json$/, "-mma.json");
  const outPath = outDir
    ? join(outDir, outName)
    : join(dirname(inputPath), outName);
  writeFileSync(outPath, JSON.stringify(mapData, null, 2), "utf-8");

  console.log(
    `  ${name} -> ${basename(outPath)}  (${renameMap.size} tags mapped, ${renamed} references renamed, ${folderColors} folder colors)`
  );
  if (skippedAliases > 0) {
    console.log(
      `    ${skippedAliases} tag(s) appear in multiple folders — first folder wins`
    );
  }

  return true;
}

// -- Main --

const externalFolders = foldersPath ? loadExternalFolders(foldersPath) : null;
if (foldersPath && !externalFolders) process.exit(1);

console.log(`Processing ${inputPaths.length} file(s)...`);
let ok = 0;
let fail = 0;
for (const p of inputPaths) {
  if (processFile(p, externalFolders)) ok++;
  else fail++;
}
console.log(`\nDone: ${ok} converted${fail ? `, ${fail} skipped` : ""}`);
