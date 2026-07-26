import fs from "fs";
import path from "path";

function walk(d, a = []) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name);
		if (e.isDirectory() && e.name !== "manual") walk(p, a);
		else if (/\.(tsx|ts)$/.test(e.name)) a.push(p);
	}
	return a;
}

const roots = ["app/src/components", "app/src/plugins", "app/src/App.tsx"].flatMap((r) => {
	const p = path.join("d:/github/mma", r);
	return fs.existsSync(p) && fs.statSync(p).isFile() ? [p] : walk(p, []);
});

const patterns = [
	/title="([^"]+)"/g,
	/label="([^"]+)"/g,
	/placeholder="([^"]+)"/g,
	/aria-label="([^"]+)"/g,
	/ariaLabel="([^"]+)"/g,
	/<GroupHeading>([^<]+)</g,
	/<Button[^>]*>([^<{]+)</g,
	/<DialogContent title="([^"]+)"/g,
	/toast\("([^"]+)"/g,
	/toast\(`([^`$]+)`/g,
];

const hits = new Map();
for (const f of roots) {
	const s = fs.readFileSync(f, "utf8");
	if (s.includes("useT(") && !s.match(/title="|label="|toast\("/)) continue;
	for (const re of patterns) {
		for (const m of s.matchAll(re)) {
			const t = m[1].trim();
			if (t.length < 2 || t.length > 120) continue;
			if (/^\{/.test(t)) continue;
			hits.set(t, (hits.get(t) || 0) + 1);
		}
	}
}

console.log([...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join("\n"));
