// Shared build script for all MMA plugins.
//
// Usage:
//   node plugins/build-plugin.mjs plugins/heatmap          # build one plugin
//   node plugins/build-plugin.mjs plugins/heatmap --watch   # watch mode
//   node plugins/build-plugin.mjs                           # build all plugins
//
// Auto-detects entry point (src/index.tsx > src/index.ts) and applies JSX
// config only when needed.

import { build, context } from "esbuild";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mmaExternals = require("./mma-externals.js");
const pluginsDir = dirname(fileURLToPath(import.meta.url));

function buildOpts(pluginDir) {
	const tsx = existsSync(join(pluginDir, "src/index.tsx"));
	const entry = tsx ? "src/index.tsx" : "src/index.ts";
	if (!existsSync(join(pluginDir, entry))) {
		throw new Error(`No entry point found in ${pluginDir} (tried src/index.tsx, src/index.ts)`);
	}

	const opts = {
		entryPoints: [join(pluginDir, entry)],
		bundle: true,
		format: "esm",
		outfile: join(pluginDir, "index.js"),
		plugins: [mmaExternals()],
	};

	if (tsx) {
		opts.jsx = "automatic";
		opts.jsxImportSource = "react";
	}

	return opts;
}

function discoverPlugins() {
	return readdirSync(pluginsDir)
		.map((name) => join(pluginsDir, name))
		.filter(
			(dir) =>
				statSync(dir).isDirectory() &&
				(existsSync(join(dir, "src/index.tsx")) || existsSync(join(dir, "src/index.ts"))) &&
				existsSync(join(dir, "manifest.json")),
		)
		.sort();
}

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const dirs = args.filter((a) => !a.startsWith("--"));

const targets = dirs.length > 0 ? dirs.map((d) => resolve(d)) : discoverPlugins();

if (watch) {
	for (const dir of targets) {
		const name = dir.slice(pluginsDir.length + 1);
		const ctx = await context(buildOpts(dir));
		await ctx.watch();
		console.log(`[${name}] watching`);
	}
} else {
	const results = await Promise.allSettled(
		targets.map(async (dir) => {
			const name = dir.slice(pluginsDir.length + 1);
			await build(buildOpts(dir));
			return name;
		}),
	);

	let failed = 0;
	for (const r of results) {
		if (r.status === "fulfilled") {
			console.log(`[${r.value}] ok`);
		} else {
			failed++;
			console.error(r.reason.message || r.reason);
		}
	}
	if (failed) process.exit(1);
}
