import { cmd } from "@/lib/commands";
import { log } from "@/lib/util/log";

/** A fixup for one persisted blob, mutating the parsed value in place. Runs on every read, so it
 * must be idempotent: that lets migrations work without a stored schema version. */
export type Migration = (stored: Record<string, unknown>) => void;

export interface StoredMigration {
	since: string;
	key: string;
	describe: string;
	apply: Migration;
}

/** Oldest app version whose preference blobs are migrated rather than reset to defaults. */
export const SUPPORTED_FROM = "0.9.0";

/** Historical persisted-shape migrations, oldest first. Keep entries literal and idempotent. */
export const MIGRATIONS: StoredMigration[] = [
	{
		since: "0.9.2",
		key: "appSettings",
		describe: "marker/active/preview/panoDot/polygon/tagFolder colors: {r,g,b} -> [r,g,b]",
		apply: (stored) => {
			const keys = [
				"markerColor",
				"activeLocationColor",
				"importPreviewColor",
				"panoDotColor",
				"polygonColor",
				"tagFolderColor",
			];
			for (const key of keys) {
				const value = stored[key];
				if (value && !Array.isArray(value)) {
					const { r, g, b } = value as { r: number; g: number; b: number };
					stored[key] = [r, g, b];
				}
			}
		},
	},
	{
		since: "0.9.3",
		key: "appSettings",
		describe: "savedSelections moved to SQLite; drop from localStorage",
		apply: (stored) => {
			delete stored.savedSelections;
		},
	},
];

export function migrationsFor(key: string): Migration[] {
	return MIGRATIONS.filter((migration) => migration.key === key).map(
		(migration) => migration.apply,
	);
}

/** Compare dotted numeric versions. Returns negative, zero, or positive. */
export function compareVersions(a: string, b: string): number {
	const left = a.split(".").map(Number);
	const right = b.split(".").map(Number);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const difference = (left[i] ?? 0) - (right[i] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

// --- One-time handoffs (delete once every install has upgraded) ---

let importedSavedSelections = false;

/** Hands the pre-0.9.3 `savedSelections` array to Rust, once per window. Reads the raw
 *  blob rather than going through settings, whose migrations have already dropped the key
 *  from the parsed value. Rust ignores the payload if it already holds any rules. */
export async function importLegacySavedSelections(): Promise<void> {
	if (importedSavedSelections) return;
	importedSavedSelections = true;
	let json: string;
	try {
		const raw = localStorage.getItem("appSettings");
		const list = raw ? (JSON.parse(raw) as { savedSelections?: unknown[] }).savedSelections : null;
		if (!Array.isArray(list) || list.length === 0) return;
		json = JSON.stringify(list);
	} catch (e) {
		log.warn("[saved-selections] unreadable legacy blob:", e);
		return;
	}
	await cmd
		.storeImportLegacySavedSelections(json)
		.catch((e) => log.error("[saved-selections] legacy import failed:", e));
}
