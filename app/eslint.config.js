import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import noDuplicateCommandIcons from "./eslint-rules/no-duplicate-command-icons.js";
import noIpcInLoop from "./eslint-rules/no-ipc-in-loop.js";

export default defineConfig([
	globalIgnores(["dist", "src/bindings.gen.ts", "src/components/manual/manual-img-dims.gen.ts"]),
	{
		files: ["**/*.{ts,tsx}"],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
		],
		plugins: {
			local: {
				rules: {
					"no-ipc-in-loop": noIpcInLoop,
					"no-duplicate-command-icons": noDuplicateCommandIcons,
				},
			},
		},
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			"react-hooks/refs": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/immutability": "off",
			"react-hooks/preserve-manual-memoization": "off",
			"no-console": "error",
			"local/no-ipc-in-loop": "warn",
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@tauri-apps/api/core",
							importNames: ["invoke"],
							message: "Use the typed cmd proxy (lib/commands.ts) instead of raw invoke().",
						},
					],
				},
			],
			"no-restricted-syntax": [
				"error",
				{
					selector: "JSXOpeningElement[name.name='select']",
					message: "Use <NSelect> (@/components/primitives/NSelect) instead of a raw <select>.",
				},
				{
					selector:
						"JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='radio']",
					message: 'Use <Radio> (@/components/primitives/Radio) instead of a raw <input type="radio">.',
				},
				{
					selector:
						"JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='checkbox']",
					message:
						'Use <Checkbox> (@/components/primitives/Checkbox) instead of a raw <input type="checkbox">.',
				},
				{
					selector: "CallExpression[callee.name=/^(confirm|alert|prompt)$/]",
					message: "Native confirm()/alert()/prompt() hang in WebView2 - use a Radix dialog instead.",
				},
				{
					selector: "AssignmentExpression[left.property.name='innerHTML']",
					message: "No raw innerHTML - use React or textContent.",
				},
				{
					selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
					message: "No insertAdjacentHTML - use React or DOM APIs.",
				},
			],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["src/api.ts", "src/App.tsx"],
		rules: { "no-restricted-imports": "off" },
	},
	{
		files: ["src/store/commandDefs.ts"],
		rules: { "local/no-duplicate-command-icons": "error" },
	},
	{
		// The sanctioned raw form builtins: these primitives wrap them.
		files: [
			"src/components/primitives/NSelect.tsx",
			"src/components/primitives/Radio.tsx",
			"src/components/primitives/Checkbox.tsx",
		],
		rules: { "no-restricted-syntax": "off" },
	},
	{
		// Node-side runner config: console reporting + ANSI stripping are legitimate.
		files: ["wdio.conf.ts"],
		rules: { "no-console": "off", "no-control-regex": "off" },
	},
	{
		files: [
			"test/e2e/benchmarks.test.ts",
			"test/e2e/bulk-import-rust.test.ts",
			"test/e2e/perf-import.test.ts",
			"test/e2e/perf-render.test.ts",
			"test/e2e/perf-sel.test.ts",
			"test/e2e/speed-matrix.test.ts",
		],
		rules: { "no-console": "off" },
	},
	{
		files: ["test/e2e/**/*.ts"],
		ignores: ["test/e2e/helpers.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: "Literal[value='__TAURI_INTERNALS__']",
					message: "Use withApi() from helpers instead of raw __TAURI_INTERNALS__",
				},
				{
					selector: "MemberExpression[property.name='__TAURI_INTERNALS__']",
					message: "Use withApi() from helpers instead of raw __TAURI_INTERNALS__",
				},
				{
					selector: "Literal[value='__TEST_API__']",
					message: "Use withApi() from helpers instead of raw __TEST_API__",
				},
				{
					selector: "MemberExpression[property.name='__TEST_API__']",
					message: "Use withApi() from helpers instead of raw __TEST_API__",
				},
				{
					selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
					message:
						"No fixed sleeps in e2e — use a waitFor* helper (waitForActive/waitForWorkArea/waitForLocCount/waitForSave/waitForFlag/waitForOptions, or browser.waitUntil) that polls the real post-condition. For a genuine 'wait for X to NOT happen' settle, add an inline eslint-disable with a reason.",
				},
			],
		},
	},
]);
