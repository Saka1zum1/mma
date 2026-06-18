// Build every plugin (any dir with a build.js) concurrently, then regenerate
// registry.json once all builds finish. Run: node plugins/build-all.mjs
import { exec as execCb, execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execCb);
const pluginsDir = dirname(fileURLToPath(import.meta.url));

const plugins = readdirSync(pluginsDir)
	.map((name) => join(pluginsDir, name))
	.filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, "build.js")))
	.sort();

// Build each plugin independently; capture output so concurrent logs stay legible.
async function buildPlugin(dir) {
	const name = dir.slice(pluginsDir.length + 1);
	if (!existsSync(join(dir, "node_modules"))) {
		// Prefer `npm ci` (exact, lockfile-driven) so builds are reproducible in CI.
		const install = existsSync(join(dir, "package-lock.json")) ? "npm ci" : "npm install";
		await exec(install, { cwd: dir });
	}
	const { stdout, stderr } = await exec("npm run build", { cwd: dir });
	return { name, output: (stdout + stderr).trim() };
}

const results = await Promise.allSettled(plugins.map(buildPlugin));

const failures = [];
results.forEach((r, i) => {
	const name = plugins[i].slice(pluginsDir.length + 1);
	if (r.status === "fulfilled") {
		console.log(`[${name}] ok`);
	} else {
		failures.push(name);
		const e = r.reason;
		console.error(`[${name}] FAILED\n${(e.stdout || "") + (e.stderr || e.message || "")}`);
	}
});

// Registry must run after the barrier — it reads every plugin's manifest.
console.log("\n[registry] regenerating...");
try {
	execSync("node generate-registry.js", { cwd: pluginsDir, stdio: "inherit" });
} catch {
	failures.push("registry");
}

if (failures.length) {
	console.error(`\nFAILED: ${failures.join(", ")}`);
	process.exit(1);
}
console.log(`\nBuilt ${plugins.length} plugin${plugins.length !== 1 ? "s" : ""}.`);
