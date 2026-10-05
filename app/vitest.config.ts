import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	test: {
		globals: true,
		exclude: ["test/e2e/**", "test/integration/**", "procedures/**", "node_modules/**"],
		// Pinned to a positive half-hour offset: local-vs-UTC frame bugs are invisible when
		// tests run in UTC, and a whole-hour zone hides sub-hour arithmetic.
		env: { TZ: "Asia/Kolkata" },
		// Node's own Web Storage holds nothing without a backing file and warns on every read.
		// The flag exists from Node 25; older Nodes reject it.
		...(Number(process.versions.node.split(".")[0]) >= 25
			? { execArgv: ["--no-webstorage"] }
			: {}),
	},
});
