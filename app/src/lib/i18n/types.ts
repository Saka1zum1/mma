/**
 * Built-in UI locales. JSON catalogs live under `src/locales/`.
 * Structured fork catalogs (`en.ts` / `zh-Hans.ts`) merge in at init for plugin keys.
 */
export const LOCALES = {
	en: "English",
	de: "Deutsch",
	es: "Español",
	fr: "Français",
	ja: "日本語",
	pl: "Polski",
	ru: "Русский",
	"zh-Hans": "简体中文",
	"en-XA": "Pseudolocale",
} as const;

export type AppLocale = keyof typeof LOCALES;

export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: string): value is AppLocale {
	return value in LOCALES;
}

/** BCP 47 tag for Intl formatters. */
export function toBcp47(locale: AppLocale | string): string {
	if (locale === "zh-Hans") return "zh-CN";
	if (locale === "en-XA") return "en";
	return locale;
}

export type MessageParams = Record<string, string | number | boolean>;
