import { t } from "@/lib/i18n";
import {
	COMMAND_LABELS,
	HOTKEY_LABELS,
	PLUGIN_CATALOG_DESCRIPTIONS,
	PLUGIN_CATALOG_NAMES,
} from "./labelMaps";

/** Convert registry ids like `bulk-download-panoramas` to `bulkDownloadPanoramas`. */
export function idToCamelCase(id: string): string {
	return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Localized command palette / pinned toolbar label for a command id. */
export function commandLabel(id: string): string {
	const en = COMMAND_LABELS[idToCamelCase(id)] ?? COMMAND_LABELS[id];
	return en ? t(en) : id;
}

/** Localized settings hotkey label for an action id (command or static hotkey). */
export function hotkeyLabel(action: string): string {
	const quicktag = /^quicktag(\d+)$/.exec(action);
	if (quicktag) {
		const en = HOTKEY_LABELS.quicktagSlot ?? "Quick-tag slot {n}";
		return t(en, { n: quicktag[1] });
	}
	const cmd = COMMAND_LABELS[idToCamelCase(action)] ?? COMMAND_LABELS[action];
	if (cmd) return t(cmd);
	const hotkey = HOTKEY_LABELS[action];
	return hotkey ? t(hotkey) : action;
}

/** Localized plugin marketplace name; falls back to manifest/registry value. */
export function pluginCatalogName(id: string, fallback: string): string {
	const en = PLUGIN_CATALOG_NAMES[id];
	return en ? t(en) : fallback;
}

/** Localized plugin marketplace description; falls back to manifest/registry value. */
export function pluginCatalogDescription(id: string, fallback: string): string {
	const en = PLUGIN_CATALOG_DESCRIPTIONS[id];
	return en ? t(en) : fallback;
}
