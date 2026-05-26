// esbuild plugin — rewrites imports of app-bundled libraries to runtime lookups.
// Use in your plugin's build.js:
//
//   const mmaExternals = require("../mma-externals");
//   require("esbuild").build({
//     ...
//     plugins: [mmaExternals()],
//   });

const DEFAULT_EXTERNALS = [
	"react",
	"react-dom",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"@deck.gl/core",
	"@deck.gl/layers",
	"@deck.gl/google-maps",
	"@luma.gl/core",
	"@luma.gl/engine",
	"@luma.gl/shadertools",
	"@luma.gl/webgl",
];

module.exports = function mmaExternals(opts) {
	const externals = (opts && opts.externals) || DEFAULT_EXTERNALS;
	const escaped = externals.map(function (e) {
		return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	});
	const filter = new RegExp("^(" + escaped.join("|") + ")$");

	return {
		name: "mma-externals",
		setup: function (build) {
			build.onResolve({ filter: filter }, function (args) {
				return { path: args.path, namespace: "mma-ext" };
			});
			build.onLoad({ filter: /.*/, namespace: "mma-ext" }, function (args) {
				return {
					contents: 'module.exports = globalThis.__mma_require("' + args.path + '");',
					loader: "js",
				};
			});
		},
	};
};
