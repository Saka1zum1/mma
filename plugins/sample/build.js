const mmaExternals = require("../mma-externals");

require("esbuild").build({
	entryPoints: ["src/index.ts"],
	bundle: true,
	format: "esm",
	outfile: "index.js",
	plugins: [mmaExternals()],
}).catch(() => process.exit(1));
