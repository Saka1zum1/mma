/** Compare locale JSON key coverage (en vs each other locale). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const locales = path.join(root, "../app/src/locales");
const en = JSON.parse(fs.readFileSync(path.join(locales, "en.json"), "utf8"));
const enKeys = Object.keys(en).sort();

console.log("en keys:", enKeys.length);
for (const f of fs.readdirSync(locales).filter((x) => x.endsWith(".json") && x !== "en.json")) {
	const cat = JSON.parse(fs.readFileSync(path.join(locales, f), "utf8"));
	const keys = new Set(Object.keys(cat));
	const missing = enKeys.filter((k) => !keys.has(k));
	const orphans = [...keys].filter((k) => !(k in en)).sort();
	console.log(`${f}: missing ${missing.length}, orphans ${orphans.length}`);
	if (missing.length) console.log(missing.slice(0, 20).join("\n"));
	if (orphans.length) console.log("orphans:", orphans.slice(0, 20).join("\n"));
}
