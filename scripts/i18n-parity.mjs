import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const en = fs.readFileSync(path.join(root, "../app/src/locales/en.ts"), "utf8");
const zh = fs.readFileSync(path.join(root, "../app/src/locales/zh-Hans.ts"), "utf8");
const keyRe = /^\t"([^"]+)":/gm;
const enKeys = [...en.matchAll(keyRe)].map((m) => m[1]);
const zhKeys = new Set([...zh.matchAll(keyRe)].map((m) => m[1]));
const missing = enKeys.filter((k) => !zhKeys.has(k));
console.log("en keys:", enKeys.length);
console.log("zh keys:", zhKeys.size);
console.log("missing in zh:", missing.length);
if (missing.length) console.log(missing.join("\n"));
