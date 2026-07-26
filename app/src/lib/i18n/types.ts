/**
 * Built-in UI locales. Add a new entry here, drop a matching catalog under
 * `src/locales/`, and register it in `catalogs.ts` to ship another language.
 */
export const LOCALES = {
	en: "English",
	"zh-Hans": "简体中文",
} as const;

export type AppLocale = keyof typeof LOCALES;

export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: string): value is AppLocale {
	return value in LOCALES;
}

/** BCP 47 tag for Intl formatters. */
export function toBcp47(locale: AppLocale): string {
	return locale === "zh-Hans" ? "zh-CN" : locale;
}

export type MessageParams = Record<string, string | number | boolean>;
