import { defineConfig } from "oxlint";

const RESTRICTED_IMPORT_PATHS = [
	{
		name: "@tauri-apps/api/core",
		importNames: ["invoke"],
		message: "Use the typed cmd proxy (lib/commands.ts) instead of raw invoke().",
	},
];

const USE_SYNC_EXTERNAL_STORE_BAN = {
	selector:
		"ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name='useSyncExternalStore']",
	message:
		"Use useEvent/useEventValue from @/lib/events instead of raw useSyncExternalStore. The event system handles subscribe + versioning centrally.",
};

const QUERY_COMMANDS =
	"/^store(Resolve|Count|CountBy|Bounds|Sample|Spaced|Values|Coverage|Columns|GroupBy|Collect)$/";

/** The store's query surface is named vocabulary, not raw IPC: `fieldCoverage`, not
 *  `cmd.storeCoverage`. Only useMapStore may reach past the wrappers. */
const QUERY_CMD_BAN = {
	selector: `MemberExpression[property.name=${QUERY_COMMANDS}]:matches([object.name='cmd'], [object.property.name='cmd'])`,
	message:
		"Query commands go through their named wrapper in store/useMapStore (resolveIds, countIn, fetchBounds, sampleFrom, fieldValues, countBy, fieldCoverage, fetchColumns, partition, fetchLocations), not raw cmd.",
};

const RESTRICTED_SYNTAX = [
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
		selector: "AssignmentExpression[left.property.name='innerHTML']",
		message: "No raw innerHTML - use React or textContent.",
	},
	{
		selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
		message: "No insertAdjacentHTML - use React or DOM APIs.",
	},
];

const E2E_BRIDGE_RULES = [
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
			"No fixed sleeps in e2e. Wait on the real post-condition with a waitFor* helper or browser.waitUntil.",
	},
];

export default defineConfig({
	plugins: ["typescript", "react"],
	jsPlugins: ["./lint-rules/index.js"],
	categories: { correctness: "off" },
	env: { browser: true },
	ignorePatterns: [
		"**/*.{js,mjs,cjs}",
		"dist",
		"src/bindings.gen.ts",
		"src/components/manual/manual-img-dims.gen.ts",
		"procedures",
		"src-tauri",
	],
	rules: {
		"no-console": "error",
		"no-unused-vars": [
			"error",
			{
				argsIgnorePattern: "^_",
				varsIgnorePattern: "^_",
				destructuredArrayIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_",
			},
		],
		"react/rules-of-hooks": "error",
		"react/exhaustive-deps": "warn",
		"typescript/no-explicit-any": "error",
		"typescript/no-unused-vars": "off",
		"no-restricted-imports": ["error", { paths: RESTRICTED_IMPORT_PATHS }],
		"local/restricted-syntax": [
			"error",
			...RESTRICTED_SYNTAX,
			USE_SYNC_EXTERNAL_STORE_BAN,
			QUERY_CMD_BAN,
		],
		"local/no-ipc-in-loop": "warn",
		"local/no-redundant-mutate-guard": "warn",
		"local/no-selection-alias": "warn",
		"local/no-primitive-class": "warn",
		"local/no-effect-event-in-memo": "error",
		"local/no-native-dialog": "error",
		"local/no-undefined-css-class": "warn",
	},
	overrides: [
		{
			files: ["src/store/**/*.ts"],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						paths: [
							...RESTRICTED_IMPORT_PATHS,
							{
								name: "@tauri-apps/plugin-dialog",
								message:
									"File dialogs belong in components, not the store. Call the dialog in the component, pass the result to a store function.",
							},
						],
					},
				],
			},
		},
		{
			files: [
				"src/lib/events.ts",
				"src/store/selectorPick.ts",
				"src/lib/hooks/useLocalStorage.ts",
				"src/plugins/generator/ui/progressSignal.ts",
			],
			rules: { "local/restricted-syntax": ["error", ...RESTRICTED_SYNTAX] },
		},
		{
			files: ["src/store/useMapStore.ts"],
			rules: {
				"local/restricted-syntax": ["error", ...RESTRICTED_SYNTAX, USE_SYNC_EXTERNAL_STORE_BAN],
			},
		},
		{
			files: ["src/api.ts", "src/lib/tauri.ts", "src/App.tsx"],
			rules: { "no-restricted-imports": "off" },
		},
		{
			files: ["src/store/commandDefs.ts"],
			rules: { "local/no-duplicate-command-icons": "error" },
		},
		{
			files: [
				"src/components/primitives/NSelect.tsx",
				"src/components/primitives/Radio.tsx",
				"src/components/primitives/Checkbox.tsx",
			],
			rules: { "local/restricted-syntax": "off" },
		},
		{
			files: ["wdio.conf.ts"],
			rules: { "no-console": "off", "no-control-regex": "off" },
		},
		{
			files: ["test/**/*.{ts,tsx}"],
			rules: {
				"local/no-undefined-css-class": "off",
				"local/no-primitive-class": "off",
				"local/restricted-syntax": "off",
			},
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
			rules: { "local/restricted-syntax": ["error", ...E2E_BRIDGE_RULES] },
		},
	],
});
