import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import path from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
		},
		// PSV and lookaround must share one three — nested copies break Matrix4 APIs
		// (e.g. determinantAffine missing when versions diverge).
		dedupe: ["three"],
	},
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version),
	},
	clearScreen: false,
	plugins: [{ ...mdx({ include: /\.mdx$/ }), enforce: "pre" }, react({ include: /\.(jsx|js|mdx|tsx|ts)$/ })],
	server: {
		strictPort: true,
		watch: {
			ignored: ["**/src-tauri/**"],
		},
	},
	optimizeDeps: {
		include: [
			"@deck.gl/core",
			"@deck.gl/layers",
			"@deck.gl/google-maps",
			"@luma.gl/core",
			"@luma.gl/shadertools",
			"@luma.gl/engine",
			"@luma.gl/webgl",
		],
	},
});
