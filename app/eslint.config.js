import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import noDuplicateCommandIcons from "./eslint-rules/no-duplicate-command-icons.js";

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
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			"react-hooks/refs": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/immutability": "off",
			"react-hooks/preserve-manual-memoization": "off",
			"no-console": "error",
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
		files: ["src/store/commandDefs.ts"],
		plugins: { local: { rules: { "no-duplicate-command-icons": noDuplicateCommandIcons } } },
		rules: { "local/no-duplicate-command-icons": "error" },
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
