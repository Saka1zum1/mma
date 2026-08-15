import { en } from "@/locales/en";
import type { MessageKey } from "@/locales";
import { t } from "@/lib/i18n";

/** Convert registry ids like `bulk-download-panoramas` to `bulkDownloadPanoramas`. */
export function idToCamelCase(id: string): string {
	return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Localized command palette / pinned toolbar label for a command id. */
export function commandLabel(id: string): string {
	return t(`command.${idToCamelCase(id)}` as MessageKey);
}

/** Localized settings hotkey label for an action id (command or static hotkey). */
export function hotkeyLabel(action: string): string {
	const quicktag = /^quicktag(\d+)$/.exec(action);
	if (quicktag) return t("hotkey.quicktagSlot", { n: quicktag[1] });
	const cmdKey = `command.${idToCamelCase(action)}` as MessageKey;
	if (cmdKey in en) return t(cmdKey);
	return t(`hotkey.${action}` as MessageKey);
}

/** Localized plugin marketplace name; falls back to manifest/registry value. */
export function pluginCatalogName(id: string, fallback: string): string {
	const key = `plugins.catalog.${id}.name` as MessageKey;
	return key in en ? t(key) : fallback;
}

/** Localized plugin marketplace description; falls back to manifest/registry value. */
export function pluginCatalogDescription(id: string, fallback: string): string {
	const key = `plugins.catalog.${id}.description` as MessageKey;
	return key in en ? t(key) : fallback;
}
