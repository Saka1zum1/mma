import { emit, useEventValue } from "@/lib/events";
import { getSettings } from "@/store/settings";
import { catalogs, type MessageKey } from "@/locales";
import { en } from "@/locales/en";
import { interpolate } from "./interpolate";
import {
	DEFAULT_LOCALE,
	LOCALES,
	isAppLocale,
	toBcp47,
	type AppLocale,
	type MessageParams,
} from "./types";

export type { AppLocale, MessageParams, MessageKey };
export { LOCALES, DEFAULT_LOCALE, isAppLocale, toBcp47 };
export { commandLabel, hotkeyLabel, idToCamelCase, pluginCatalogName, pluginCatalogDescription } from "./labels";

let locale: AppLocale = DEFAULT_LOCALE;

function readStoredLocale(): AppLocale {
	try {
		const stored = getSettings().language;
		if (isAppLocale(stored)) return stored;
	} catch {
		// settings may be unavailable during very early init
	}
	return DEFAULT_LOCALE;
}

/** Apply locale side effects (html lang + formatters). */
function applyLocaleSideEffects(next: AppLocale) {
	if (typeof document !== "undefined") {
		document.documentElement.lang = toBcp47(next);
	}
}

export function getLocale(): AppLocale {
	return locale;
}

export function setLocale(next: AppLocale) {
	if (locale === next) return;
	locale = next;
	applyLocaleSideEffects(next);
	emit("locale:changed");
}

/** Resolve catalog string; falls back to English, then the key itself. */
export function lookup(key: MessageKey): string {
	const pack = catalogs[locale];
	const hit = pack[key];
	if (hit !== undefined) return hit;
	return en[key] ?? key;
}

/** Translate a message key with optional `{param}` interpolation. */
export function t(key: MessageKey, params?: MessageParams): string {
	return interpolate(lookup(key), params);
}

/** Bases that have `.one` / `.other` variants in the English catalog. */
export type PluralBase = {
	[K in MessageKey]: K extends `${infer B}.one` ? B : never;
}[MessageKey];

/**
 * Plural-aware translate. Looks up `key.one` / `key.other` (etc.) via
 * `Intl.PluralRules`, then falls back to `key.other`.
 */
export function tp(key: PluralBase, count: number, params?: MessageParams): string {
	const rules = new Intl.PluralRules(toBcp47(locale));
	const form = rules.select(count);
	const candidates = [`${key}.${form}`, `${key}.other`] as MessageKey[];
	for (const candidate of candidates) {
		if (candidate in en) {
			return interpolate(lookup(candidate), { count, ...params });
		}
	}
	return String(count);
}

/** React: re-render when locale changes; returns the `t` / `tp` helpers. */
export function useT() {
	useEventValue("locale:changed", getLocale);
	return { t, tp, locale } as const;
}

/** Boot from settings (call once at app start). Idempotent. */
export function initI18n() {
	const next = readStoredLocale();
	locale = next;
	applyLocaleSideEffects(next);
}

/** Keep i18n in sync when `settings.language` changes. */
export function syncLocaleFromSettings() {
	const next = readStoredLocale();
	setLocale(next);
}
