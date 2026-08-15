import type { AppLocale } from "@/lib/i18n/types";
import { en, type MessageCatalog, type MessageKey } from "./en";
import { zhHans } from "./zh-Hans";

/** Structured fork catalogs (plugin keys). Other locales fall back via initLocale JSON merge. */
export const catalogs: Record<AppLocale, Partial<MessageCatalog> | MessageCatalog> = {
	en,
	de: {},
	es: {},
	fr: {},
	ja: {},
	pl: {},
	ru: {},
	"zh-Hans": zhHans,
	"en-XA": {},
};

export type { MessageCatalog, MessageKey };
