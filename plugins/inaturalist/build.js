const mmaExternals = require("../mma-externals");
const esbuild = require("esbuild");

const opts = {
	entryPoints: ["src/index.tsx"],
	bundle: true,
	format: "esm",
	outfile: "index.js",
	jsx: "automatic",
	jsxImportSource: "react",
	plugins: [mmaExternals()],
};

if (process.argv.includes("--watch")) {
	esbuild.context(opts).then((ctx) => ctx.watch());
} else {
	esbuild.build(opts).catch(() => process.exit(1));
}
